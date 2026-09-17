-- 운영자 등록 카탈로그 게이트
-- 사용자에게 노출되는 노드는 운영자가 등록하고 공개한 항목으로만 제한한다.

begin;

alter table public.nodes
  add column if not exists supply_source text not null default 'operator',
  add column if not exists catalog_status text not null default 'draft',
  add column if not exists published_at timestamptz,
  add column if not exists published_by uuid references auth.users(id) on delete set null;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conrelid = 'public.nodes'::regclass
      and conname = 'nodes_supply_source_check'
  ) then
    alter table public.nodes
      add constraint nodes_supply_source_check
      check (supply_source = 'operator');
  end if;

  if not exists (
    select 1
    from pg_constraint
    where conrelid = 'public.nodes'::regclass
      and conname = 'nodes_catalog_status_check'
  ) then
    alter table public.nodes
      add constraint nodes_catalog_status_check
      check (catalog_status in ('draft', 'published', 'paused', 'archived'));
  end if;

  if not exists (
    select 1
    from pg_constraint
    where conrelid = 'public.nodes'::regclass
      and conname = 'nodes_reward_range_check'
  ) then
    alter table public.nodes
      add constraint nodes_reward_range_check
      check (reward_max >= reward_min);
  end if;
end
$$;

create index if not exists nodes_operator_catalog_idx
  on public.nodes (catalog_status, enabled, partner_brand_id);

create or replace function private.sync_node_catalog_metadata()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, public, private
as $$
begin
  if new.catalog_status = 'published' then
    new.published_at := coalesce(new.published_at, now());
    new.published_by := coalesce(new.published_by, auth.uid());
  else
    new.published_at := null;
    new.published_by := null;
  end if;

  new.updated_at := now();
  return new;
end;
$$;

revoke all on function private.sync_node_catalog_metadata() from public, anon, authenticated;
grant execute on function private.sync_node_catalog_metadata() to service_role;

drop trigger if exists sync_node_catalog_metadata on public.nodes;
create trigger sync_node_catalog_metadata
before insert or update of catalog_status, published_at, published_by, enabled, reward_min, reward_max,
  estimated_seconds, daily_capacity, title_ko, description_ko, motion_profile, motion_version
on public.nodes
for each row
execute function private.sync_node_catalog_metadata();

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
      and b.verification_status = 'approved'
      and b.logo_usage_status = 'approved'
  )
);

comment on table public.nodes is
  '운영자 등록형 업무 카탈로그. published 상태이고 검증된 협력사에 연결된 항목만 사용자에게 노출한다.';
comment on column public.nodes.supply_source is
  '데이터 공급 경로. 현재 운영자 등록(operator)만 허용한다.';
comment on column public.nodes.catalog_status is
  '운영자 공개 상태: draft, published, paused, archived.';
comment on column public.nodes.published_by is
  '공개 승인한 운영자 계정 ID.';

commit;
