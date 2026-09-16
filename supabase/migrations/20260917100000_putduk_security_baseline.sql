-- 운영 공개 전 보안 기본선
-- 이 migration은 원격 프로젝트에 검토·승인한 뒤 적용한다.

begin;

-- private 스키마는 API에 노출하지 않지만, 우발적인 권한 변경에도
-- 민감 정보가 보호되도록 모든 테이블에 RLS를 켠다.
do $$
declare
  target record;
begin
  for target in
    select n.nspname as schema_name, c.relname as table_name
    from pg_class c
    join pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'private'
      and c.relkind = 'r'
  loop
    execute format('alter table %I.%I enable row level security', target.schema_name, target.table_name);
  end loop;
end
$$;

-- 공개 RPC로 남아 있는 자동 RLS 보조 함수가 있다면 외부 실행을 차단한다.
-- 함수 자체는 삭제하지 않아 기존 관리 작업을 점검한 뒤 대체할 수 있다.
do $$
begin
  if to_regprocedure('public.rls_auto_enable()') is not null then
    execute 'revoke execute on function public.rls_auto_enable() from anon, authenticated';
  end if;
end
$$;

revoke all on schema private from anon, authenticated;
revoke all on all tables in schema private from anon, authenticated;
revoke all on all sequences in schema private from anon, authenticated;
revoke all on all functions in schema private from anon, authenticated;
grant usage on schema private to service_role;
grant select, insert, update, delete on all tables in schema private to service_role;
grant usage, select, update on all sequences in schema private to service_role;

commit;
