-- 특정회원 배정은 현재도 공개 가능한 operator 카탈로그일 때만 노출·시작할 수 있다.

create or replace function private.guard_putduk_task_assignment_catalog()
returns trigger
language plpgsql
security definer
set search_path to 'pg_catalog', 'public', 'private'
as $function$
declare
  v_partner_brand_id uuid;
begin
  if new.status is distinct from 'active' then
    return new;
  end if;

  select n.partner_brand_id
    into v_partner_brand_id
  from public.nodes n
  where n.id = new.node_id
    and n.supply_source = 'operator'
    and n.catalog_status = 'published'
    and coalesce(n.enabled, false) is true
  for share;

  if not found then
    raise exception using
      errcode = '22023',
      message = '운영자 등록 후 공개된 사용 가능 업무만 배정할 수 있습니다.';
  end if;

  if new.partner_brand_id is distinct from v_partner_brand_id then
    raise exception using
      errcode = '22023',
      message = '업무 카드와 협력사 정보가 일치하지 않습니다.';
  end if;

  perform 1
  from public.partner_brands b
  where b.id = v_partner_brand_id
    and coalesce(b.published, false) is true
    and b.verification_status::text = 'approved'
    and coalesce(b.logo_usage_status, '') = 'approved'
  for share;

  if not found then
    raise exception using
      errcode = '22023',
      message = '승인되어 공개된 협력사 업무만 배정할 수 있습니다.';
  end if;

  return new;
end;
$function$;

drop trigger if exists guard_putduk_task_assignment_catalog on public.task_assignments;
create trigger guard_putduk_task_assignment_catalog
before insert or update on public.task_assignments
for each row execute function private.guard_putduk_task_assignment_catalog();

create or replace function private.guard_putduk_task_run_catalog()
returns trigger
language plpgsql
security definer
set search_path to 'pg_catalog', 'public', 'private'
as $function$
declare
  v_user_id uuid := coalesce(auth.uid(), new.user_id);
  v_requires_assign boolean;
  v_has_assignment boolean := false;
begin
  if new.node_id is null then
    raise exception using errcode = '22023', message = '시작할 업무 노드가 없습니다.';
  end if;

  if v_user_id is null then
    raise exception using errcode = '42501', message = '업무를 시작할 회원을 확인할 수 없습니다.';
  end if;

  select coalesce(n.requires_assign, false)
    into v_requires_assign
  from public.nodes n
  where n.id = new.node_id
    and n.supply_source = 'operator'
    and n.catalog_status = 'published'
    and coalesce(n.enabled, false) is true
    and exists (
      select 1
      from public.partner_brands b
      where b.id = n.partner_brand_id
        and coalesce(b.published, false) is true
        and b.verification_status::text = 'approved'
        and coalesce(b.logo_usage_status, '') = 'approved'
    )
  for share;

  if not found then
    raise exception using
      errcode = 'P0001',
      message = '현재 공개 중인 운영자 등록 업무가 아닙니다.';
  end if;

  select exists (
    select 1
    from public.task_assignments a
    where a.user_id = v_user_id
      and a.node_id = new.node_id
      and a.status = 'active'
      and (a.visible_from is null or a.visible_from <= now())
      and (a.visible_until is null or a.visible_until >= now())
  ) into v_has_assignment;

  if v_requires_assign and not v_has_assignment then
    raise exception using
      errcode = '42501',
      message = '이 업무는 운영자 배정 후 시작할 수 있습니다.';
  end if;

  return new;
end;
$function$;

drop trigger if exists guard_putduk_task_run_catalog on public.task_runs;
create trigger guard_putduk_task_run_catalog
before insert on public.task_runs
for each row execute function private.guard_putduk_task_run_catalog();

drop policy if exists nodes_select_assigned on public.nodes;
create policy nodes_select_assigned
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
  and exists (
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
  published = true
  and verification_status::text = 'approved'
  and logo_usage_status = 'approved'
  and exists (
    select 1
    from public.task_assignments a
    join public.nodes n on n.id = a.node_id
    where a.partner_brand_id = partner_brands.id
      and n.partner_brand_id = partner_brands.id
      and n.supply_source = 'operator'
      and n.catalog_status = 'published'
      and n.enabled = true
      and a.user_id = (select auth.uid())
      and a.status = 'active'
      and (a.visible_from is null or a.visible_from <= now())
      and (a.visible_until is null or a.visible_until >= now())
  )
);

drop policy if exists assignments_select_own on public.task_assignments;
create policy assignments_select_own
on public.task_assignments
for select
to authenticated
using (
  (select auth.uid()) = user_id
  and status = 'active'
  and (visible_from is null or visible_from <= now())
  and (visible_until is null or visible_until >= now())
  and exists (
    select 1
    from public.nodes n
    join public.partner_brands b on b.id = n.partner_brand_id
    where n.id = task_assignments.node_id
      and n.partner_brand_id = task_assignments.partner_brand_id
      and n.supply_source = 'operator'
      and n.catalog_status = 'published'
      and n.enabled = true
      and b.published = true
      and b.verification_status::text = 'approved'
      and b.logo_usage_status = 'approved'
  )
);
