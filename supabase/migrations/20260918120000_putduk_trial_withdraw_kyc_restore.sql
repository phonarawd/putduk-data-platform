-- 체험 수당(트라이얼) 3,000원 KYC 예외 복원.
--
-- 회귀 경위: 20260917115028_trial_ops_withdraw_and_activate_confirmed.sql와
-- 20260917120956_trial_ops_withdraw.sql이 "KYC 미승인이어도 체험수당(트라이얼)
-- 3,000원 이하는 평생 1회 예외로 출금 가능"한 public.putduk_member_withdraw_request()를
-- 만들었는데, 같은 날 저녁 20260917210000_putduk_three_bucket_ledger.sql이 세 칸 원장
-- (지원금/근무잔액/출금가능) 구조로 넘어가면서 같은 함수를 다시 정의했고, 이 과정에서
-- KYC 예외 조건이 통째로 빠지고 "kyc_status = 'approved'"만 무조건 요구하는 버전으로
-- 되돌아갔다(2026-09-18 야간 조사에서 발견).
--
-- 이 마이그레이션은 기존 파일을 고치지 않고, three_bucket_ledger의 최신 함수 본문을
-- 그대로 유지한 채(버킷 이름·구조·나머지 로직 전부 동일) KYC 검사 부분만
-- "활성 회원 확인 + (KYC 승인이면 통과, 아니면 트라이얼 예외 검사)"로 되돌린다.
--
-- 재사용 방지는 예전처럼 withdrawal_requests 상태를 조회하는 대신,
-- profiles.trial_withdraw_used_at 플래그로 단순화한다(원자적 UPDATE ... WHERE ... IS NULL
-- 로 동시 요청 경쟁도 막는다). 정상 회원(원금 포함·3,000원 초과·비트라이얼·이미 사용)은
-- 그대로 KYC를 요구한다 — 예외를 넓히지 않는다.

begin;

alter table public.profiles
  add column if not exists trial_withdraw_used_at timestamptz;

comment on column public.profiles.trial_withdraw_used_at is
  '체험 수당(트라이얼) 3,000원 KYC 예외 출금을 이미 썼는지. 평생 1회만 허용, 값이 있으면 재사용 불가.';

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

  -- 체험 수당(트라이얼) 3,000원 이하는 KYC 승인 전에도 평생 1회만 예외로 허용한다.
  -- 원금 포함·통화 다름·3,000원 초과·체험 미소진 회원은 예외 대상이 아니라 그대로 막는다.
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
    then
      raise exception using errcode = '42501', message = '출금 전 본인확인이 필요해요.';
    end if;

    -- 원자적 check-and-set. 동시에 두 번 요청해도 하나만 통과한다.
    update public.profiles
    set trial_withdraw_used_at = now()
    where id = p_user_id
      and trial_withdraw_used_at is null;
    if not found then
      raise exception using errcode = '23514', message = '체험 수당 출금은 한 번만 할 수 있어요.';
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

comment on function public.putduk_member_withdraw_request(uuid, text, numeric, text, text, boolean, text, text, text, text, text) is
  '출금 신청. 수당만 또는 원금포함. KYC 미승인이어도 체험수당 3,000원 이하는 평생 1회 예외(trial_withdraw_used_at). 잠긴 원금은 출금 불가.';

commit;
