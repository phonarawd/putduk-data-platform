-- 배정 전용 업무 노출 RLS 정합화
-- permissive SELECT policy가 OR로 결합되면서 requires_assign 업무가 일반 공개 policy를 통해
-- 모든 authenticated 회원에게 노출될 수 있는 문제를 막는다.
-- 일반 공개 업무는 그대로 보이고, requires_assign 업무만 현재 유효한 본인 배정이 있어야 보인다.

begin;

drop policy if exists nodes_select_assigned on public.nodes;
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
    or exists (
      select 1
      from public.task_assignments a
      where a.node_id = nodes.id
        and a.partner_brand_id = nodes.partner_brand_id
        and a.user_id = (select auth.uid())
        and a.status = 'active'
        and (a.visible_from is null or a.visible_from <= now())
        and (a.visible_until is null or a.visible_until >= now())
    )
  )
);

-- 브랜드 자체는 기존과 동일하게 승인·공개 상태면 조회 가능하다.
-- brands_select_assigned는 brands_select_published의 부분집합이라 permissive OR에서 의미가 없고
-- 매 요청마다 추가 평가만 발생하므로 제거한다.
drop policy if exists brands_select_assigned on public.partner_brands;

commit;
