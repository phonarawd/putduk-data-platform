-- 운영자 전용 권한 확인·감사 기록 RPC
-- 서비스 키를 가진 서버 함수만 호출할 수 있도록 service_role에만 실행 권한을 준다.

begin;

create or replace function public.putduk_admin_has_role(
  p_user_id uuid,
  p_roles text[]
)
returns boolean
language sql
stable
set search_path = pg_catalog, public, private
as $$
  select
    p_user_id is not null
    and coalesce(cardinality(p_roles), 0) > 0
    and exists (
      select 1
      from private.admin_roles ar
      where ar.user_id = p_user_id
        and ar.role = any(p_roles)
    );
$$;

revoke all on function public.putduk_admin_has_role(uuid, text[]) from public, anon, authenticated;
grant execute on function public.putduk_admin_has_role(uuid, text[]) to service_role;

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
set search_path = pg_catalog, public, private
as $$
declare
  v_id uuid;
begin
  if p_admin_id is null
     or not exists (select 1 from auth.users u where u.id = p_admin_id)
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

comment on function public.putduk_admin_has_role(uuid, text[]) is
  '서비스 서버가 운영자 역할을 확인할 때 사용하는 service_role 전용 함수.';
comment on function public.putduk_admin_append_audit(uuid, text, text, uuid, text, jsonb, jsonb) is
  '운영자 변경 기록을 private.admin_audit_logs에 남기는 service_role 전용 함수.';

commit;
