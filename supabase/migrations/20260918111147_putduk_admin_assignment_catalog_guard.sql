-- 운영자 수동 업무 배정은 운영자 등록·공개·사용 가능 업무와 승인된 협력사만 허용한다.
create or replace function public.putduk_admin_assign_task(
  p_admin_id uuid,
  p_user_id uuid,
  p_node_id uuid,
  p_reward_amount numeric default null::numeric,
  p_estimated_seconds integer default null::integer,
  p_reason text default null::text,
  p_visible_from timestamptz default null::timestamptz,
  p_visible_until timestamptz default null::timestamptz,
  p_notify boolean default true
)
returns public.task_assignments
language plpgsql
security definer
set search_path to 'pg_catalog', 'public', 'private'
as $function$
declare
  v_node public.nodes%rowtype;
  v_row public.task_assignments%rowtype;
  v_reason text := nullif(left(trim(coalesce(p_reason, '')), 500), '');
  v_title text;
begin
  perform private.putduk_assert_admin(p_admin_id, array['super_admin', 'member_support', 'content']);

  if p_user_id is null or p_node_id is null then
    raise exception using errcode = '22023', message = '회원과 업무 카드를 선택해 주세요.';
  end if;

  if not exists (
    select 1
    from public.profiles
    where id = p_user_id
      and status in ('active', 'pending')
  ) then
    raise exception using errcode = 'P0002', message = '배정할 회원을 찾을 수 없습니다.';
  end if;

  select *
  into v_node
  from public.nodes
  where id = p_node_id;

  if not found then
    raise exception using errcode = 'P0002', message = '배정할 업무 카드를 찾을 수 없습니다.';
  end if;

  if v_node.supply_source is distinct from 'operator'
     or v_node.catalog_status is distinct from 'published'
     or coalesce(v_node.enabled, false) is not true then
    raise exception using
      errcode = '22023',
      message = '운영자 등록 후 공개된 사용 가능 업무만 배정할 수 있습니다.';
  end if;

  if v_node.partner_brand_id is null
     or not exists (
       select 1
       from public.partner_brands b
       where b.id = v_node.partner_brand_id
         and coalesce(b.published, false) is true
         and b.verification_status::text = 'approved'
         and coalesce(b.logo_usage_status, '') = 'approved'
     ) then
    raise exception using
      errcode = '22023',
      message = '승인되어 공개된 협력사 업무만 배정할 수 있습니다.';
  end if;

  insert into public.task_assignments (
    user_id,
    node_id,
    partner_brand_id,
    reward_amount,
    estimated_seconds,
    reason,
    visible_from,
    visible_until,
    notify_member,
    created_by
  )
  values (
    p_user_id,
    p_node_id,
    v_node.partner_brand_id,
    p_reward_amount,
    p_estimated_seconds,
    v_reason,
    p_visible_from,
    p_visible_until,
    coalesce(p_notify, true),
    p_admin_id
  )
  returning * into v_row;

  if coalesce(p_notify, true) then
    select title_ko into v_title from public.nodes where id = p_node_id;
    insert into public.notifications (user_id, title, body, notification_type)
    values (
      p_user_id,
      '회원님에게 새로운 우선 업무가 배정됐어요.',
      coalesce(v_title, '전용 업무') || ' 업무가 작업실에 도착했어요.'
        || case when v_reason is null then '' else ' 배정 사유: ' || v_reason end,
      'work'
    );
  end if;

  return v_row;
end;
$function$;
