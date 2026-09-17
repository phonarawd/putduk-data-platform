-- 감사 RPC가 auth.users를 직접 읽지 않게 한다.
-- service_role은 auth.users SELECT가 막혀 있어, 잔액 조정 후 감사가 실패하고
-- 원장만 반영된 채 화면이 오류를 보게 되었다.

begin;

create or replace function public.putduk_admin_append_audit(
  p_admin_id uuid,
  p_action text,
  p_target_type text default null,
  p_target_id uuid default null,
  p_reason text default null,
  p_before jsonb default null,
  p_after jsonb default null
)
returns uuid
language plpgsql
volatile
security definer
set search_path = pg_catalog, public, private
as $$
declare
  v_id uuid;
begin
  if p_admin_id is null
     or not exists (
       select 1
       from private.admin_roles ar
       where ar.user_id = p_admin_id
     )
  then
    raise exception using errcode = '22023', message = '유효한 운영자 계정이 필요합니다.';
  end if;

  if nullif(trim(coalesce(p_action, '')), '') is null then
    raise exception using errcode = '22023', message = '감사 기록 동작명이 필요합니다.';
  end if;

  insert into private.admin_audit_logs (
    admin_id,
    action,
    target_type,
    target_id,
    reason,
    before_data,
    after_data
  )
  values (
    p_admin_id,
    trim(p_action),
    nullif(trim(coalesce(p_target_type, '')), ''),
    p_target_id,
    nullif(trim(coalesce(p_reason, '')), ''),
    p_before,
    p_after
  )
  returning id into v_id;

  return v_id;
end;
$$;

revoke all on function public.putduk_admin_append_audit(uuid, text, text, uuid, text, jsonb, jsonb)
  from public, anon, authenticated;
grant execute on function public.putduk_admin_append_audit(uuid, text, text, uuid, text, jsonb, jsonb)
  to service_role;

comment on function public.putduk_admin_append_audit(uuid, text, text, uuid, text, jsonb, jsonb) is
  '운영자 변경 기록을 private.admin_audit_logs에 남긴다. 운영자 확인은 admin_roles만 사용한다.';

commit;
