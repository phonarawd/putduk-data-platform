-- P0: 출금 PIN 실패는 예외 없이 커밋. 관리자 잔액조정은 operation_id로 한 번만 반영하고 audit까지 같은 트랜잭션.

begin;

create table if not exists private.admin_money_operations (
  operation_id uuid primary key,
  admin_id uuid not null references public.profiles(id) on delete restrict,
  user_id uuid not null references public.profiles(id) on delete restrict,
  action text not null,
  request jsonb not null,
  result jsonb not null,
  created_at timestamptz not null default now()
);

alter table private.admin_money_operations enable row level security;
revoke all on table private.admin_money_operations from public, anon, authenticated;
grant all on table private.admin_money_operations to service_role;

comment on table private.admin_money_operations is
  '관리자 금액 작업의 불변 결과. 같은 operation_id는 다시 입금하지 않고 최초 결과를 반환한다.';

create or replace function public.putduk_member_verify_withdrawal_pin(
  p_user_id uuid,
  p_pin text
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public, private, extensions
as $$
declare
  v_now timestamptz := now();
  v_pin private.withdrawal_pins%rowtype;
  v_attempts integer := 0;
  v_locked boolean := false;
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

  select * into v_pin from private.withdrawal_pins where user_id = p_user_id for update;
  if not found then
    return jsonb_build_object(
      'valid', false,
      'pin_set', false,
      'attempts', 0,
      'remaining', 5,
      'locked', false,
      'locked_until', null
    );
  end if;

  if v_pin.locked_until is not null and v_pin.locked_until > v_now then
    return jsonb_build_object(
      'valid', false,
      'pin_set', true,
      'attempts', v_pin.failed_attempts,
      'remaining', 0,
      'locked', true,
      'locked_until', v_pin.locked_until
    );
  end if;

  if p_pin is not null and p_pin ~ '^[0-9]{6}$' and v_pin.pin_hash = crypt(p_pin, v_pin.pin_hash) then
    update private.withdrawal_pins
    set failed_attempts = 0, locked_until = null, updated_at = v_now
    where user_id = p_user_id;
    return jsonb_build_object(
      'valid', true,
      'pin_set', true,
      'attempts', 0,
      'remaining', 5,
      'locked', false,
      'locked_until', null
    );
  end if;

  v_attempts := v_pin.failed_attempts + 1;
  v_locked := v_attempts >= 5;

  update private.withdrawal_pins
  set failed_attempts = v_attempts,
      locked_until = case when v_locked then v_now + interval '15 minutes' else locked_until end,
      updated_at = v_now
  where user_id = p_user_id;

  return jsonb_build_object(
    'valid', false,
    'pin_set', true,
    'attempts', v_attempts,
    'remaining', greatest(0, 5 - v_attempts),
    'locked', v_locked,
    'locked_until', case when v_locked then v_now + interval '15 minutes' else v_pin.locked_until end
  );
end;
$$;

revoke all on function public.putduk_member_verify_withdrawal_pin(uuid, text)
  from public, anon, authenticated;
grant execute on function public.putduk_member_verify_withdrawal_pin(uuid, text)
  to service_role;

comment on function public.putduk_member_verify_withdrawal_pin(uuid, text) is
  '출금 PIN 확인. 실패 횟수와 잠금을 남긴 뒤 structured result를 반환한다. 틀린 PIN으로 exception을 던지지 않는다.';

drop function if exists public.putduk_member_set_withdrawal_pin(uuid, text);

create or replace function public.putduk_member_set_withdrawal_pin(
  p_user_id uuid,
  p_pin text,
  p_current_pin text default null
)
returns boolean
language plpgsql
security definer
set search_path = pg_catalog, public, private, extensions
as $$
declare
  v_existing private.withdrawal_pins%rowtype;
  v_had_pin boolean := false;
begin
  if p_user_id is null then
    raise exception using errcode = '22023', message = '회원 정보가 필요합니다.';
  end if;

  if not exists (
    select 1 from public.profiles p
    where p.id = p_user_id and p.status = 'active'
  ) then
    raise exception using errcode = '42501', message = '활성화된 회원만 출금 비밀번호를 바꿀 수 있어요.';
  end if;

  if p_pin is null or p_pin !~ '^[0-9]{6}$' then
    raise exception using errcode = '22023', message = '출금 비밀번호는 숫자 6자리여야 합니다.';
  end if;

  select * into v_existing from private.withdrawal_pins where user_id = p_user_id for update;
  v_had_pin := found;

  if v_had_pin then
    if p_current_pin is null or p_current_pin !~ '^[0-9]{6}$'
       or v_existing.pin_hash <> crypt(p_current_pin, v_existing.pin_hash) then
      raise exception using errcode = '42501', message = '현재 출금 비밀번호를 확인해 주세요.';
    end if;
  end if;

  insert into private.withdrawal_pins (user_id, pin_hash, failed_attempts, locked_until, updated_at)
  values (p_user_id, crypt(p_pin, gen_salt('bf')), 0, null, now())
  on conflict (user_id) do update
    set pin_hash = excluded.pin_hash,
        failed_attempts = 0,
        locked_until = null,
        updated_at = now();

  insert into public.notifications (user_id, title, body, notification_type)
  values (
    p_user_id,
    case when v_had_pin then '🔐 출금 비밀번호를 바꿨어요' else '🔐 출금 비밀번호를 만들었어요' end,
    '본인이 아니면 바로 운영자에게 알려 주세요.',
    'security'
  );

  return true;
end;
$$;

revoke all on function public.putduk_member_set_withdrawal_pin(uuid, text, text)
  from public, anon, authenticated;
grant execute on function public.putduk_member_set_withdrawal_pin(uuid, text, text)
  to service_role;

comment on function public.putduk_member_set_withdrawal_pin(uuid, text, text) is
  '출금 비밀번호 설정. 활동 회원만. 이미 있으면 현재 PIN이 맞아야 한다. 실패 횟수는 여기서 올리지 않는다.';

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
  p_usdt_address text default null,
  p_masked_value text default null,
  p_destination_label text default null
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
    then
      raise exception using errcode = '42501', message = '출금 전 본인확인이 필요해요.';
    end if;

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

  -- 실패 횟수는 verify RPC가 이미 커밋한다. 여기선 재확인만 하고 올리지 않는다.
  if p_pin is null or p_pin !~ '^[0-9]{6}$' or v_pin.pin_hash <> crypt(p_pin, v_pin.pin_hash) then
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
    if trim(coalesce(p_account_holder, '')) not like 'enc.v1.%'
       or trim(coalesce(p_account_number, '')) not like 'enc.v1.%' then
      raise exception using errcode = '22023', message = '지급정보는 암호화된 값만 저장할 수 있습니다.';
    end if;
    v_label := nullif(left(trim(coalesce(p_destination_label, '')), 80), '');
    v_masked := nullif(left(trim(coalesce(p_masked_value, '')), 120), '');
    if v_label is null then
      v_label := left(trim(p_bank_name), 80);
    end if;
    if v_masked is null then
      raise exception using errcode = '22023', message = '마스킹된 지급정보가 필요합니다.';
    end if;
  else
    if nullif(trim(coalesce(p_usdt_network, '')), '') is null
       or nullif(trim(coalesce(p_usdt_address, '')), '') is null then
      raise exception using errcode = '22023', message = 'USDT 네트워크와 주소를 입력해 주세요.';
    end if;
    if trim(coalesce(p_usdt_address, '')) not like 'enc.v1.%' then
      raise exception using errcode = '22023', message = '지급정보는 암호화된 값만 저장할 수 있습니다.';
    end if;
    v_label := nullif(left(trim(coalesce(p_destination_label, '')), 80), '');
    v_masked := nullif(left(trim(coalesce(p_masked_value, '')), 120), '');
    if v_label is null then
      v_label := left('USDT ' || trim(p_usdt_network), 80);
    end if;
    if v_masked is null then
      raise exception using errcode = '22023', message = '마스킹된 지급정보가 필요합니다.';
    end if;
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
    destination_label, destination_masked, destination_id,
    include_principal, principal_included, note, stipend_amount, principal_amount
  )
  values (
    'PDK-WDR-' || to_char(v_now, 'YYMMDD') || '-' || upper(substr(replace(gen_random_uuid()::text, '-', ''), 1, 8)),
    p_user_id, v_currency, v_need, v_type, 'submitted',
    v_label, v_masked, v_dest_id,
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

revoke all on function public.putduk_member_withdraw_request(uuid, text, numeric, text, text, boolean, text, text, text, text, text, text, text)
  from public, anon, authenticated;
grant execute on function public.putduk_member_withdraw_request(uuid, text, numeric, text, text, boolean, text, text, text, text, text, text, text)
  to service_role;

comment on function public.putduk_member_withdraw_request(uuid, text, numeric, text, text, boolean, text, text, text, text, text, text, text) is
  '출금 신청. PIN 실패 횟수는 verify RPC가 커밋한다. 이 함수는 틀린 PIN 횟수를 올리지 않고 거절만 한다.';

drop function if exists public.putduk_admin_adjust_balance(uuid, uuid, text, numeric, text, text, text);

create or replace function public.putduk_admin_adjust_balance(
  p_admin_id uuid,
  p_user_id uuid,
  p_direction text,
  p_amount numeric,
  p_currency text default 'KRW',
  p_reason text default null,
  p_bucket text default null,
  p_operation_id uuid default null
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
  v_operation_id uuid := p_operation_id;
  v_action text;
  v_result jsonb;
  v_existing jsonb;
  v_audit_id uuid;
begin
  perform private.putduk_assert_admin(p_admin_id, array['super_admin', 'finance']);

  if v_operation_id is null then
    raise exception using errcode = '22023', message = '작업 번호가 필요합니다.';
  end if;

  perform pg_advisory_xact_lock(
    hashtextextended('putduk-admin-op:' || v_operation_id::text, 0)
  );

  select result into v_existing
  from private.admin_money_operations
  where operation_id = v_operation_id;

  if found then
    return coalesce(v_existing, '{}'::jsonb) || jsonb_build_object(
      'operation_id', v_operation_id,
      'replayed', true
    );
  end if;

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
  v_action := case when v_direction = 'credit' then '잔액 입금' else '잔액 차감' end;

  v_applied := private.putduk_apply_bucket_delta(
    p_user_id, v_bucket, v_currency, v_signed, 0,
    v_entry_type, 'admin_adjustment', null,
    'admin-adjust:' || v_operation_id::text,
    p_admin_id
  );

  if v_applied is not true then
    select result into v_existing
    from private.admin_money_operations
    where operation_id = v_operation_id;
    if found then
      return coalesce(v_existing, '{}'::jsonb) || jsonb_build_object(
        'operation_id', v_operation_id,
        'replayed', true
      );
    end if;
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

  v_result := jsonb_build_object(
    'user_id', p_user_id,
    'direction', v_direction,
    'amount', v_amount,
    'currency', v_currency,
    'bucket', v_bucket,
    'reason', v_reason,
    'wallets', private.putduk_wallet_snapshot(p_user_id),
    'operation_id', v_operation_id,
    'replayed', false
  );

  v_audit_id := public.putduk_admin_append_audit(
    p_admin_id,
    v_action,
    'wallet_account',
    p_user_id,
    v_reason,
    null,
    v_result
  );

  v_result := v_result || jsonb_build_object('audit_id', v_audit_id);

  insert into private.admin_money_operations (
    operation_id, admin_id, user_id, action, request, result
  ) values (
    v_operation_id,
    p_admin_id,
    p_user_id,
    v_action,
    jsonb_build_object(
      'direction', v_direction,
      'amount', v_amount,
      'currency', v_currency,
      'bucket', v_bucket,
      'reason', v_reason
    ),
    v_result
  );

  return v_result;
end;
$$;

revoke all on function public.putduk_admin_adjust_balance(uuid, uuid, text, numeric, text, text, text, uuid)
  from public, anon, authenticated;
grant execute on function public.putduk_admin_adjust_balance(uuid, uuid, text, numeric, text, text, text, uuid)
  to service_role;

comment on function public.putduk_admin_adjust_balance(uuid, uuid, text, numeric, text, text, text, uuid) is
  '관리자 잔액 조정. operation_id가 같으면 다시 입금하지 않고 최초 결과를 반환한다. 원장·알림·audit을 한 트랜잭션에서 남긴다.';

commit;
