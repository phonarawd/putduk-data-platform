create or replace function public.putduk_member_withdraw_request(
  p_user_id uuid,
  p_currency text,
  p_amount numeric,
  p_pin text,
  p_destination_type text,
  p_include_principal boolean default false,
  p_bank_name text default null,
  p_account_holder text default null,
  p_account_number text default null,
  p_usdt_network text default null,
  p_usdt_address text default null
)
returns public.withdrawal_requests
language plpgsql
security definer
set search_path = pg_catalog, public, private, extensions
as $$
declare
  v_row public.withdrawal_requests%rowtype;
  v_pin private.withdrawal_pins%rowtype;
  v_currency text := upper(trim(coalesce(p_currency, 'KRW')));
  v_type text := lower(trim(coalesce(p_destination_type, '')));
  v_now timestamptz := now();
  v_stipend_avail numeric(18,2) := 0;
  v_principal_avail numeric(18,2) := 0;
  v_stipend numeric(18,2) := 0;
  v_principal numeric(18,2) := 0;
  v_need numeric(18,2);
  v_masked text;
  v_label text;
  v_dest_id uuid;
begin
  if p_user_id is null then
    raise exception using errcode = '22023', message = '회원 정보가 필요합니다.';
  end if;

  if not exists (
    select 1 from public.profiles p
    where p.id = p_user_id and p.status = 'active'
  ) then
    raise exception using errcode = '42501', message = '활성화된 회원만 출금할 수 있어요.';
  end if;

  if not exists (
    select 1 from public.profiles p
    where p.id = p_user_id and p.kyc_status = 'approved'
  ) then
    if coalesce(p_include_principal, false)
       or v_currency <> 'KRW'
       or round(coalesce(p_amount, 0), 2) <= 0
       or round(p_amount, 2) > 3000
       or not exists (
         select 1 from public.profiles p
         where p.id = p_user_id and p.trial_consumed_at is not null
       )
       or exists (
         select 1 from public.withdrawal_requests w
         where w.user_id = p_user_id
           and w.currency = 'KRW'
           and coalesce(w.include_principal, false) = false
           and coalesce(w.principal_included, false) = false
           and w.status in ('submitted', 'checking', 'approved', 'sent', 'completed')
       )
    then
      raise exception using errcode = '42501', message = '출금 전 본인확인이 필요해요.';
    end if;
  end if;

  if v_currency not in ('KRW', 'USDT') then
    raise exception using errcode = '22023', message = '출금 통화를 확인해 주세요.';
  end if;

  if p_amount is null or p_amount < 1000 or p_amount > 100000000 then
    raise exception using errcode = '22023', message = '출금 금액은 1,000~100,000,000 범위여야 합니다.';
  end if;

  if v_type not in ('bank', 'usdt') then
    raise exception using errcode = '22023', message = '출금 방법을 선택해 주세요.';
  end if;

  if (v_currency = 'KRW' and v_type <> 'bank') or (v_currency = 'USDT' and v_type <> 'usdt') then
    raise exception using errcode = '22023', message = '통화와 출금 방법이 맞지 않습니다.';
  end if;

  if exists (
    select 1 from public.withdrawal_requests w
    where w.user_id = p_user_id
      and w.status in ('submitted', 'checking', 'approved')
  ) then
    raise exception using errcode = '23505', message = '이미 처리 중인 출금 요청이 있어요.';
  end if;

  select * into v_pin from private.withdrawal_pins where user_id = p_user_id for update;
  if not found then
    raise exception using errcode = '42501', message = '출금 비밀번호를 먼저 설정해 주세요.';
  end if;

  if v_pin.locked_until is not null and v_pin.locked_until > v_now then
    raise exception using errcode = '42501', message = '출금 비밀번호가 잠겨 있습니다. 잠시 후 다시 시도해 주세요.';
  end if;

  if p_pin is null or p_pin !~ '^[0-9]{6}$' or v_pin.pin_hash <> crypt(p_pin, v_pin.pin_hash) then
    update private.withdrawal_pins
    set failed_attempts = failed_attempts + 1,
        locked_until = case when failed_attempts + 1 >= 5 then v_now + interval '15 minutes' else locked_until end,
        updated_at = v_now
    where user_id = p_user_id;
    raise exception using errcode = '42501', message = '출금 비밀번호가 올바르지 않습니다.';
  end if;

  update private.withdrawal_pins
  set failed_attempts = 0, locked_until = null, updated_at = v_now
  where user_id = p_user_id;

  perform pg_advisory_xact_lock(
    hashtextextended('putduk-wallet:' || p_user_id::text || ':' || v_currency, 0)
  );
  perform private.putduk_ensure_wallets(p_user_id, v_currency);

  select available_amount into v_stipend_avail
  from public.wallet_accounts
  where user_id = p_user_id and bucket = 'available' and currency = v_currency
  for update;

  select available_amount into v_principal_avail
  from public.wallet_accounts
  where user_id = p_user_id and bucket = 'work_balance' and currency = v_currency
  for update;

  v_stipend_avail := coalesce(v_stipend_avail, 0);
  v_principal_avail := coalesce(v_principal_avail, 0);
  v_need := round(p_amount, 2);

  if coalesce(p_include_principal, false) then
    v_stipend := least(v_need, v_stipend_avail);
    v_principal := v_need - v_stipend;
    if v_principal > v_principal_avail then
      raise exception using errcode = '23514',
        message = '출금 가능·근무 잔액이 부족합니다. 잠긴 원금은 출금할 수 없어요.';
    end if;
  else
    v_stipend := v_need;
    v_principal := 0;
    if v_stipend > v_stipend_avail then
      raise exception using errcode = '23514', message = '출금 가능 잔액이 부족합니다.';
    end if;
  end if;

  if v_type = 'bank' then
    if nullif(trim(coalesce(p_bank_name, '')), '') is null
       or nullif(trim(coalesce(p_account_holder, '')), '') is null
       or nullif(trim(coalesce(p_account_number, '')), '') is null then
      raise exception using errcode = '22023', message = '은행명·예금주·계좌번호를 입력해 주세요.';
    end if;
    v_label := left(trim(p_bank_name) || ' ' || trim(p_account_holder), 80);
    v_masked := left(trim(p_bank_name), 20) || ' ****' || right(regexp_replace(trim(p_account_number), '\s', '', 'g'), 4);
  else
    if nullif(trim(coalesce(p_usdt_network, '')), '') is null
       or nullif(trim(coalesce(p_usdt_address, '')), '') is null then
      raise exception using errcode = '22023', message = 'USDT 네트워크와 주소를 입력해 주세요.';
    end if;
    v_label := left('USDT ' || trim(p_usdt_network), 80);
    v_masked := left(trim(p_usdt_address), 6) || '…' || right(trim(p_usdt_address), 4);
  end if;

  insert into private.member_payout_destinations (
    user_id, destination_type, bank_name, account_holder, account_number,
    usdt_network, usdt_address, masked_value
  )
  values (
    p_user_id, v_type,
    nullif(trim(coalesce(p_bank_name, '')), ''),
    nullif(trim(coalesce(p_account_holder, '')), ''),
    nullif(trim(coalesce(p_account_number, '')), ''),
    nullif(trim(coalesce(p_usdt_network, '')), ''),
    nullif(trim(coalesce(p_usdt_address, '')), ''),
    v_masked
  )
  returning id into v_dest_id;

  insert into public.withdrawal_requests (
    public_id, user_id, currency, amount, destination_type, status,
    destination_label, destination_masked,
    include_principal, principal_included, note, stipend_amount, principal_amount
  )
  values (
    'PDK-WDR-' || to_char(v_now, 'YYMMDD') || '-' || upper(substr(replace(gen_random_uuid()::text, '-', ''), 1, 8)),
    p_user_id, v_currency, v_need, v_type, 'submitted',
    v_label, v_masked,
    coalesce(p_include_principal, false),
    coalesce(p_include_principal, false),
    case when coalesce(p_include_principal, false) then '원금포함' else '수당만' end,
    v_stipend, v_principal
  )
  returning * into v_row;

  if v_stipend > 0 then
    perform private.putduk_apply_bucket_delta(
      p_user_id, 'available', v_currency, -v_stipend, v_stipend,
      'withdrawal_hold', 'withdrawal_request', v_row.id,
      'withdrawal-hold-stipend:' || v_row.id::text,
      p_user_id
    );
  end if;

  if v_principal > 0 then
    perform private.putduk_apply_bucket_delta(
      p_user_id, 'work_balance', v_currency, -v_principal, v_principal,
      'withdrawal_hold', 'withdrawal_request', v_row.id,
      'withdrawal-hold-principal:' || v_row.id::text,
      p_user_id
    );
  end if;

  insert into public.notifications (user_id, title, body, notification_type)
  values (
    p_user_id,
    '💸 출금 요청을 접수했어요',
    to_char(v_need, 'FM999G999G999G990D00') ||
      case when v_currency = 'USDT' then ' USDT' else '원' end ||
      case when coalesce(p_include_principal, false)
        then ' · 원금 포함. 운영자가 바로 처리합니다.'
        else ' · 수당만. 운영자가 확인합니다.'
      end,
    'finance'
  );

  return v_row;
end;
$$;

revoke all on function public.putduk_member_withdraw_request(uuid, text, numeric, text, text, boolean, text, text, text, text, text)
  from public, anon, authenticated;
grant execute on function public.putduk_member_withdraw_request(uuid, text, numeric, text, text, boolean, text, text, text, text, text)
  to service_role;
