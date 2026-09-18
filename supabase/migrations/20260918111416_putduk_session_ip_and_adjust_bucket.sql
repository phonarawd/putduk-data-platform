-- 접속 IP가 비면 행이 없어도 남기고, 운영자 잔액 조정의 기본 칸은 출금 가능으로 맞춘다.

create or replace function public.putduk_member_record_session(
  p_user_id uuid,
  p_ip text default null
)
returns void
language plpgsql
security definer
set search_path = pg_catalog, public, private
as $$
declare
  v_ip inet;
begin
  if p_user_id is null then
    raise exception using errcode = '22023', message = '회원 정보가 필요합니다.';
  end if;

  begin
    v_ip := nullif(trim(coalesce(p_ip, '')), '')::inet;
  exception when others then
    v_ip := null;
  end;

  insert into private.profile_private (user_id, last_login_at, last_login_ip, updated_at)
  values (p_user_id, now(), v_ip, now())
  on conflict (user_id) do update
    set last_login_at = now(),
        last_login_ip = coalesce(excluded.last_login_ip, private.profile_private.last_login_ip),
        updated_at = now();
end;
$$;

revoke all on function public.putduk_member_record_session(uuid, text) from public, anon, authenticated;
grant execute on function public.putduk_member_record_session(uuid, text) to service_role;

create or replace function public.putduk_admin_adjust_balance(
  p_admin_id uuid,
  p_user_id uuid,
  p_direction text,
  p_amount numeric,
  p_currency text default 'KRW',
  p_reason text default null,
  p_bucket text default null
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public, private, extensions
as $$
declare
  v_direction text := lower(trim(coalesce(p_direction, '')));
  v_currency text := upper(trim(coalesce(p_currency, 'KRW')));
  v_reason text := nullif(left(trim(coalesce(p_reason, '')), 500), '');
  v_amount numeric(18,2) := p_amount;
  v_bucket text := nullif(lower(trim(coalesce(p_bucket, ''))), '');
  v_signed numeric(18,2);
  v_entry_type text;
  v_applied boolean := false;
begin
  perform private.putduk_assert_admin(p_admin_id, array['super_admin', 'finance']);

  if v_direction in ('입금', 'deposit') then
    v_direction := 'credit';
  elsif v_direction in ('차감', 'withdraw', 'withdrawal') then
    v_direction := 'debit';
  end if;

  if v_direction not in ('credit', 'debit') then
    raise exception using errcode = '22023', message = '잔액 입금 또는 차감을 선택해 주세요.';
  end if;

  if v_currency not in ('KRW', 'USDT') then
    raise exception using errcode = '22023', message = '통화를 확인해 주세요.';
  end if;

  if v_amount is null or v_amount <= 0 or v_amount > 100000000 then
    raise exception using errcode = '22023', message = '금액을 확인해 주세요.';
  end if;

  if v_reason is null then
    raise exception using errcode = '22023', message = '사유를 입력해 주세요.';
  end if;

  if not exists (select 1 from public.profiles p where p.id = p_user_id) then
    raise exception using errcode = 'P0002', message = '회원 정보를 찾을 수 없습니다.';
  end if;

  if v_bucket in ('support', '지원금') then
    v_bucket := 'support_grant';
  elsif v_bucket in ('work', '근무 잔액', '업무잔액', 'work_balance') then
    v_bucket := 'work_balance';
  elsif v_bucket in ('available', '출금 가능', '출금가능') then
    v_bucket := 'available';
  end if;

  if v_bucket is null then
    v_bucket := 'available';
  end if;

  if v_bucket not in ('support_grant', 'work_balance', 'available') then
    raise exception using errcode = '22023', message = '지원금·근무 잔액·출금 가능 칸만 조정할 수 있어요.';
  end if;

  v_signed := case when v_direction = 'credit' then v_amount else -v_amount end;
  v_entry_type := case when v_direction = 'credit' then 'admin_credit' else 'admin_debit' end;

  v_applied := private.putduk_apply_bucket_delta(
    p_user_id, v_bucket, v_currency, v_signed, 0,
    v_entry_type, 'admin_adjustment', null,
    'admin-adjust:' || v_direction || ':' || v_bucket || ':' || gen_random_uuid()::text,
    p_admin_id
  );

  if v_applied is not true then
    raise exception using errcode = '23505', message = '같은 잔액 조정이 이미 처리되었습니다.';
  end if;

  insert into public.notifications (user_id, title, body, notification_type)
  values (
    p_user_id,
    case when v_direction = 'credit' then '운영자가 잔액을 입금했어요' else '운영자가 잔액을 차감했어요' end,
    to_char(v_amount, 'FM999G999G999G990D00') ||
      case when v_currency = 'USDT' then ' 테더' else '원' end ||
      ' · 운영자 안내: ' || v_reason,
    'finance'
  );

  return jsonb_build_object(
    'user_id', p_user_id,
    'direction', v_direction,
    'amount', v_amount,
    'currency', v_currency,
    'bucket', v_bucket,
    'reason', v_reason,
    'wallets', private.putduk_wallet_snapshot(p_user_id)
  );
end;
$$;

revoke all on function public.putduk_admin_adjust_balance(uuid, uuid, text, numeric, text, text, text)
  from public, anon, authenticated;
grant execute on function public.putduk_admin_adjust_balance(uuid, uuid, text, numeric, text, text, text)
  to service_role;
