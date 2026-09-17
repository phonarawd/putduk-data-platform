-- 입금 안내 계좌는 private 테이블이 진실이다. Data API에 private가 없어 service_role RPC로만 읽고 쓴다.

begin;

create or replace function public.putduk_list_enabled_payout_destinations()
returns table (
  id uuid,
  destination_type text,
  label text,
  masked_value text,
  qr_asset_path text,
  bank_name text,
  account_holder text,
  guidance_text text,
  usdt_network text
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
    d.qr_asset_path,
    d.bank_name,
    d.account_holder,
    d.guidance_text,
    d.usdt_network
  from private.payout_destinations d
  where d.enabled = true
  order by d.created_at asc;
$$;

revoke all on function public.putduk_list_enabled_payout_destinations() from public, anon, authenticated;
grant execute on function public.putduk_list_enabled_payout_destinations() to service_role;

comment on function public.putduk_list_enabled_payout_destinations() is
  '회원 입금 화면에 보여줄 운영자 등록 계좌·USDT. 원문은 반환하지 않는다.';

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
          d.guidance_text,
          d.usdt_network,
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
  p_usdt_network text default null
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
  v_id uuid;
  v_row private.payout_destinations%rowtype;
begin
  perform private.putduk_assert_admin(p_admin_id, array['super_admin', 'finance']);
  v_type := lower(nullif(trim(coalesce(p_destination_type, '')), ''));
  if v_type is null or v_type not in ('bank', 'usdt') then
    raise exception using errcode = '22023', message = '원화 계좌 또는 USDT를 선택해 주세요.';
  end if;
  v_label := nullif(trim(coalesce(p_label, '')), '');
  v_masked := nullif(trim(coalesce(p_masked_value, '')), '');
  if v_label is null then
    raise exception using errcode = '22023', message = '표시 이름을 입력해 주세요.';
  end if;
  if v_masked is null then
    raise exception using errcode = '22023', message = '마스킹 값을 입력해 주세요.';
  end if;

  if p_destination_id is not null then
    update private.payout_destinations
      set destination_type = v_type,
          label = v_label,
          masked_value = v_masked,
          encrypted_value = nullif(trim(coalesce(p_encrypted_value, '')), ''),
          qr_asset_path = nullif(trim(coalesce(p_qr_asset_path, '')), ''),
          enabled = coalesce(p_enabled, true),
          bank_name = nullif(trim(coalesce(p_bank_name, '')), ''),
          account_holder = nullif(trim(coalesce(p_account_holder, '')), ''),
          guidance_text = nullif(trim(coalesce(p_guidance_text, '')), ''),
          usdt_network = nullif(trim(coalesce(p_usdt_network, '')), ''),
          created_by = coalesce(created_by, p_admin_id),
          updated_at = now()
    where id = p_destination_id
    returning * into v_row;
    if not found then
      raise exception using errcode = '22023', message = '입금 안내를 찾지 못했어요.';
    end if;
    v_id := v_row.id;
  else
    insert into private.payout_destinations (
      destination_type, label, masked_value, encrypted_value, qr_asset_path, enabled,
      bank_name, account_holder, guidance_text, usdt_network, created_by, updated_at
    ) values (
      v_type, v_label, v_masked, nullif(trim(coalesce(p_encrypted_value, '')), ''),
      nullif(trim(coalesce(p_qr_asset_path, '')), ''), coalesce(p_enabled, true),
      nullif(trim(coalesce(p_bank_name, '')), ''), nullif(trim(coalesce(p_account_holder, '')), ''),
      nullif(trim(coalesce(p_guidance_text, '')), ''), nullif(trim(coalesce(p_usdt_network, '')), ''),
      p_admin_id, now()
    )
    returning * into v_row;
    v_id := v_row.id;
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
    'created_at', v_row.created_at,
    'updated_at', v_row.updated_at
  );
end;
$$;

revoke all on function public.putduk_admin_payout_destination_upsert(uuid, uuid, text, text, text, text, text, boolean, text, text, text, text)
  from public, anon, authenticated;
grant execute on function public.putduk_admin_payout_destination_upsert(uuid, uuid, text, text, text, text, text, boolean, text, text, text, text)
  to service_role;

commit;
