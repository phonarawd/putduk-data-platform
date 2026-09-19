-- 운영자 역할 목록 조회 RPC (PostgREST private 스키마 직접 조회 대신 사용)

begin;

create or replace function public.putduk_admin_list_roles(p_user_id uuid)
returns text[]
language sql
stable
set search_path = pg_catalog, public, private
as $$
  select coalesce(array_agg(ar.role order by ar.role), '{}'::text[])
  from private.admin_roles ar
  where ar.user_id = p_user_id;
$$;

revoke all on function public.putduk_admin_list_roles(uuid) from public, anon, authenticated;
grant execute on function public.putduk_admin_list_roles(uuid) to service_role;

comment on function public.putduk_admin_list_roles(uuid) is
  '서비스 서버가 운영자 역할 목록을 조회할 때 사용하는 service_role 전용 함수.';

commit;
