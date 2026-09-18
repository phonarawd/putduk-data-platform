-- 배정된 업무 카드를 회원이 라인 찾기에서 읽고, 종 알림은 실시간으로 받는다.

begin;

grant select on public.task_assignments to authenticated;
grant select, update on public.notifications to authenticated;

drop policy if exists nodes_select_assigned on public.nodes;
create policy nodes_select_assigned
on public.nodes
for select
to authenticated
using (
  exists (
    select 1
    from public.task_assignments a
    where a.node_id = nodes.id
      and a.user_id = (select auth.uid())
      and a.status = 'active'
      and (a.visible_from is null or a.visible_from <= now())
      and (a.visible_until is null or a.visible_until >= now())
  )
);

drop policy if exists brands_select_assigned on public.partner_brands;
create policy brands_select_assigned
on public.partner_brands
for select
to authenticated
using (
  exists (
    select 1
    from public.task_assignments a
    where a.partner_brand_id = partner_brands.id
      and a.user_id = (select auth.uid())
      and a.status = 'active'
      and (a.visible_from is null or a.visible_from <= now())
      and (a.visible_until is null or a.visible_until >= now())
  )
);

create index if not exists notifications_user_unread_idx
  on public.notifications (user_id, created_at desc)
  where read_at is null;

alter table public.notifications replica identity full;
alter table public.task_assignments replica identity full;

do $$
begin
  if not exists (
    select 1
    from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename = 'notifications'
  ) then
    execute 'alter publication supabase_realtime add table public.notifications';
  end if;
  if not exists (
    select 1
    from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename = 'task_assignments'
  ) then
    execute 'alter publication supabase_realtime add table public.task_assignments';
  end if;
end $$;

comment on policy nodes_select_assigned on public.nodes is
  '운영자가 배정한 카드는 공개 상태가 아니어도 해당 회원이 읽을 수 있다.';
comment on policy brands_select_assigned on public.partner_brands is
  '배정된 카드의 협력사는 해당 회원이 읽을 수 있다.';

commit;
