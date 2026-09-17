-- 입금 안내 PIN 게이트. PIN 평문 금지(scrypt 해시는 Edge에서 저장).
-- USDT 입금 주소는 운영자 고정(operator_fixed). 회원별 TRC20 자동생성은
-- 입금 매칭 엔진이 없어 쓰지 않는다. 주소 변경 시 같은 destination_id를 유지하고
-- info_version·catalog_version만 올려 이전 공개 토큰을 무효화한다.

begin;

alter table private.payout_destinations
  add column if not exists account_number text,
  add column if not exists usdt_address text,
  add column if not exists memo text,
  add column if not exists info_version integer not null default 1,
  add column if not exists last_change_reason text;

comment on column private.payout_destinations.account_number is
  '원화 입금 계좌 원문. 회원 GET에는 내리지 않고 PIN 공개 후에만 반환한다.';
comment on column private.payout_destinations.usdt_address is
  '운영자 고정 TRC20 입금 주소. 회원별 자동생성이 아니다.';
comment on column private.payout_destinations.info_version is
  '입금 정보 버전. 주소·계좌가 바뀌면 증가하고 이전 공개 토큰은 무효.';

create table if not exists private.deposit_info_catalog (
  id smallint primary key default 1 check (id = 1),
  catalog_version integer not null default 1,
  updated_at timestamptz not null default now()
);

insert into private.deposit_info_catalog (id, catalog_version)
values (1, 1)
on conflict (id) do nothing;

comment on table private.deposit_info_catalog is
  '입금 안내 전체 버전. 계좌·USDT가 바뀌면 올라가고 공개 토큰이 이 값에 묶인다.';

create table if not exists private.security_pins (
  user_id uuid primary key references public.profiles(id) on delete cascade,
  pin_hash text not null,
  kdf text not null default 'scrypt',
  failed_attempts integer not null default 0 check (failed_attempts >= 0),
  locked_until timestamptz,
  updated_at timestamptz not null default now(),
  check (kdf = 'scrypt')
);

comment on table private.security_pins is
  '입금 안내 공개용 보안 PIN 해시(scrypt). 평문·운영자 조회 불가. 출금 PIN(private.withdrawal_pins)과 분리.';

create table if not exists private.security_pin_ip_locks (
  ip_hash text primary key,
  failed_attempts integer not null default 0 check (failed_attempts >= 0),
  locked_until timestamptz,
  updated_at timestamptz not null default now()
);

create table if not exists private.deposit_info_reveal_tokens (
  id uuid primary key default gen_random_uuid(),
  token_hash text not null unique,
  user_id uuid not null references public.profiles(id) on delete cascade,
  scope text not null check (scope in ('deposit_info_reveal', 'withdrawal_step_up')),
  catalog_version integer not null,
  expires_at timestamptz not null,
  used_at timestamptz,
  revoked_at timestamptz,
  created_at timestamptz not null default now()
);

create index if not exists deposit_info_reveal_tokens_user_idx
  on private.deposit_info_reveal_tokens (user_id, created_at desc);

comment on table private.deposit_info_reveal_tokens is
  '입금 안내 짧은 공개 토큰. 해시만 저장. 사용자·scope·catalog_version에 한정, 재사용 금지.';

create table if not exists private.security_pin_audit (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references public.profiles(id) on delete set null,
  actor_id uuid references auth.users(id) on delete set null,
  event text not null,
  scope text,
  ip_hash text,
  meta jsonb,
  created_at timestamptz not null default now()
);

create index if not exists security_pin_audit_created_idx
  on private.security_pin_audit (created_at desc);

comment on table private.security_pin_audit is
  '보안 PIN·입금 안내 공개 감사. PIN 원문은 기록하지 않는다.';

alter table private.deposit_info_catalog enable row level security;
alter table private.security_pins enable row level security;
alter table private.security_pin_ip_locks enable row level security;
alter table private.deposit_info_reveal_tokens enable row level security;
alter table private.security_pin_audit enable row level security;

drop policy if exists private_service_role_full_access on private.deposit_info_catalog;
create policy private_service_role_full_access
  on private.deposit_info_catalog for all to service_role
  using (true) with check (true);

drop policy if exists private_service_role_full_access on private.security_pins;
create policy private_service_role_full_access
  on private.security_pins for all to service_role
  using (true) with check (true);

drop policy if exists private_service_role_full_access on private.security_pin_ip_locks;
create policy private_service_role_full_access
  on private.security_pin_ip_locks for all to service_role
  using (true) with check (true);

drop policy if exists private_service_role_full_access on private.deposit_info_reveal_tokens;
create policy private_service_role_full_access
  on private.deposit_info_reveal_tokens for all to service_role
  using (true) with check (true);

drop policy if exists private_service_role_full_access on private.security_pin_audit;
create policy private_service_role_full_access
  on private.security_pin_audit for all to service_role
  using (true) with check (true);

grant select, insert, update, delete on private.deposit_info_catalog to service_role;
grant select, insert, update, delete on private.security_pins to service_role;
grant select, insert, update, delete on private.security_pin_ip_locks to service_role;
grant select, insert, update, delete on private.deposit_info_reveal_tokens to service_role;
grant select, insert, update, delete on private.security_pin_audit to service_role;

drop function if exists public.putduk_list_enabled_payout_destinations();

create or replace function public.putduk_list_enabled_payout_destinations()
returns table (
  id uuid,
  destination_type text,
  label text,
  masked_value text,
  bank_name text,
  usdt_network text,
  has_qr boolean,
  info_version integer
)
language sql
stable
security definer
set search_path = pg_catalog, public, private
as $$
  select
    d.id,
    d.destination_type,
    d.label,
    d.masked_value,
    d.bank_name,
    d.usdt_network,
    (nullif(trim(coalesce(d.qr_asset_path, '')), '') is not null) as has_qr,
    d.info_version
  from private.payout_destinations d
  where d.enabled = true
  order by d.created_at asc;
$$;

revoke all on function public.putduk_list_enabled_payout_destinations() from public, anon, authenticated;
grant execute on function public.putduk_list_enabled_payout_destinations() to service_role;

comment on function public.putduk_list_enabled_payout_destinations() is
  'PIN 없이 내려도 되는 입금 안내 잠금 뷰. 계좌·USDT 원문·QR·예금주·메모는 반환하지 않는다.';

create or replace function public.putduk_admin_payout_destinations_list(p_admin_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = pg_catalog, public, private
as $$
begin
  perform private.putduk_assert_admin(p_admin_id, array['super_admin', 'finance']);
  return coalesce(
    (
      select jsonb_agg(row_to_json(x)::jsonb order by x.created_at desc)
      from (
        select
          d.id,
          d.destination_type,
          d.label,
          d.masked_value,
          d.qr_asset_path,
          d.enabled,
          d.bank_name,
          d.account_holder,
          d.account_number,
          d.guidance_text,
          d.usdt_network,
          d.usdt_address,
          d.memo,
          d.info_version,
          d.last_change_reason,
          d.created_at,
          d.updated_at
        from private.payout_destinations d
      ) x
    ),
    '[]'::jsonb
  );
end;
$$;

revoke all on function public.putduk_admin_payout_destinations_list(uuid) from public, anon, authenticated;
grant execute on function public.putduk_admin_payout_destinations_list(uuid) to service_role;

drop function if exists public.putduk_admin_payout_destination_upsert(uuid, uuid, text, text, text, text, text, boolean, text, text, text, text);

create or replace function public.putduk_admin_payout_destination_upsert(
  p_admin_id uuid,
  p_destination_id uuid default null,
  p_destination_type text default 'bank',
  p_label text default null,
  p_masked_value text default null,
  p_encrypted_value text default null,
  p_qr_asset_path text default null,
  p_enabled boolean default true,
  p_bank_name text default null,
  p_account_holder text default null,
  p_guidance_text text default null,
  p_usdt_network text default null,
  p_account_number text default null,
  p_usdt_address text default null,
  p_memo text default null,
  p_change_reason text default null
)
returns jsonb
language plpgsql
volatile
security definer
set search_path = pg_catalog, public, private
as $$
declare
  v_type text;
  v_label text;
  v_masked text;
  v_row private.payout_destinations%rowtype;
  v_account text;
  v_usdt text;
  v_reason text;
  v_version integer;
  v_secrets_changed boolean := false;
begin
  perform private.putduk_assert_admin(p_admin_id, array['super_admin', 'finance']);
  v_type := lower(nullif(trim(coalesce(p_destination_type, '')), ''));
  if v_type is null or v_type not in ('bank', 'usdt') then
    raise exception using errcode = '22023', message = '원화 계좌 또는 USDT를 선택해 주세요.';
  end if;
  v_label := nullif(trim(coalesce(p_label, '')), '');
  v_account := nullif(trim(coalesce(p_account_number, p_encrypted_value, '')), '');
  v_usdt := nullif(trim(coalesce(p_usdt_address, case when v_type = 'usdt' then p_encrypted_value else null end, '')), '');
  v_reason := nullif(trim(coalesce(p_change_reason, '')), '');
  if v_type = 'usdt' then
    v_usdt := coalesce(v_usdt, nullif(trim(coalesce(p_encrypted_value, '')), ''));
  else
    v_account := coalesce(v_account, nullif(trim(coalesce(p_encrypted_value, '')), ''));
  end if;

  if v_type = 'bank' and v_account is null then
    raise exception using errcode = '22023', message = '원화 계좌번호를 입력해 주세요.';
  end if;
  if v_type = 'usdt' and v_usdt is null then
    raise exception using errcode = '22023', message = 'USDT 주소를 입력해 주세요.';
  end if;

  v_masked := nullif(trim(coalesce(p_masked_value, '')), '');
  if v_masked is null then
    if v_type = 'bank' then
      v_masked := left(coalesce(nullif(trim(coalesce(p_bank_name, '')), ''), '계좌'), 20)
        || ' ****' || right(regexp_replace(v_account, '\s', '', 'g'), 4);
    else
      v_masked := left(v_usdt, 6) || '…' || right(v_usdt, 4);
    end if;
  end if;
  if v_label is null then
    v_label := case when v_type = 'usdt' then 'USDT 입금' else '원화 입금 계좌' end;
  end if;

  if p_destination_id is not null then
    select * into v_row from private.payout_destinations where id = p_destination_id;
    if not found then
      raise exception using errcode = '22023', message = '입금 안내를 찾지 못했어요.';
    end if;
    v_secrets_changed :=
      coalesce(v_row.account_number, '') is distinct from coalesce(v_account, '')
      or coalesce(v_row.usdt_address, '') is distinct from coalesce(v_usdt, '')
      or coalesce(v_row.qr_asset_path, '') is distinct from coalesce(nullif(trim(coalesce(p_qr_asset_path, '')), ''), '');
    if v_secrets_changed and v_reason is null then
      raise exception using errcode = '22023', message = '계좌·주소를 바꿀 때는 변경 사유를 남겨 주세요.';
    end if;
    v_version := coalesce(v_row.info_version, 1);
    if v_secrets_changed then
      v_version := v_version + 1;
    end if;
    update private.payout_destinations
      set destination_type = v_type,
          label = v_label,
          masked_value = v_masked,
          encrypted_value = coalesce(v_account, v_usdt),
          qr_asset_path = nullif(trim(coalesce(p_qr_asset_path, '')), ''),
          enabled = coalesce(p_enabled, true),
          bank_name = nullif(trim(coalesce(p_bank_name, '')), ''),
          account_holder = nullif(trim(coalesce(p_account_holder, '')), ''),
          guidance_text = nullif(trim(coalesce(p_guidance_text, '')), ''),
          usdt_network = coalesce(nullif(trim(coalesce(p_usdt_network, '')), ''), case when v_type = 'usdt' then 'TRC20' else null end),
          account_number = v_account,
          usdt_address = v_usdt,
          memo = nullif(trim(coalesce(p_memo, '')), ''),
          info_version = v_version,
          last_change_reason = coalesce(v_reason, last_change_reason),
          created_by = coalesce(created_by, p_admin_id),
          updated_at = now()
    where id = p_destination_id
    returning * into v_row;
  else
    if v_reason is null then
      v_reason := '최초 등록';
    end if;
    insert into private.payout_destinations (
      destination_type, label, masked_value, encrypted_value, qr_asset_path, enabled,
      bank_name, account_holder, guidance_text, usdt_network, created_by, updated_at,
      account_number, usdt_address, memo, info_version, last_change_reason
    ) values (
      v_type, v_label, v_masked, coalesce(v_account, v_usdt),
      nullif(trim(coalesce(p_qr_asset_path, '')), ''), coalesce(p_enabled, true),
      nullif(trim(coalesce(p_bank_name, '')), ''), nullif(trim(coalesce(p_account_holder, '')), ''),
      nullif(trim(coalesce(p_guidance_text, '')), ''),
      coalesce(nullif(trim(coalesce(p_usdt_network, '')), ''), case when v_type = 'usdt' then 'TRC20' else null end),
      p_admin_id, now(),
      v_account, v_usdt, nullif(trim(coalesce(p_memo, '')), ''), 1, v_reason
    )
    returning * into v_row;
    v_secrets_changed := true;
  end if;

  if v_secrets_changed then
    insert into private.deposit_info_catalog (id, catalog_version, updated_at)
    values (1, 1, now())
    on conflict (id) do update
      set catalog_version = private.deposit_info_catalog.catalog_version + 1,
          updated_at = now();
    update private.deposit_info_reveal_tokens
      set revoked_at = now()
    where revoked_at is null
      and used_at is null
      and scope = 'deposit_info_reveal';
  end if;

  return jsonb_build_object(
    'id', v_row.id,
    'destination_type', v_row.destination_type,
    'label', v_row.label,
    'masked_value', v_row.masked_value,
    'qr_asset_path', v_row.qr_asset_path,
    'enabled', v_row.enabled,
    'bank_name', v_row.bank_name,
    'account_holder', v_row.account_holder,
    'account_number', v_row.account_number,
    'guidance_text', v_row.guidance_text,
    'usdt_network', v_row.usdt_network,
    'usdt_address', v_row.usdt_address,
    'memo', v_row.memo,
    'info_version', v_row.info_version,
    'last_change_reason', v_row.last_change_reason,
    'address_mode', 'operator_fixed',
    'created_at', v_row.created_at,
    'updated_at', v_row.updated_at
  );
end;
$$;

revoke all on function public.putduk_admin_payout_destination_upsert(
  uuid, uuid, text, text, text, text, text, boolean, text, text, text, text, text, text, text, text
) from public, anon, authenticated;
grant execute on function public.putduk_admin_payout_destination_upsert(
  uuid, uuid, text, text, text, text, text, boolean, text, text, text, text, text, text, text, text
) to service_role;

commit;
