-- 운영자 잔액 입금·차감. 화면에서 숫자를 더하거나 빼지 않고 원장만 거친다.

begin;

create or replace function public.putduk_admin_adjust_balance(
  p_admin_id uuid,
  p_user_id uuid,
  p_direction text,
  p_amount numeric,
  p_currency text default 'KRW',
  p_reason text default null
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
  v_signed numeric(18,2);
  v_available numeric(18,2) := 0;
  v_held numeric(18,2) := 0;
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

  perform pg_advisory_xact_lock(
    hashtextextended('putduk-wallet:' || p_user_id::text || ':' || v_currency, 0)
  );

  insert into public.wallet_accounts (user_id, bucket, currency, available_amount, held_amount)
  values (p_user_id, 'available', v_currency, 0, 0)
  on conflict (user_id, bucket, currency) do nothing;

  select available_amount, held_amount
    into v_available, v_held
  from public.wallet_accounts
  where user_id = p_user_id
    and bucket = 'available'
    and currency = v_currency
  for update;

  v_available := coalesce(v_available, 0);
  v_held := coalesce(v_held, 0);

  if v_direction = 'credit' then
    v_signed := v_amount;
    v_entry_type := 'admin_credit';
  else
    if v_available < v_amount then
      raise exception using errcode = '23514', message = '출금 가능 잔액이 부족합니다.';
    end if;
    v_signed := -v_amount;
    v_entry_type := 'admin_debit';
  end if;

  v_applied := private.putduk_apply_ledger(
    p_user_id,
    array['available'],
    v_currency,
    v_signed,
    v_entry_type,
    'admin_adjustment',
    null,
    'admin-adjust:' || v_direction || ':' || gen_random_uuid()::text,
    p_admin_id
  );

  if v_applied is not true then
    raise exception using errcode = '23505', message = '같은 잔액 조정이 이미 처리되었습니다.';
  end if;

  select available_amount, held_amount
    into v_available, v_held
  from public.wallet_accounts
  where user_id = p_user_id
    and bucket = 'available'
    and currency = v_currency;

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
    'available_amount', coalesce(v_available, 0),
    'held_amount', coalesce(v_held, 0),
    'reason', v_reason,
    'wallets', coalesce((
      select jsonb_agg(jsonb_build_object(
        'bucket', w.bucket,
        'currency', w.currency,
        'available_amount', w.available_amount,
        'held_amount', w.held_amount
      ) order by w.bucket)
      from public.wallet_accounts w
      where w.user_id = p_user_id
    ), '[]'::jsonb)
  );
end;
$$;

revoke all on function public.putduk_admin_adjust_balance(uuid, uuid, text, numeric, text, text)
  from public, anon, authenticated;
grant execute on function public.putduk_admin_adjust_balance(uuid, uuid, text, numeric, text, text)
  to service_role;

comment on function public.putduk_admin_adjust_balance(uuid, uuid, text, numeric, text, text) is
  '운영자 잔액 입금·차감. private.putduk_apply_ledger로만 지갑을 바꾸고 감사·알림을 남긴다.';

commit;
