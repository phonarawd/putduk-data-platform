-- Atomic deposit-info PIN failure accounting and withdrawal completion invariant.
-- Mirrors the effective Production definitions recorded under remote migration 20260923024033.

create or replace function public.putduk_security_pin_register_failure(
  p_user_id uuid,
  p_ip_hash text default null
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public, private
as $function$
declare
  v_user_failed integer;
  v_user_locked_until timestamptz;
  v_ip_failed integer;
  v_ip_locked_until timestamptz;
  v_now timestamptz := now();
begin
  perform private.putduk_assert_live_member(p_user_id);

  update private.security_pins
  set failed_attempts = coalesce(failed_attempts, 0) + 1,
      locked_until = case
        when coalesce(failed_attempts, 0) + 1 >= 5 then v_now + interval '15 minutes'
        else locked_until
      end,
      updated_at = v_now
  where user_id = p_user_id
  returning failed_attempts, locked_until into v_user_failed, v_user_locked_until;

  if v_user_failed is null then
    raise exception using errcode = '42501', message = '보안 PIN을 먼저 만들어 주세요.';
  end if;

  if p_ip_hash is not null and length(trim(p_ip_hash)) > 0 then
    insert into private.security_pin_ip_locks (ip_hash, failed_attempts, locked_until, updated_at)
    values (trim(p_ip_hash), 1, null, v_now)
    on conflict (ip_hash) do update
      set failed_attempts = coalesce(private.security_pin_ip_locks.failed_attempts, 0) + 1,
          locked_until = case
            when coalesce(private.security_pin_ip_locks.failed_attempts, 0) + 1 >= 5
              then v_now + interval '15 minutes'
            else private.security_pin_ip_locks.locked_until
          end,
          updated_at = v_now;

    select failed_attempts, locked_until
      into v_ip_failed, v_ip_locked_until
    from private.security_pin_ip_locks
    where ip_hash = trim(p_ip_hash);
  end if;

  return jsonb_build_object(
    'user', jsonb_build_object(
      'attempts', v_user_failed,
      'remaining', greatest(0, 5 - v_user_failed),
      'locked', v_user_locked_until is not null and v_user_locked_until > v_now,
      'locked_until', v_user_locked_until
    ),
    'ip', case
      when v_ip_failed is null then null
      else jsonb_build_object(
        'attempts', v_ip_failed,
        'remaining', greatest(0, 5 - v_ip_failed),
        'locked', v_ip_locked_until is not null and v_ip_locked_until > v_now,
        'locked_until', v_ip_locked_until
      )
    end
  );
end;
$function$;

create or replace function public.putduk_security_pin_clear_failures(
  p_user_id uuid,
  p_ip_hash text default null
)
returns void
language plpgsql
security definer
set search_path = pg_catalog, public, private
as $function$
begin
  perform private.putduk_assert_live_member(p_user_id);

  update private.security_pins
  set failed_attempts = 0, locked_until = null, updated_at = now()
  where user_id = p_user_id;

  if p_ip_hash is not null and length(trim(p_ip_hash)) > 0 then
    update private.security_pin_ip_locks
    set failed_attempts = 0, locked_until = null, updated_at = now()
    where ip_hash = trim(p_ip_hash);
  end if;
end;
$function$;

-- Existing completed/sent requests stay idempotent. New completion attempts
-- require a transaction reference before wallet settlement and terminal status.

create or replace function public.putduk_admin_withdraw_complete(
  p_admin_id uuid,
  p_withdrawal_id uuid,
  p_transaction_reference text default null,
  p_reason text default null
)
returns public.withdrawal_requests
language plpgsql
security definer
set search_path = pg_catalog, public, private, extensions
as $function$
declare
  v_row public.withdrawal_requests%rowtype;
  v_after public.withdrawal_requests%rowtype;
  v_ref text := nullif(left(trim(coalesce(p_transaction_reference, '')), 120), '');
  v_now timestamptz := now();
  v_stipend numeric(18,2);
  v_principal numeric(18,2);
  v_legacy_held numeric(18,2) := 0;
  v_avail_held numeric(18,2) := 0;
begin
  perform private.putduk_assert_admin(p_admin_id, array['super_admin', 'finance']);

  select * into v_row
  from public.withdrawal_requests
  where id = p_withdrawal_id
  for update;

  if not found then
    raise exception using errcode = 'P0002', message = '출금 요청을 찾을 수 없습니다.';
  end if;

  if v_row.status in ('completed', 'sent') then
    return v_row;
  end if;

  if v_ref is null and nullif(trim(coalesce(v_row.transaction_reference, '')), '') is null then
    raise exception using errcode = '22023', message = '송금 거래번호를 입력한 뒤 완료 처리해 주세요.';
  end if;

  if v_row.status not in ('submitted', 'checking', 'approved') then
    raise exception using errcode = '23514', message = '완료할 수 없는 출금 상태입니다.';
  end if;

  v_stipend := round(coalesce(nullif(v_row.stipend_amount, 0), case when (v_row.include_principal or v_row.principal_included) then 0 else v_row.amount end), 2);
  v_principal := round(coalesce(v_row.principal_amount, 0), 2);

  if (v_row.include_principal or v_row.principal_included) and v_principal = 0 and v_stipend = 0 then
    v_principal := v_row.amount;
  end if;
  if (not v_row.include_principal) and v_stipend = 0 then
    v_stipend := v_row.amount;
  end if;

  perform pg_advisory_xact_lock(
    hashtextextended('putduk-wallet:' || v_row.user_id::text || ':' || v_row.currency, 0)
  );
  perform private.putduk_ensure_wallets(v_row.user_id, v_row.currency);

  if v_stipend > 0 then
    select held_amount into v_avail_held
    from public.wallet_accounts
    where user_id = v_row.user_id and bucket = 'available' and currency = v_row.currency
    for update;

    select held_amount into v_legacy_held
    from public.wallet_accounts
    where user_id = v_row.user_id and bucket = 'held' and currency = v_row.currency
    for update;

    if coalesce(v_avail_held, 0) >= v_stipend then
      perform private.putduk_apply_bucket_delta(
        v_row.user_id, 'available', v_row.currency, 0, -v_stipend,
        'withdrawal_completed', 'withdrawal_request', v_row.id,
        'withdrawal-complete-stipend:' || v_row.id::text,
        p_admin_id
      );
    elsif coalesce(v_legacy_held, 0) >= v_stipend then
      perform private.putduk_apply_bucket_delta(
        v_row.user_id, 'held', v_row.currency, 0, -v_stipend,
        'withdrawal_completed', 'withdrawal_request', v_row.id,
        'withdrawal-complete-stipend:' || v_row.id::text,
        p_admin_id
      );
    else
      raise exception using errcode = '23514', message = '출금 보류 금액을 찾을 수 없습니다.';
    end if;
  end if;

  if v_principal > 0 then
    perform private.putduk_apply_bucket_delta(
      v_row.user_id, 'work_balance', v_row.currency, 0, -v_principal,
      'withdrawal_completed', 'withdrawal_request', v_row.id,
      'withdrawal-complete-principal:' || v_row.id::text,
      p_admin_id
    );

    update public.profiles
    set principal_withdraw_count = coalesce(principal_withdraw_count, 0) + 1
    where id = v_row.user_id;
  end if;

  update public.withdrawal_requests
  set status = 'completed',
      transaction_reference = coalesce(v_ref, transaction_reference),
      reviewed_by = p_admin_id,
      reviewed_at = v_now,
      completed_at = v_now,
      completed_by = p_admin_id,
      demotion_applied = false,
      previous_member_tier = null,
      new_member_tier = null,
      line_closed = false,
      stipend_amount = v_stipend,
      principal_amount = v_principal,
      include_principal = coalesce(v_row.include_principal, v_row.principal_included, v_principal > 0),
      principal_included = coalesce(v_row.include_principal, v_row.principal_included, v_principal > 0),
      updated_at = v_now
  where id = v_row.id
  returning * into v_after;

  insert into public.notifications (user_id, title, body, notification_type)
  values (
    v_row.user_id,
    '✅ 출금이 완료됐어요',
    to_char(v_row.amount, 'FM999G999G999G990D00') ||
      case when v_row.currency = 'USDT' then ' USDT' else '원' end ||
      ' 이체가 끝났어요.',
    'finance'
  );

  return v_after;
end;
$function$;

revoke all on function public.putduk_security_pin_register_failure(uuid,text) from public, anon, authenticated;
grant execute on function public.putduk_security_pin_register_failure(uuid,text) to service_role;
revoke all on function public.putduk_security_pin_clear_failures(uuid,text) from public, anon, authenticated;
grant execute on function public.putduk_security_pin_clear_failures(uuid,text) to service_role;
revoke all on function public.putduk_admin_withdraw_complete(uuid,uuid,text,text) from public, anon, authenticated;
grant execute on function public.putduk_admin_withdraw_complete(uuid,uuid,text,text) to service_role;
