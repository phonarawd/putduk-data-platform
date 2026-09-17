-- private 테이블 정책과 공개 이벤트 함수 권한 보완
-- 원격 보안 점검에서 확인된 기본 PUBLIC 실행 권한을 제거한다.

begin;

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
    execute format(
      'drop policy if exists private_service_role_full_access on %I.%I',
      target.schema_name,
      target.table_name
    );
    execute format(
      'create policy private_service_role_full_access on %I.%I for all to service_role using (true) with check (true)',
      target.schema_name,
      target.table_name
    );
  end loop;
end
$$;

do $$
begin
  if to_regprocedure('public.rls_auto_enable()') is not null then
    execute 'revoke execute on function public.rls_auto_enable() from public';
    execute 'revoke execute on function public.rls_auto_enable() from anon, authenticated';
  end if;
end
$$;

commit;