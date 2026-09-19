-- 배정 전용 node RLS의 task_assignments ↔ nodes 재귀를 끊는다.
-- 배정 존재 확인은 table owner 권한의 SECURITY DEFINER helper로 수행하고
-- policy에서는 helper 결과만 사용한다.

begin;

create or replace function private.putduk_has_active_assignment(
  p_user_id uuid,
  p_node_id uuid,
  p_partner_brand_id uuid
)
returns boolean
language sql
stable
security definer
set search_path = pg_catalog, public, private
set row_security = off
as $$
  select exists (
    select 1
    from public.task_assignments a
    where a.user_id = p_user_id
      and a.node_id = p_node_id
      and a.partner_brand_id = p_partner_brand_id
      and a.status = 'active'
      and (a.visible_from is null or a.visible_from <= now())
      and (a.visible_until is null or a.visible_until >= now())
  );
$$;

revoke all on function private.putduk_has_active_assignment(uuid, uuid, uuid)
  from public, anon;
grant execute on function private.putduk_has_active_assignment(uuid, uuid, uuid)
  to authenticated, service_role;

comment on function private.putduk_has_active_assignment(uuid, uuid, uuid) is
  'RLS 재귀 없이 현재 회원의 유효한 업무 배정 존재 여부만 반환한다.';

drop policy if exists nodes_select_enabled on public.nodes;
create policy nodes_select_enabled
on public.nodes
for select
to authenticated
using (
  enabled = true
  and supply_source = 'operator'
  and catalog_status = 'published'
  and exists (
    select 1
    from public.partner_brands b
    where b.id = nodes.partner_brand_id
      and b.published = true
      and b.verification_status::text = 'approved'
      and b.logo_usage_status = 'approved'
  )
  and (
    coalesce(requires_assign, false) = false
    or private.putduk_has_active_assignment(
      (select auth.uid()),
      nodes.id,
      nodes.partner_brand_id
    )
  )
);

commit;
