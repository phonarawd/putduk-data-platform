-- 입출금·KYC·추천·지원금·회원검색 원장 RPC
-- 모든 금액 변경은 이 함수와 private.ledger_entries를 통해서만 수행한다.

begin;

create or replace function private.putduk_assert_admin(
  p_user_id uuid,
  p_roles text[]
)
returns void
language plpgsql
stable
set search_path = pg_catalog, public, private
as $$
begin
  if p_user_id is null or coalesce(cardinality(p_roles), 0) = 0 then
    raise exception using errcode = '22023', message = '운영자 정보가 필요합니다.';
  end if;

  if not exists (
    select 1
    from private.admin_roles ar
    where ar.user_id = p_user_id
      and ar.role = any (p_roles)
  ) then
    raise exception using errcode = '42501', message = '이 메뉴를 사용할 권한이 없습니다.';
  end if;
end;
$$;

revoke all on function private.putduk_assert_admin(uuid, text[]) from public, anon, authenticated;
grant execute on function private.putduk_assert_admin(uuid, text[]) to service_role;

-- 원장 1건을 넣고, 처음 적용된 경우에만 지갑을 더한다.
create or replace function private.putduk_apply_ledger(
  p_user_id uuid,
  p_buckets text[],
  p_currency text,
  p_amount numeric,
  p_entry_type text,
  p_reference_type text,
  p_reference_id uuid,
  p_idempotency_key text,
  p_created_by uuid
)
returns boolean
language plpgsql
security definer
set search_path = pg_catalog, public, private, extensions
as $$
declare
  v_inserted integer := 0;
  v_bucket text;
begin
  if p_user_id is null or p_amount is null or p_idempotency_key is null then
    raise exception using errcode = '22023', message = '원장 정보가 부족합니다.';
  end if;

  if p_currency not in ('KRW', 'USDT') then
    raise exception using errcode = '22023', message = '지원하지 않는 통화입니다.';
  end if;

  perform pg_advisory_xact_lock(
    hashtextextended('putduk-wallet:' || p_user_id::text || ':' || p_currency, 0)
  );

  foreach v_bucket in array p_buckets
  loop
    insert into public.wallet_accounts (user_id, bucket, currency, available_amount, held_amount)
    values (p_user_id, v_bucket, p_currency, 0, 0)
    on conflict (user_id, bucket, currency) do nothing;
  end loop;

  insert into private.ledger_entries (
    public_id,
    user_id,
    bucket,
    currency,
    amount,
    entry_type,
    reference_type,
    reference_id,
    idempotency_key,
    created_by
  )
  values (
    'PDK-LEDGER-' || upper(substr(replace(gen_random_uuid()::text, '-', ''), 1, 16)),
    p_user_id,
    p_buckets[1],
    p_currency,
    p_amount,
    p_entry_type,
    p_reference_type,
    p_reference_id,
    p_idempotency_key,
    p_created_by
  )
  on conflict (idempotency_key) do nothing;

  get diagnostics v_inserted = row_count;
  if v_inserted <> 1 then
    return false;
  end if;

  update public.wallet_accounts
  set available_amount = available_amount + p_amount,
      updated_at = now()
  where user_id = p_user_id
    and currency = p_currency
    and bucket = any (p_buckets);

  return true;
end;
$$;

revoke all on function private.putduk_apply_ledger(uuid, text[], text, numeric, text, text, uuid, text, uuid)
  from public, anon, authenticated;
grant execute on function private.putduk_apply_ledger(uuid, text[], text, numeric, text, text, uuid, text, uuid)
  to service_role;

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

  update private.profile_private
  set last_login_at = now(),
      last_login_ip = coalesce(v_ip, last_login_ip),
      updated_at = now()
  where user_id = p_user_id;
end;
$$;

revoke all on function public.putduk_member_record_session(uuid, text) from public, anon, authenticated;
grant execute on function public.putduk_member_record_session(uuid, text) to service_role;

create or replace function public.putduk_member_set_withdrawal_pin(
  p_user_id uuid,
  p_pin text
)
returns boolean
language plpgsql
security definer
set search_path = pg_catalog, public, private, extensions
as $$
begin
  if p_user_id is null then
    raise exception using errcode = '22023', message = '회원 정보가 필요합니다.';
  end if;

  if p_pin is null or p_pin !~ '^[0-9]{6}$' then
    raise exception using errcode = '22023', message = '출금 비밀번호는 숫자 6자리여야 합니다.';
  end if;

  insert into private.withdrawal_pins (user_id, pin_hash, failed_attempts, locked_until, updated_at)
  values (p_user_id, crypt(p_pin, gen_salt('bf')), 0, null, now())
  on conflict (user_id) do update
    set pin_hash = excluded.pin_hash,
        failed_attempts = 0,
        locked_until = null,
        updated_at = now();

  return true;
end;
$$;

revoke all on function public.putduk_member_set_withdrawal_pin(uuid, text) from public, anon, authenticated;
grant execute on function public.putduk_member_set_withdrawal_pin(uuid, text) to service_role;

create or replace function public.putduk_member_submit_deposit(
  p_user_id uuid,
  p_currency text,
  p_amount numeric,
  p_proof_path text,
  p_note text default null,
  p_destination_id uuid default null
)
returns public.deposit_requests
language plpgsql
security definer
set search_path = pg_catalog, public, private
as $$
declare
  v_row public.deposit_requests%rowtype;
  v_currency text := upper(trim(coalesce(p_currency, 'KRW')));
  v_note text := nullif(left(trim(coalesce(p_note, '')), 500), '');
  v_proof text := nullif(trim(coalesce(p_proof_path, '')), '');
begin
  if p_user_id is null then
    raise exception using errcode = '22023', message = '회원 정보가 필요합니다.';
  end if;

  if not exists (
    select 1 from public.profiles p
    where p.id = p_user_id and p.status in ('active', 'pending')
  ) then
    raise exception using errcode = '42501', message = '입금 요청을 할 수 없는 계정입니다.';
  end if;

  if v_currency not in ('KRW', 'USDT') then
    raise exception using errcode = '22023', message = '입금 통화를 확인해 주세요.';
  end if;

  if p_amount is null or p_amount < 1000 or p_amount > 100000000 then
    raise exception using errcode = '22023', message = '입금 금액은 1,000~100,000,000 범위여야 합니다.';
  end if;

  if v_proof is null or length(v_proof) > 500 then
    raise exception using errcode = '22023', message = '입금 증빙 파일을 등록해 주세요.';
  end if;

  if split_part(v_proof, '/', 1) <> p_user_id::text then
    raise exception using errcode = '22023', message = '본인 증빙 파일만 등록할 수 있습니다.';
  end if;

  if p_destination_id is not null and not exists (
    select 1 from private.payout_destinations d
    where d.id = p_destination_id and d.enabled = true
  ) then
    raise exception using errcode = '22023', message = '입금 안내 계좌가 올바르지 않습니다.';
  end if;

  insert into public.deposit_requests (
    public_id, user_id, currency, amount, status, proof_path, note, destination_id
  )
  values (
    'PDK-DEP-' || to_char(now(), 'YYMMDD') || '-' || upper(substr(replace(gen_random_uuid()::text, '-', ''), 1, 8)),
    p_user_id,
    v_currency,
    round(p_amount, 2),
    'submitted',
    v_proof,
    v_note,
    p_destination_id
  )
  returning * into v_row;

  insert into public.notifications (user_id, title, body, notification_type)
  values (
    p_user_id,
    '입금 확인 요청을 접수했어요',
    to_char(round(p_amount, 2), 'FM999G999G999G990D00') ||
      case when v_currency = 'USDT' then ' USDT' else '원' end ||
      ' 입금 확인을 운영자가 검토합니다.',
    'finance'
  );

  return v_row;
end;
$$;

revoke all on function public.putduk_member_submit_deposit(uuid, text, numeric, text, text, uuid)
  from public, anon, authenticated;
grant execute on function public.putduk_member_submit_deposit(uuid, text, numeric, text, text, uuid)
  to service_role;

create or replace function public.putduk_member_submit_withdrawal(
  p_user_id uuid,
  p_currency text,
  p_amount numeric,
  p_pin text,
  p_destination_type text,
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
  v_available numeric(18,2) := 0;
  v_masked text;
  v_label text;
  v_dest_id uuid;
begin
  if p_user_id is null then
    raise exception using errcode = '22023', message = '회원 정보가 필요합니다.';
  end if;

  if not exists (
    select 1 from public.profiles p
    where p.id = p_user_id and p.status = 'active' and p.kyc_status = 'approved'
  ) then
    raise exception using errcode = '42501', message = '출금 전 본인확인이 필요해요.';
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

  select * into v_pin
  from private.withdrawal_pins
  where user_id = p_user_id
  for update;

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
  set failed_attempts = 0,
      locked_until = null,
      updated_at = v_now
  where user_id = p_user_id;

  perform pg_advisory_xact_lock(
    hashtextextended('putduk-wallet:' || p_user_id::text || ':' || v_currency, 0)
  );

  insert into public.wallet_accounts (user_id, bucket, currency, available_amount, held_amount)
  values
    (p_user_id, 'available', v_currency, 0, 0),
    (p_user_id, 'held', v_currency, 0, 0)
  on conflict (user_id, bucket, currency) do nothing;

  select available_amount into v_available
  from public.wallet_accounts
  where user_id = p_user_id and bucket = 'available' and currency = v_currency
  for update;

  if coalesce(v_available, 0) < round(p_amount, 2) then
    raise exception using errcode = '23514', message = '출금 가능 잔액이 부족합니다.';
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
    p_user_id,
    v_type,
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
    destination_label, destination_masked
  )
  values (
    'PDK-WDR-' || to_char(v_now, 'YYMMDD') || '-' || upper(substr(replace(gen_random_uuid()::text, '-', ''), 1, 8)),
    p_user_id,
    v_currency,
    round(p_amount, 2),
    v_type,
    'submitted',
    v_label,
    v_masked
  )
  returning * into v_row;

  if private.putduk_apply_ledger(
    p_user_id,
    array['available'],
    v_currency,
    -round(p_amount, 2),
    'withdrawal_hold',
    'withdrawal_request',
    v_row.id,
    'withdrawal-hold:' || v_row.id::text,
    p_user_id
  ) then
    update public.wallet_accounts
    set held_amount = held_amount + round(p_amount, 2),
        updated_at = v_now
    where user_id = p_user_id
      and bucket = 'held'
      and currency = v_currency;
  end if;

  insert into public.notifications (user_id, title, body, notification_type)
  values (
    p_user_id,
    '출금 요청을 접수했어요',
    to_char(round(p_amount, 2), 'FM999G999G999G990D00') ||
      case when v_currency = 'USDT' then ' USDT' else '원' end ||
      ' 출금 요청을 운영자가 확인합니다.',
    'finance'
  );

  return v_row;
end;
$$;

revoke all on function public.putduk_member_submit_withdrawal(uuid, text, numeric, text, text, text, text, text, text, text)
  from public, anon, authenticated;
grant execute on function public.putduk_member_submit_withdrawal(uuid, text, numeric, text, text, text, text, text, text, text)
  to service_role;

create or replace function public.putduk_member_submit_kyc(
  p_user_id uuid,
  p_front_path text,
  p_back_path text,
  p_selfie_path text
)
returns text
language plpgsql
security definer
set search_path = pg_catalog, public, private
as $$
declare
  v_front text := nullif(trim(coalesce(p_front_path, '')), '');
  v_back text := nullif(trim(coalesce(p_back_path, '')), '');
  v_selfie text := nullif(trim(coalesce(p_selfie_path, '')), '');
begin
  if p_user_id is null then
    raise exception using errcode = '22023', message = '회원 정보가 필요합니다.';
  end if;

  if not exists (select 1 from public.profiles where id = p_user_id and status in ('active', 'pending')) then
    raise exception using errcode = '42501', message = '본인확인을 제출할 수 없는 계정입니다.';
  end if;

  if v_front is null or v_back is null or v_selfie is null
     or split_part(v_front, '/', 1) <> p_user_id::text
     or split_part(v_back, '/', 1) <> p_user_id::text
     or split_part(v_selfie, '/', 1) <> p_user_id::text then
    raise exception using errcode = '22023', message = '신분증 앞면·뒷면·셀카 파일을 모두 본인 경로로 등록해 주세요.';
  end if;

  insert into private.kyc_documents (user_id, document_kind, storage_path, status)
  values
    (p_user_id, 'identity_front', v_front, 'submitted'),
    (p_user_id, 'identity_back', v_back, 'submitted'),
    (p_user_id, 'selfie', v_selfie, 'submitted')
  on conflict (user_id, document_kind) do update
    set storage_path = excluded.storage_path,
        status = 'submitted',
        reviewed_by = null,
        reviewed_at = null,
        rejection_reason = null;

  update public.profiles
  set kyc_status = 'submitted',
      updated_at = now()
  where id = p_user_id;

  insert into public.notifications (user_id, title, body, notification_type)
  values (p_user_id, '본인확인 서류를 접수했어요', '운영자 검수를 기다리고 있어요.', 'kyc');

  return 'submitted';
end;
$$;

revoke all on function public.putduk_member_submit_kyc(uuid, text, text, text) from public, anon, authenticated;
grant execute on function public.putduk_member_submit_kyc(uuid, text, text, text) to service_role;

create or replace function public.putduk_admin_search_members(
  p_admin_id uuid,
  p_query text default null,
  p_limit integer default 50,
  p_offset integer default 0
)
returns table (
  user_id uuid,
  public_id text,
  display_name text,
  legal_name text,
  email text,
  phone_e164 text,
  member_tier text,
  status public.member_status,
  kyc_status text,
  created_at timestamptz,
  last_login_at timestamptz,
  last_login_ip inet,
  last_sign_in_at timestamptz,
  available_krw numeric,
  referral_count bigint
)
language plpgsql
security definer
stable
set search_path = pg_catalog, public, private, auth
as $$
declare
  v_query text := nullif(lower(trim(coalesce(p_query, ''))), '');
  v_limit integer := least(greatest(coalesce(p_limit, 50), 1), 100);
  v_offset integer := greatest(coalesce(p_offset, 0), 0);
begin
  perform private.putduk_assert_admin(p_admin_id, array['super_admin', 'member_support']);

  return query
  select
    p.id,
    p.public_id,
    p.display_name,
    pp.legal_name,
    coalesce(u.email, pp.email_snapshot) as email,
    pp.phone_e164,
    p.member_tier,
    p.status,
    p.kyc_status,
    p.created_at,
    pp.last_login_at,
    pp.last_login_ip,
    u.last_sign_in_at,
    coalesce((
      select w.available_amount
      from public.wallet_accounts w
      where w.user_id = p.id and w.bucket = 'available' and w.currency = 'KRW'
    ), 0) as available_krw,
    (
      select count(*)
      from public.referral_relations r
      where r.referrer_id = p.id
    ) as referral_count
  from public.profiles p
  left join private.profile_private pp on pp.user_id = p.id
  left join auth.users u on u.id = p.id
  where v_query is null
     or p.public_id ilike '%' || v_query || '%'
     or p.display_name ilike '%' || v_query || '%'
     or coalesce(pp.legal_name, '') ilike '%' || v_query || '%'
     or coalesce(u.email, pp.email_snapshot, '') ilike '%' || v_query || '%'
     or coalesce(pp.phone_e164, '') ilike '%' || v_query || '%'
  order by p.created_at desc
  limit v_limit
  offset v_offset;
end;
$$;

revoke all on function public.putduk_admin_search_members(uuid, text, integer, integer)
  from public, anon, authenticated;
grant execute on function public.putduk_admin_search_members(uuid, text, integer, integer)
  to service_role;

create or replace function public.putduk_admin_review_deposit(
  p_admin_id uuid,
  p_deposit_id uuid,
  p_decision text,
  p_reason text default null
)
returns public.deposit_requests
language plpgsql
security definer
set search_path = pg_catalog, public, private, extensions
as $$
declare
  v_row public.deposit_requests%rowtype;
  v_after public.deposit_requests%rowtype;
  v_decision text := lower(trim(coalesce(p_decision, '')));
  v_reason text := nullif(left(trim(coalesce(p_reason, '')), 500), '');
  v_now timestamptz := now();
begin
  perform private.putduk_assert_admin(p_admin_id, array['super_admin', 'finance']);

  if v_decision not in ('approved', 'rejected') then
    raise exception using errcode = '22023', message = '입금 처리 결과를 선택해 주세요.';
  end if;

  if v_decision = 'rejected' and v_reason is null then
    raise exception using errcode = '22023', message = '반려 사유를 입력해 주세요.';
  end if;

  select * into v_row
  from public.deposit_requests
  where id = p_deposit_id
  for update;

  if not found then
    raise exception using errcode = 'P0002', message = '입금 요청을 찾을 수 없습니다.';
  end if;

  if v_row.status = 'approved' then
    return v_row;
  end if;

  if v_row.status not in ('submitted', 'checking') then
    raise exception using errcode = '23514', message = '이미 처리된 입금 요청입니다.';
  end if;

  if v_decision = 'approved' then
    update public.deposit_requests
    set status = 'approved',
        reviewed_by = p_admin_id,
        reviewed_at = v_now,
        rejection_reason = null,
        updated_at = v_now
    where id = v_row.id
    returning * into v_after;

    perform private.putduk_apply_ledger(
      v_row.user_id,
      array['available'],
      v_row.currency,
      v_row.amount,
      'deposit_posted',
      'deposit_request',
      v_row.id,
      'deposit-posted:' || v_row.id::text,
      p_admin_id
    );

    update public.referral_relations
    set status = case when status in ('joined', 'verified') then 'funded' else status end,
        updated_at = v_now
    where invitee_id = v_row.user_id
      and status in ('joined', 'verified');

    insert into public.notifications (user_id, title, body, notification_type)
    values (
      v_row.user_id,
      '입금이 확인됐어요',
      to_char(v_row.amount, 'FM999G999G999G990D00') ||
        case when v_row.currency = 'USDT' then ' USDT' else '원' end ||
        '이 지갑에 반영됐어요.',
      'finance'
    );
  else
    update public.deposit_requests
    set status = 'rejected',
        reviewed_by = p_admin_id,
        reviewed_at = v_now,
        rejection_reason = v_reason,
        updated_at = v_now
    where id = v_row.id
    returning * into v_after;

    insert into public.notifications (user_id, title, body, notification_type)
    values (
      v_row.user_id,
      '입금 확인이 반려됐어요',
      '운영자 안내: ' || v_reason,
      'finance'
    );
  end if;

  return v_after;
end;
$$;

revoke all on function public.putduk_admin_review_deposit(uuid, uuid, text, text)
  from public, anon, authenticated;
grant execute on function public.putduk_admin_review_deposit(uuid, uuid, text, text)
  to service_role;

create or replace function public.putduk_admin_review_withdrawal(
  p_admin_id uuid,
  p_withdrawal_id uuid,
  p_decision text,
  p_reason text default null,
  p_transaction_reference text default null
)
returns public.withdrawal_requests
language plpgsql
security definer
set search_path = pg_catalog, public, private, extensions
as $$
declare
  v_row public.withdrawal_requests%rowtype;
  v_after public.withdrawal_requests%rowtype;
  v_decision text := lower(trim(coalesce(p_decision, '')));
  v_reason text := nullif(left(trim(coalesce(p_reason, '')), 500), '');
  v_ref text := nullif(left(trim(coalesce(p_transaction_reference, '')), 120), '');
  v_now timestamptz := now();
begin
  perform private.putduk_assert_admin(p_admin_id, array['super_admin', 'finance']);

  if v_decision not in ('approved', 'sent', 'rejected') then
    raise exception using errcode = '22023', message = '출금 처리 결과를 선택해 주세요.';
  end if;

  select * into v_row
  from public.withdrawal_requests
  where id = p_withdrawal_id
  for update;

  if not found then
    raise exception using errcode = 'P0002', message = '출금 요청을 찾을 수 없습니다.';
  end if;

  if v_row.status = 'sent' then
    return v_row;
  end if;

  if v_decision = 'approved' then
    if v_row.status not in ('submitted', 'checking') then
      raise exception using errcode = '23514', message = '승인할 수 없는 출금 상태입니다.';
    end if;

    update public.withdrawal_requests
    set status = 'approved',
        reviewed_by = p_admin_id,
        reviewed_at = v_now,
        updated_at = v_now
    where id = v_row.id
    returning * into v_after;

    insert into public.notifications (user_id, title, body, notification_type)
    values (v_row.user_id, '출금이 승인됐어요', '송금 준비 중입니다.', 'finance');
  elsif v_decision = 'sent' then
    if v_row.status not in ('submitted', 'checking', 'approved') then
      raise exception using errcode = '23514', message = '송금 완료로 바꿀 수 없는 상태입니다.';
    end if;
    if v_ref is null then
      raise exception using errcode = '22023', message = '거래번호를 입력해 주세요.';
    end if;

    update public.withdrawal_requests
    set status = 'sent',
        transaction_reference = v_ref,
        reviewed_by = p_admin_id,
        reviewed_at = v_now,
        updated_at = v_now
    where id = v_row.id
    returning * into v_after;

    if private.putduk_apply_ledger(
      v_row.user_id,
      array['held'],
      v_row.currency,
      0,
      'withdrawal_sent',
      'withdrawal_request',
      v_row.id,
      'withdrawal-sent:' || v_row.id::text,
      p_admin_id
    ) then
      update public.wallet_accounts
      set held_amount = greatest(held_amount - v_row.amount, 0),
          updated_at = v_now
      where user_id = v_row.user_id
        and bucket = 'held'
        and currency = v_row.currency;
    end if;

    insert into public.notifications (user_id, title, body, notification_type)
    values (
      v_row.user_id,
      '출금 송금이 완료됐어요',
      '거래번호 ' || v_ref || '로 송금됐습니다.',
      'finance'
    );
  else
    if v_reason is null then
      raise exception using errcode = '22023', message = '반려 사유를 입력해 주세요.';
    end if;
    if v_row.status not in ('submitted', 'checking', 'approved') then
      raise exception using errcode = '23514', message = '반려할 수 없는 출금 상태입니다.';
    end if;

    update public.withdrawal_requests
    set status = 'rejected',
        rejection_reason = v_reason,
        reviewed_by = p_admin_id,
        reviewed_at = v_now,
        updated_at = v_now
    where id = v_row.id
    returning * into v_after;

    if private.putduk_apply_ledger(
      v_row.user_id,
      array['available'],
      v_row.currency,
      v_row.amount,
      'withdrawal_reversed',
      'withdrawal_request',
      v_row.id,
      'withdrawal-reversed:' || v_row.id::text,
      p_admin_id
    ) then
      update public.wallet_accounts
      set held_amount = greatest(held_amount - v_row.amount, 0),
          updated_at = v_now
      where user_id = v_row.user_id
        and bucket = 'held'
        and currency = v_row.currency;
    end if;

    insert into public.notifications (user_id, title, body, notification_type)
    values (v_row.user_id, '출금 요청이 반려됐어요', '운영자 안내: ' || v_reason, 'finance');
  end if;

  return v_after;
end;
$$;

revoke all on function public.putduk_admin_review_withdrawal(uuid, uuid, text, text, text)
  from public, anon, authenticated;
grant execute on function public.putduk_admin_review_withdrawal(uuid, uuid, text, text, text)
  to service_role;

create or replace function public.putduk_admin_review_kyc(
  p_admin_id uuid,
  p_user_id uuid,
  p_decision text,
  p_reason text default null
)
returns text
language plpgsql
security definer
set search_path = pg_catalog, public, private
as $$
declare
  v_decision text := lower(trim(coalesce(p_decision, '')));
  v_reason text := nullif(left(trim(coalesce(p_reason, '')), 500), '');
  v_now timestamptz := now();
  v_count integer;
begin
  perform private.putduk_assert_admin(p_admin_id, array['super_admin', 'kyc_review']);

  if v_decision not in ('approved', 'rejected') then
    raise exception using errcode = '22023', message = '본인확인 결과를 선택해 주세요.';
  end if;

  if v_decision = 'rejected' and v_reason is null then
    raise exception using errcode = '22023', message = '반려 사유를 입력해 주세요.';
  end if;

  select count(*) into v_count
  from private.kyc_documents
  where user_id = p_user_id
    and document_kind in ('identity_front', 'identity_back', 'selfie');

  if v_count < 3 then
    raise exception using errcode = 'P0002', message = '본인확인 서류가 모두 제출되지 않았습니다.';
  end if;

  if v_decision = 'approved' then
    update private.kyc_documents
    set status = 'approved',
        reviewed_by = p_admin_id,
        reviewed_at = v_now,
        rejection_reason = null
    where user_id = p_user_id;

    update public.profiles
    set kyc_status = 'approved',
        status = case when status = 'pending' then 'active' else status end,
        updated_at = v_now
    where id = p_user_id;

    update public.referral_relations
    set status = case when status = 'joined' then 'verified' else status end,
        updated_at = v_now
    where invitee_id = p_user_id
      and status = 'joined';

    insert into public.notifications (user_id, title, body, notification_type)
    values (p_user_id, '본인확인이 완료됐어요', '출금 전 본인확인이 승인되었습니다.', 'kyc');
  else
    update private.kyc_documents
    set status = 'rejected',
        reviewed_by = p_admin_id,
        reviewed_at = v_now,
        rejection_reason = v_reason
    where user_id = p_user_id;

    update public.profiles
    set kyc_status = 'rejected',
        updated_at = v_now
    where id = p_user_id;

    insert into public.notifications (user_id, title, body, notification_type)
    values (p_user_id, '본인확인이 반려됐어요', '운영자 안내: ' || v_reason, 'kyc');
  end if;

  return v_decision;
end;
$$;

revoke all on function public.putduk_admin_review_kyc(uuid, uuid, text, text)
  from public, anon, authenticated;
grant execute on function public.putduk_admin_review_kyc(uuid, uuid, text, text)
  to service_role;

create or replace function public.putduk_admin_review_referral(
  p_admin_id uuid,
  p_relation_id uuid,
  p_decision text,
  p_reason text default null,
  p_force boolean default false
)
returns private.referral_rewards
language plpgsql
security definer
set search_path = pg_catalog, public, private, extensions
as $$
declare
  v_rel public.referral_relations%rowtype;
  v_reward private.referral_rewards%rowtype;
  v_decision text := lower(trim(coalesce(p_decision, '')));
  v_reason text := nullif(left(trim(coalesce(p_reason, '')), 500), '');
  v_now timestamptz := now();
  v_has_deposit boolean := false;
  v_has_work boolean := false;
  v_signals jsonb := '{}'::jsonb;
begin
  perform private.putduk_assert_admin(p_admin_id, array['super_admin', 'finance', 'member_support']);

  if v_decision not in ('approved', 'rejected', 'held') then
    raise exception using errcode = '22023', message = '추천 보상 결과를 선택해 주세요.';
  end if;

  select * into v_rel
  from public.referral_relations
  where id = p_relation_id
  for update;

  if not found then
    raise exception using errcode = 'P0002', message = '추천 관계를 찾을 수 없습니다.';
  end if;

  select exists (
    select 1 from public.deposit_requests d
    where d.user_id = v_rel.invitee_id and d.status = 'approved'
  ) into v_has_deposit;

  select exists (
    select 1 from public.task_runs t
    where t.user_id = v_rel.invitee_id and t.status = 'approved'
  ) into v_has_work;

  v_signals := jsonb_build_object(
    'invitee_active', exists (select 1 from public.profiles p where p.id = v_rel.invitee_id and p.status = 'active'),
    'has_deposit', v_has_deposit,
    'has_approved_work', v_has_work,
    'same_ip', exists (
      select 1
      from private.profile_private a
      join private.profile_private b on b.last_login_ip = a.last_login_ip
      where a.user_id = v_rel.referrer_id
        and b.user_id = v_rel.invitee_id
        and a.last_login_ip is not null
    ),
    'same_phone', exists (
      select 1
      from private.profile_private a
      join private.profile_private b on b.phone_e164 = a.phone_e164
      where a.user_id = v_rel.referrer_id
        and b.user_id = v_rel.invitee_id
        and a.phone_e164 is not null
    )
  );

  insert into private.referral_rewards (relation_id, referrer_id, amount, status, risk_signals)
  values (v_rel.id, v_rel.referrer_id, 5000, 'held', v_signals)
  on conflict (relation_id) do update
    set risk_signals = excluded.risk_signals
  returning * into v_reward;

  if v_reward.status = 'posted' and v_decision = 'approved' then
    return v_reward;
  end if;

  if v_decision = 'held' then
    update public.referral_relations
    set status = 'held', updated_at = v_now
    where id = v_rel.id;

    update private.referral_rewards
    set status = 'held',
        decided_by = p_admin_id,
        decided_at = v_now,
        decision_reason = v_reason,
        risk_signals = v_signals
    where id = v_reward.id
    returning * into v_reward;

    return v_reward;
  end if;

  if v_decision = 'rejected' then
    if v_reason is null then
      raise exception using errcode = '22023', message = '반려 사유를 입력해 주세요.';
    end if;

    update public.referral_relations
    set status = 'rejected', updated_at = v_now
    where id = v_rel.id;

    update private.referral_rewards
    set status = 'reversed',
        decided_by = p_admin_id,
        decided_at = v_now,
        decision_reason = v_reason,
        risk_signals = v_signals
    where id = v_reward.id
    returning * into v_reward;

    insert into public.notifications (user_id, title, body, notification_type)
    values (v_rel.referrer_id, '추천 보상이 반려됐어요', '운영자 안내: ' || v_reason, 'referral');

    return v_reward;
  end if;

  if not coalesce(p_force, false)
     and (
       not (v_signals ->> 'invitee_active')::boolean
       or not v_has_deposit
       or not v_has_work
     )
  then
    raise exception using errcode = '23514',
      message = '추천 회원 활성화·입금·업무 수행이 확인된 뒤에만 지급할 수 있습니다.';
  end if;

  update public.referral_relations
  set status = 'paid', updated_at = v_now
  where id = v_rel.id;

  update private.referral_rewards
  set status = 'posted',
      decided_by = p_admin_id,
      decided_at = v_now,
      decision_reason = v_reason,
      risk_signals = v_signals
  where id = v_reward.id
  returning * into v_reward;

  perform private.putduk_apply_ledger(
    v_rel.referrer_id,
    array['referral_reward', 'available'],
    'KRW',
    5000,
    'referral_reward_posted',
    'referral_relation',
    v_rel.id,
    'referral-reward:' || v_rel.id::text,
    p_admin_id
  );

  insert into public.notifications (user_id, title, body, notification_type)
  values (
    v_rel.referrer_id,
    '추천 보상이 지급됐어요',
    '추천 조건이 충족되어 5,000원이 지갑에 반영됐어요.',
    'referral'
  );

  return v_reward;
end;
$$;

revoke all on function public.putduk_admin_review_referral(uuid, uuid, text, text, boolean)
  from public, anon, authenticated;
grant execute on function public.putduk_admin_review_referral(uuid, uuid, text, text, boolean)
  to service_role;

create or replace function public.putduk_admin_revoke_support_grant(
  p_admin_id uuid,
  p_grant_id uuid,
  p_reason text
)
returns public.support_grants
language plpgsql
security definer
set search_path = pg_catalog, public, private, extensions
as $$
declare
  v_row public.support_grants%rowtype;
  v_after public.support_grants%rowtype;
  v_reason text := nullif(left(trim(coalesce(p_reason, '')), 500), '');
  v_now timestamptz := now();
  v_available numeric(18,2) := 0;
begin
  perform private.putduk_assert_admin(p_admin_id, array['super_admin', 'finance']);

  if v_reason is null then
    raise exception using errcode = '22023', message = '지원금 회수 사유가 필요합니다.';
  end if;

  select * into v_row
  from public.support_grants
  where id = p_grant_id
  for update;

  if not found then
    raise exception using errcode = 'P0002', message = '지원금 기록을 찾을 수 없습니다.';
  end if;

  if v_row.status = 'revoked' then
    return v_row;
  end if;

  if v_row.status not in ('available', 'held') then
    raise exception using errcode = '23514', message = '이미 사용·만료된 지원금은 회수할 수 없습니다.';
  end if;

  perform pg_advisory_xact_lock(
    hashtextextended('putduk-wallet:' || v_row.user_id::text || ':KRW', 0)
  );

  select available_amount into v_available
  from public.wallet_accounts
  where user_id = v_row.user_id and bucket = 'support_grant' and currency = 'KRW'
  for update;

  if private.putduk_apply_ledger(
    v_row.user_id,
    array['support_grant'],
    'KRW',
    -least(coalesce(v_available, 0), v_row.amount),
    'support_grant_revoked',
    'support_grant',
    v_row.id,
    'support-grant-revoked:' || v_row.id::text,
    p_admin_id
  ) then
    null;
  end if;

  update public.support_grants
  set status = 'revoked',
      revoked_by = p_admin_id,
      revoked_at = v_now,
      revoke_reason = v_reason
  where id = v_row.id
  returning * into v_after;

  insert into public.notifications (user_id, title, body, notification_type)
  values (v_row.user_id, '지원금이 회수됐어요', '운영자 안내: ' || v_reason, 'finance');

  return v_after;
end;
$$;

revoke all on function public.putduk_admin_revoke_support_grant(uuid, uuid, text)
  from public, anon, authenticated;
grant execute on function public.putduk_admin_revoke_support_grant(uuid, uuid, text)
  to service_role;

create or replace function public.putduk_admin_update_campaign(
  p_admin_id uuid,
  p_campaign_id uuid,
  p_name text default null,
  p_amount numeric default null,
  p_enabled boolean default null,
  p_trigger_type text default null,
  p_usage_scope text default null,
  p_expires_in_days integer default null,
  p_starts_at timestamptz default null,
  p_ends_at timestamptz default null
)
returns public.support_grant_campaigns
language plpgsql
security definer
set search_path = pg_catalog, public, private
as $$
declare
  v_row public.support_grant_campaigns%rowtype;
begin
  perform private.putduk_assert_admin(p_admin_id, array['super_admin', 'finance']);

  update public.support_grant_campaigns
  set name = coalesce(nullif(trim(coalesce(p_name, '')), ''), name),
      amount = coalesce(p_amount, amount),
      enabled = coalesce(p_enabled, enabled),
      trigger_type = coalesce(p_trigger_type, trigger_type),
      usage_scope = coalesce(nullif(trim(coalesce(p_usage_scope, '')), ''), usage_scope),
      expires_in_days = case when p_expires_in_days is null then expires_in_days else p_expires_in_days end,
      starts_at = coalesce(p_starts_at, starts_at),
      ends_at = case when p_ends_at is null then ends_at else p_ends_at end
  where id = p_campaign_id
  returning * into v_row;

  if not found then
    raise exception using errcode = 'P0002', message = '지원금 캠페인을 찾을 수 없습니다.';
  end if;

  if v_row.amount < 0 then
    raise exception using errcode = '22023', message = '지원금 금액은 0 이상이어야 합니다.';
  end if;

  return v_row;
end;
$$;

revoke all on function public.putduk_admin_update_campaign(uuid, uuid, text, numeric, boolean, text, text, integer, timestamptz, timestamptz)
  from public, anon, authenticated;
grant execute on function public.putduk_admin_update_campaign(uuid, uuid, text, numeric, boolean, text, text, integer, timestamptz, timestamptz)
  to service_role;

create or replace function public.putduk_admin_assign_task(
  p_admin_id uuid,
  p_user_id uuid,
  p_node_id uuid,
  p_reward_amount numeric default null,
  p_estimated_seconds integer default null,
  p_reason text default null,
  p_visible_from timestamptz default null,
  p_visible_until timestamptz default null,
  p_notify boolean default true
)
returns public.task_assignments
language plpgsql
security definer
set search_path = pg_catalog, public, private
as $$
declare
  v_node public.nodes%rowtype;
  v_row public.task_assignments%rowtype;
  v_reason text := nullif(left(trim(coalesce(p_reason, '')), 500), '');
  v_title text;
begin
  perform private.putduk_assert_admin(p_admin_id, array['super_admin', 'member_support', 'content']);

  if p_user_id is null or p_node_id is null then
    raise exception using errcode = '22023', message = '회원과 업무 카드를 선택해 주세요.';
  end if;

  if not exists (select 1 from public.profiles where id = p_user_id and status in ('active', 'pending')) then
    raise exception using errcode = 'P0002', message = '배정할 회원을 찾을 수 없습니다.';
  end if;

  select * into v_node from public.nodes where id = p_node_id;
  if not found then
    raise exception using errcode = 'P0002', message = '배정할 업무 카드를 찾을 수 없습니다.';
  end if;

  insert into public.task_assignments (
    user_id, node_id, partner_brand_id, reward_amount, estimated_seconds,
    reason, visible_from, visible_until, notify_member, created_by
  )
  values (
    p_user_id,
    p_node_id,
    v_node.partner_brand_id,
    p_reward_amount,
    p_estimated_seconds,
    v_reason,
    p_visible_from,
    p_visible_until,
    coalesce(p_notify, true),
    p_admin_id
  )
  returning * into v_row;

  if coalesce(p_notify, true) then
    select title_ko into v_title from public.nodes where id = p_node_id;
    insert into public.notifications (user_id, title, body, notification_type)
    values (
      p_user_id,
      '회원님에게 새로운 우선 업무가 배정됐어요.',
      coalesce(v_title, '전용 업무') || '가 작업실에 도착했어요.' ||
        case when v_reason is null then '' else ' 배정 사유: ' || v_reason end,
      'work'
    );
  end if;

  return v_row;
end;
$$;

revoke all on function public.putduk_admin_assign_task(uuid, uuid, uuid, numeric, integer, text, timestamptz, timestamptz, boolean)
  from public, anon, authenticated;
grant execute on function public.putduk_admin_assign_task(uuid, uuid, uuid, numeric, integer, text, timestamptz, timestamptz, boolean)
  to service_role;

comment on function public.putduk_member_submit_withdrawal(uuid, text, numeric, text, text, text, text, text, text, text) is
  '출금 신청. KYC·비밀번호·잔액을 확인한 뒤 출금 가능 잔액을 보류한다.';
comment on function public.putduk_admin_review_deposit(uuid, uuid, text, text) is
  '입금 승인 시 원장과 지갑을 함께 반영하고, 중복 승인은 idempotency로 막는다.';

commit;
