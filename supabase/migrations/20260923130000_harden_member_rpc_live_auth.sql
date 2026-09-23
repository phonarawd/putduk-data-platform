begin;

create or replace function private.putduk_assert_live_member(p_user_id uuid)
returns void
language plpgsql
security definer
set search_path = pg_catalog, auth, public, private
as $function$
declare
  v_confirmed_at timestamptz;
  v_deleted_at timestamptz;
  v_banned_until timestamptz;
begin
  if p_user_id is null then
    raise exception using errcode = '22023', message = '회원 정보가 필요합니다.';
  end if;

  if auth.uid() is not null and auth.uid() <> p_user_id then
    raise exception using errcode = '42501', message = '본인 계정만 사용할 수 있습니다.';
  end if;

  select u.email_confirmed_at, u.deleted_at, u.banned_until
  into v_confirmed_at, v_deleted_at, v_banned_until
  from auth.users u
  where u.id = p_user_id;

  if not found then
    raise exception using errcode = '42501', message = '유효한 회원 계정이 아닙니다.';
  end if;

  if v_confirmed_at is null then
    raise exception using errcode = '42501', message = '이메일 인증이 완료된 회원만 이용할 수 있습니다.';
  end if;

  if v_deleted_at is not null then
    raise exception using errcode = '42501', message = '현재 계정으로 이용할 수 없습니다.';
  end if;

  if v_banned_until is not null and v_banned_until > now() then
    raise exception using errcode = '42501', message = '현재 계정으로 이용할 수 없습니다.';
  end if;
end;
$function$;

revoke all on function private.putduk_assert_live_member(uuid)
  from public, anon, authenticated;
grant execute on function private.putduk_assert_live_member(uuid)
  to service_role;

alter function public.putduk_member_submit_deposit(uuid,text,numeric,text,text,uuid)
  rename to putduk_member_submit_deposit_impl;

alter function public.putduk_member_submit_kyc(uuid,text,text,text)
  rename to putduk_member_submit_kyc_impl;

alter function public.putduk_member_set_withdrawal_pin(uuid,text,text)
  rename to putduk_member_set_withdrawal_pin_impl;

alter function public.putduk_member_verify_withdrawal_pin(uuid,text)
  rename to putduk_member_verify_withdrawal_pin_impl;

alter function public.putduk_member_withdraw_request(uuid,text,numeric,text,text,boolean,text,text,text,text,text,text,text)
  rename to putduk_member_withdraw_request_impl;

alter function public.putduk_member_lock_stake(uuid,uuid)
  rename to putduk_member_lock_stake_impl;

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
as $function$
declare v_row public.deposit_requests%rowtype;
begin
  perform private.putduk_assert_live_member(p_user_id);
  v_row := public.putduk_member_submit_deposit_impl(p_user_id,p_currency,p_amount,p_proof_path,p_note,p_destination_id);
  return v_row;
end;
$function$;

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
as $function$
begin
  perform private.putduk_assert_live_member(p_user_id);
  return public.putduk_member_submit_kyc_impl(p_user_id,p_front_path,p_back_path,p_selfie_path);
end;
$function$;

create or replace function public.putduk_member_set_withdrawal_pin(
  p_user_id uuid,
  p_pin text,
  p_current_pin text default null
)
returns boolean
language plpgsql
security definer
set search_path = pg_catalog, public, private
as $function$
begin
  perform private.putduk_assert_live_member(p_user_id);
  return public.putduk_member_set_withdrawal_pin_impl(p_user_id,p_pin,p_current_pin);
end;
$function$;

create or replace function public.putduk_member_verify_withdrawal_pin(
  p_user_id uuid,
  p_pin text
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public, private
as $function$
begin
  perform private.putduk_assert_live_member(p_user_id);
  return public.putduk_member_verify_withdrawal_pin_impl(p_user_id,p_pin);
end;
$function$;

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
set search_path = pg_catalog, public, private
as $function$
declare v_row public.withdrawal_requests%rowtype;
begin
  perform private.putduk_assert_live_member(p_user_id);
  v_row := public.putduk_member_withdraw_request_impl(
    p_user_id,p_currency,p_amount,p_pin,p_destination_type,p_include_principal,
    p_bank_name,p_account_holder,p_account_number,p_usdt_network,p_usdt_address,
    p_masked_value,p_destination_label
  );
  return v_row;
end;
$function$;

create or replace function public.putduk_member_lock_stake(
  p_user_id uuid,
  p_task_run_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public, private
as $function$
declare v_row jsonb;
begin
  perform private.putduk_assert_live_member(p_user_id);
  v_row := public.putduk_member_lock_stake_impl(p_user_id,p_task_run_id);
  return v_row;
end;
$function$;

revoke all on function public.putduk_member_submit_deposit(uuid,text,numeric,text,text,uuid) from public, anon, authenticated;
revoke all on function public.putduk_member_submit_kyc(uuid,text,text,text) from public, anon, authenticated;
revoke all on function public.putduk_member_set_withdrawal_pin(uuid,text,text) from public, anon, authenticated;
revoke all on function public.putduk_member_verify_withdrawal_pin(uuid,text) from public, anon, authenticated;
revoke all on function public.putduk_member_withdraw_request(uuid,text,numeric,text,text,boolean,text,text,text,text,text,text,text) from public, anon, authenticated;
revoke all on function public.putduk_member_lock_stake(uuid,uuid) from public, anon, authenticated;

grant execute on function public.putduk_member_submit_deposit(uuid,text,numeric,text,text,uuid) to service_role;
grant execute on function public.putduk_member_submit_kyc(uuid,text,text,text) to service_role;
grant execute on function public.putduk_member_set_withdrawal_pin(uuid,text,text) to service_role;
grant execute on function public.putduk_member_verify_withdrawal_pin(uuid,text) to service_role;
grant execute on function public.putduk_member_withdraw_request(uuid,text,numeric,text,text,boolean,text,text,text,text,text,text,text) to service_role;
grant execute on function public.putduk_member_lock_stake(uuid,uuid) to service_role;

commit;