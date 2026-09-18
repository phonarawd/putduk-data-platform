-- 운영자 입금 안내 실제 삭제. 숨김 토글과 별개다.
-- deposit_requests.destination_id 는 on delete set null 이라 과거 신청은 남는다.
-- 원문 계좌·USDT는 반환하지 않는다. 회원 공개 목록은 행이 없어져서 바로 빠진다.

begin;

create or replace function public.putduk_admin_payout_destination_delete(
  p_admin_id uuid,
  p_destination_id uuid,
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
    v_reason := '회원 입금 안내에서 삭제';
  end if;

  delete from private.payout_destinations where id = p_destination_id;

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

  return jsonb_build_object(
    'ok', true,
    'id', v_row.id,
    'destination_type', v_row.destination_type,
    'label', v_row.label,
    'deleted', true,
    'last_change_reason', v_reason
  );
end;
$$;

revoke all on function public.putduk_admin_payout_destination_delete(uuid, uuid, text)
  from public, anon, authenticated;
grant execute on function public.putduk_admin_payout_destination_delete(uuid, uuid, text)
  to service_role;

comment on function public.putduk_admin_payout_destination_delete(uuid, uuid, text) is
  '운영자 입금 안내 실제 삭제. 회원 공개 목록에서 바로 빠지고, 과거 입금 신청 destination_id는 비운다. 원문은 반환하지 않는다.';

commit;
