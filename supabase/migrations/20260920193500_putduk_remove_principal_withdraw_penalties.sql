-- P0 MASTER 정합성: 원금 출금 자체를 이유로 등급 강등·혜택 박탈·라인 닫힘을 적용하지 않는다.
-- 출금 원장, 보류 금액 정산, 완료 처리 및 원금 출금 횟수 기록은 그대로 유지한다.

begin;

-- 과거 호출 경로가 남아 있어도 회원 상태를 바꾸지 않도록 호환 함수 자체를 무해화한다.
create or replace function private.putduk_apply_principal_penalties(p_user_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public, private
as $$
declare
  v_tier text;
  v_tier_label text;
begin
  select member_tier
    into v_tier
  from public.profiles
  where id = p_user_id;

  if not found then
    raise exception using errcode = 'P0002', message = '회원 정보를 찾을 수 없습니다.';
  end if;

  v_tier_label := private.putduk_normalize_member_tier(v_tier);

  return jsonb_build_object(
    'previous_tier', v_tier_label,
    'new_tier', v_tier_label,
    'line_closed', false,
    'penalty_applied', false
  );
end;
$$;

revoke all on function private.putduk_apply_principal_penalties(uuid) from public, anon, authenticated;
grant execute on function private.putduk_apply_principal_penalties(uuid) to service_role;

comment on function private.putduk_apply_principal_penalties(uuid) is
  '레거시 호환용 무해 함수. 원금 출금으로 회원 등급·혜택·라인 상태를 변경하지 않는다.';

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
as $$
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

    -- 원금 출금 횟수는 운영 이력으로만 기록한다. 등급·혜택·라인에는 영향을 주지 않는다.
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
$$;

revoke all on function public.putduk_admin_withdraw_complete(uuid, uuid, text, text)
  from public, anon, authenticated;
grant execute on function public.putduk_admin_withdraw_complete(uuid, uuid, text, text)
  to service_role;

comment on function public.putduk_admin_withdraw_complete(uuid, uuid, text, text) is
  '출금 완료 정산. 원금 포함 여부와 무관하게 출금 자체로 등급·혜택·라인 상태를 변경하지 않는다.';

commit;
