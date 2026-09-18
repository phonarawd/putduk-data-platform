-- 입금 안내 회원 표시 토글. 원문 없이 enabled만 바꾼다.
-- 숨기면 회원 PIN 공개·잠금 목록에서 바로 빠지도록 카탈로그 버전을 올린다.
-- upsert는 수정 시 빈 원문을 기존 값으로 유지한다. enc.v1. 암호문은 마스킹에 쓰지 않는다.

begin;

create or replace function public.putduk_admin_payout_destination_set_enabled(
  p_admin_id uuid,
  p_destination_id uuid,
  p_enabled boolean,
  p_change_reason text default null
)
returns jsonb
language plpgsql
volatile
security definer
set search_path = pg_catalog, public, private
as $$
declare
  v_row private.payout_destinations%rowtype;
  v_reason text;
  v_changed boolean := false;
begin
  perform private.putduk_assert_admin(p_admin_id, array['super_admin', 'finance']);
  if p_destination_id is null then
    raise exception using errcode = '22023', message = '입금 안내를 선택해 주세요.';
  end if;
  select * into v_row from private.payout_destinations where id = p_destination_id;
  if not found then
    raise exception using errcode = '22023', message = '입금 안내를 찾지 못했어요.';
  end if;
  v_reason := nullif(trim(coalesce(p_change_reason, '')), '');
  if v_reason is null then
    v_reason := case when coalesce(p_enabled, true) then '회원 입금 안내에 다시 표시' else '회원 입금 안내에서 숨김' end;
  end if;
  v_changed := v_row.enabled is distinct from coalesce(p_enabled, true);
  update private.payout_destinations
    set enabled = coalesce(p_enabled, true),
        last_change_reason = v_reason,
        updated_at = now()
  where id = p_destination_id
  returning * into v_row;

  if v_changed then
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
    'guidance_text', v_row.guidance_text,
    'usdt_network', v_row.usdt_network,
    'memo', v_row.memo,
    'info_version', v_row.info_version,
    'last_change_reason', v_row.last_change_reason,
    'has_account_number', nullif(trim(coalesce(v_row.account_number, '')), '') is not null,
    'has_usdt_address', nullif(trim(coalesce(v_row.usdt_address, '')), '') is not null,
    'address_mode', 'operator_fixed',
    'created_at', v_row.created_at,
    'updated_at', v_row.updated_at
  );
end;
$$;

revoke all on function public.putduk_admin_payout_destination_set_enabled(uuid, uuid, boolean, text)
  from public, anon, authenticated;
grant execute on function public.putduk_admin_payout_destination_set_enabled(uuid, uuid, boolean, text)
  to service_role;

comment on function public.putduk_admin_payout_destination_set_enabled(uuid, uuid, boolean, text) is
  '입금 안내 회원 표시/숨김. 원문은 건드리지 않고, 숨기면 회원 공개 목록에서 바로 빠진다.';

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
  v_enabled_changed boolean := false;
begin
  perform private.putduk_assert_admin(p_admin_id, array['super_admin', 'finance']);
  v_type := lower(nullif(trim(coalesce(p_destination_type, '')), ''));
  if v_type is null or v_type not in ('bank', 'usdt') then
    raise exception using errcode = '22023', message = '원화 계좌 또는 USDT를 선택해 주세요.';
  end if;
  v_label := nullif(trim(coalesce(p_label, '')), '');
  v_account := nullif(trim(coalesce(p_account_number, '')), '');
  v_usdt := nullif(trim(coalesce(p_usdt_address, '')), '');
  v_reason := nullif(trim(coalesce(p_change_reason, '')), '');
  if v_type = 'usdt' then
    v_usdt := coalesce(v_usdt, nullif(trim(coalesce(p_encrypted_value, '')), ''));
  else
    v_account := coalesce(v_account, nullif(trim(coalesce(p_encrypted_value, '')), ''));
  end if;

  if p_destination_id is not null then
    select * into v_row from private.payout_destinations where id = p_destination_id;
    if not found then
      raise exception using errcode = '22023', message = '입금 안내를 찾지 못했어요.';
    end if;
    if v_account is null then
      v_account := v_row.account_number;
    end if;
    if v_usdt is null then
      v_usdt := v_row.usdt_address;
    end if;
  end if;

  if p_destination_id is null and v_type = 'bank' and v_account is null then
    raise exception using errcode = '22023', message = '원화 계좌번호를 입력해 주세요.';
  end if;
  if p_destination_id is null and v_type = 'usdt' and v_usdt is null then
    raise exception using errcode = '22023', message = 'USDT 주소를 입력해 주세요.';
  end if;

  v_masked := nullif(trim(coalesce(p_masked_value, '')), '');
  if v_masked is null then
    if coalesce(v_account, '') like 'enc.v1.%' or coalesce(v_usdt, '') like 'enc.v1.%' then
      v_masked := coalesce(v_row.masked_value, '****');
    elsif v_type = 'bank' then
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
    v_secrets_changed :=
      coalesce(v_row.account_number, '') is distinct from coalesce(v_account, '')
      or coalesce(v_row.usdt_address, '') is distinct from coalesce(v_usdt, '')
      or coalesce(v_row.qr_asset_path, '') is distinct from coalesce(nullif(trim(coalesce(p_qr_asset_path, '')), ''), '');
    v_enabled_changed := v_row.enabled is distinct from coalesce(p_enabled, true);
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
          bank_name = coalesce(nullif(trim(coalesce(p_bank_name, '')), ''), bank_name),
          account_holder = coalesce(nullif(trim(coalesce(p_account_holder, '')), ''), account_holder),
          guidance_text = coalesce(nullif(trim(coalesce(p_guidance_text, '')), ''), guidance_text),
          usdt_network = coalesce(nullif(trim(coalesce(p_usdt_network, '')), ''), case when v_type = 'usdt' then 'TRC20' else usdt_network end),
          account_number = v_account,
          usdt_address = v_usdt,
          memo = coalesce(nullif(trim(coalesce(p_memo, '')), ''), memo),
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

  if v_secrets_changed or v_enabled_changed then
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
    'guidance_text', v_row.guidance_text,
    'usdt_network', v_row.usdt_network,
    'memo', v_row.memo,
    'info_version', v_row.info_version,
    'last_change_reason', v_row.last_change_reason,
    'has_account_number', nullif(trim(coalesce(v_row.account_number, '')), '') is not null,
    'has_usdt_address', nullif(trim(coalesce(v_row.usdt_address, '')), '') is not null,
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
