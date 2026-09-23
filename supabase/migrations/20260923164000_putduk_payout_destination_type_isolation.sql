begin;

-- 지급 목적지는 타입별 비밀 필드가 서로 섞이지 않도록 정규화한다.
-- 기존 행에서는 현재 목적지 타입과 무관한 레거시 필드만 제거한다.
update private.payout_destinations
set
  bank_name = case when destination_type = 'bank' then bank_name else null end,
  account_holder = case when destination_type = 'bank' then account_holder else null end,
  account_number = case when destination_type = 'bank' then account_number else null end,
  usdt_network = case when destination_type = 'usdt' then usdt_network else null end,
  usdt_address = case when destination_type = 'usdt' then usdt_address else null end,
  encrypted_value = case
    when destination_type = 'bank' then account_number
    when destination_type = 'usdt' then usdt_address
    else encrypted_value
  end,
  info_version = coalesce(info_version, 1) + 1,
  updated_at = now()
where
  (destination_type = 'usdt' and (
    nullif(trim(coalesce(account_number, '')), '') is not null
    or nullif(trim(coalesce(account_holder, '')), '') is not null
    or nullif(trim(coalesce(bank_name, '')), '') is not null
  ))
  or
  (destination_type = 'bank' and (
    nullif(trim(coalesce(usdt_address, '')), '') is not null
    or nullif(trim(coalesce(usdt_network, '')), '') is not null
  ));

alter table private.payout_destinations
  drop constraint if exists payout_destinations_type_fields_check;

alter table private.payout_destinations
  add constraint payout_destinations_type_fields_check
  check (
    (
      destination_type = 'bank'
      and account_number is not null
      and account_number like 'enc.v1.%'
      and encrypted_value is not null
      and encrypted_value like 'enc.v1.%'
      and usdt_address is null
      and usdt_network is null
    )
    or
    (
      destination_type = 'usdt'
      and usdt_address is not null
      and usdt_address like 'enc.v1.%'
      and encrypted_value is not null
      and encrypted_value like 'enc.v1.%'
      and account_number is null
      and account_holder is null
      and bank_name is null
    )
  );

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
  v_bank_name text;
  v_account_holder text;
  v_guidance text;
  v_network text;
  v_memo text;
  v_qr text;
  v_reason text;
  v_version integer;
  v_secrets_changed boolean := false;
  v_metadata_changed boolean := false;
  v_type_changed boolean := false;
  v_info_changed boolean := false;
  v_enabled boolean := coalesce(p_enabled, true);
begin
  perform private.putduk_assert_admin(p_admin_id, array['super_admin', 'finance']);

  v_type := lower(nullif(trim(coalesce(p_destination_type, '')), ''));
  if v_type is null or v_type not in ('bank', 'usdt') then
    raise exception using errcode = '22023', message = '원화 계좌 또는 USDT를 선택해 주세요.';
  end if;

  v_label := nullif(trim(coalesce(p_label, '')), '');
  v_masked := nullif(trim(coalesce(p_masked_value, '')), '');
  v_account := nullif(trim(coalesce(p_account_number, '')), '');
  v_usdt := nullif(trim(coalesce(p_usdt_address, '')), '');
  v_bank_name := nullif(trim(coalesce(p_bank_name, '')), '');
  v_account_holder := nullif(trim(coalesce(p_account_holder, '')), '');
  v_guidance := nullif(trim(coalesce(p_guidance_text, '')), '');
  v_network := nullif(trim(coalesce(p_usdt_network, '')), '');
  v_memo := nullif(trim(coalesce(p_memo, '')), '');
  v_qr := nullif(trim(coalesce(p_qr_asset_path, '')), '');
  v_reason := nullif(trim(coalesce(p_change_reason, '')), '');

  if v_type = 'usdt' then
    v_usdt := coalesce(v_usdt, nullif(trim(coalesce(p_encrypted_value, '')), ''));
  else
    v_account := coalesce(v_account, nullif(trim(coalesce(p_encrypted_value, '')), ''));
  end if;

  if p_destination_id is not null then
    select * into v_row
    from private.payout_destinations
    where id = p_destination_id;

    if not found then
      raise exception using errcode = '22023', message = '입금 안내를 찾지 못했어요.';
    end if;

    if v_type = 'bank' then
      v_account := coalesce(v_account, v_row.account_number);
      v_bank_name := coalesce(v_bank_name, v_row.bank_name);
      v_account_holder := coalesce(v_account_holder, v_row.account_holder);
      v_network := null;
      v_usdt := null;
    else
      v_usdt := coalesce(v_usdt, v_row.usdt_address);
      v_network := coalesce(v_network, v_row.usdt_network, 'TRC20');
      v_account := null;
      v_bank_name := null;
      v_account_holder := null;
    end if;

    v_guidance := coalesce(v_guidance, v_row.guidance_text);
    v_memo := coalesce(v_memo, v_row.memo);
    v_type_changed := lower(coalesce(v_row.destination_type, '')) is distinct from v_type;
    v_secrets_changed :=
      coalesce(v_row.account_number, '') is distinct from coalesce(case when v_type = 'bank' then v_account end, '')
      or coalesce(v_row.usdt_address, '') is distinct from coalesce(case when v_type = 'usdt' then v_usdt end, '')
      or coalesce(v_row.qr_asset_path, '') is distinct from coalesce(v_qr, '');
    if v_secrets_changed and v_reason is null then
      raise exception using errcode = '22023', message = '계좌·주소·QR 정보를 바꿀 때는 변경 사유를 남겨 주세요.';
    end if;

    v_metadata_changed :=
      coalesce(v_row.destination_type, '') is distinct from v_type
      or coalesce(v_row.label, '') is distinct from coalesce(v_label, '')
      or coalesce(v_row.masked_value, '') is distinct from coalesce(v_masked, '')
      or coalesce(v_row.enabled, false) is distinct from v_enabled
      or coalesce(v_row.bank_name, '') is distinct from coalesce(v_bank_name, '')
      or coalesce(v_row.account_holder, '') is distinct from coalesce(v_account_holder, '')
      or coalesce(v_row.guidance_text, '') is distinct from coalesce(v_guidance, '')
      or coalesce(v_row.usdt_network, '') is distinct from coalesce(v_network, '')
      or coalesce(v_row.memo, '') is distinct from coalesce(v_memo, '');

    v_info_changed := v_secrets_changed or v_metadata_changed or v_type_changed;
    v_version := coalesce(v_row.info_version, 1);
    if v_info_changed then
      v_version := v_version + 1;
    end if;

    if v_type = 'bank' and v_account is null then
      raise exception using errcode = '22023', message = '원화 계좌번호를 입력해 주세요.';
    end if;
    if v_type = 'usdt' and v_usdt is null then
      raise exception using errcode = '22023', message = 'USDT 주소를 입력해 주세요.';
    end if;

    if v_masked is null then
      if v_type = 'bank' and v_account like 'enc.v1.%' then
        v_masked := coalesce(v_row.masked_value, '원화 계좌');
      elsif v_type = 'usdt' and v_usdt like 'enc.v1.%' then
        v_masked := coalesce(v_row.masked_value, 'USDT');
      elsif v_type = 'bank' then
        v_masked := left(coalesce(v_bank_name, '계좌'), 20)
          || ' ****' || right(regexp_replace(v_account, '\s', '', 'g'), 4);
      else
        v_masked := left(v_usdt, 6) || '…' || right(v_usdt, 4);
      end if;
    end if;

    if v_label is null then
      v_label := coalesce(v_row.label, case when v_type = 'usdt' then 'USDT 입금' else '원화 입금 계좌' end);
    end if;

    update private.payout_destinations
    set destination_type = v_type,
        label = v_label,
        masked_value = v_masked,
        encrypted_value = case when v_type = 'bank' then v_account else v_usdt end,
        qr_asset_path = v_qr,
        enabled = v_enabled,
        bank_name = case when v_type = 'bank' then v_bank_name else null end,
        account_holder = case when v_type = 'bank' then v_account_holder else null end,
        guidance_text = v_guidance,
        usdt_network = case when v_type = 'usdt' then v_network else null end,
        account_number = case when v_type = 'bank' then v_account else null end,
        usdt_address = case when v_type = 'usdt' then v_usdt else null end,
        memo = v_memo,
        info_version = v_version,
        last_change_reason = coalesce(v_reason, last_change_reason),
        created_by = coalesce(created_by, p_admin_id),
        updated_at = now()
    where id = p_destination_id
    returning * into v_row;
  else
    if v_type = 'bank' and v_account is null then
      raise exception using errcode = '22023', message = '원화 계좌번호를 입력해 주세요.';
    end if;
    if v_type = 'usdt' and v_usdt is null then
      raise exception using errcode = '22023', message = 'USDT 주소를 입력해 주세요.';
    end if;

    if v_masked is null then
      if v_type = 'bank' and v_account like 'enc.v1.%' then
        v_masked := '원화 계좌';
      elsif v_type = 'usdt' and v_usdt like 'enc.v1.%' then
        v_masked := 'USDT';
      elsif v_type = 'bank' then
        v_masked := left(coalesce(v_bank_name, '계좌'), 20)
          || ' ****' || right(regexp_replace(v_account, '\s', '', 'g'), 4);
      else
        v_masked := left(v_usdt, 6) || '…' || right(v_usdt, 4);
      end if;
    end if;

    if v_label is null then
      v_label := case when v_type = 'usdt' then 'USDT 입금' else '원화 입금 계좌' end;
    end if;

    if v_reason is null then
      v_reason := '최초 등록';
    end if;

    insert into private.payout_destinations (
      destination_type, label, masked_value, encrypted_value, qr_asset_path, enabled,
      bank_name, account_holder, guidance_text, usdt_network, created_by, updated_at,
      account_number, usdt_address, memo, info_version, last_change_reason
    ) values (
      v_type, v_label, v_masked,
      case when v_type = 'bank' then v_account else v_usdt end,
      v_qr, v_enabled,
      case when v_type = 'bank' then v_bank_name else null end,
      case when v_type = 'bank' then v_account_holder else null end,
      v_guidance,
      case when v_type = 'usdt' then coalesce(v_network, 'TRC20') else null end,
      p_admin_id, now(),
      case when v_type = 'bank' then v_account else null end,
      case when v_type = 'usdt' then v_usdt else null end,
      v_memo, 1, v_reason
    )
    returning * into v_row;

    v_secrets_changed := true;
    v_metadata_changed := true;
    v_info_changed := true;
  end if;

  if v_info_changed or v_secrets_changed then
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
