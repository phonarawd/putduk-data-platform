-- Phase 1: 업무별 일일 공급량과 회원별 횟수를 모두 KST 자정으로 통일한다.
-- 기존 함수의 잠금, 권한, 잔액, AFTER INSERT 이벤트 구조는 유지한다.

begin;

create or replace function private.prepare_putduk_task_run()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, public, private, extensions
as $$
declare
  v_user_id uuid;
  v_node public.nodes%rowtype;
  v_assignment public.task_assignments%rowtype;
  v_now timestamptz := now();
  v_daily_count integer;
  v_variant_index integer;
  v_stipend numeric(12,2);
  v_seconds integer;
  v_tier text;
  v_cap integer;
  v_lock jsonb;
  v_jwt_role text := coalesce(auth.role(), current_setting('request.jwt.claim.role', true), '');
  v_tier_label text;
  v_tier_limit integer;
  v_override integer;
  v_extra integer;
  v_member_daily_limit integer;
  v_member_cap integer;
  v_member_daily_count integer;
  v_kst_day_start timestamptz;
begin
  if v_jwt_role = 'service_role' then
    if new.public_id is null or new.public_id = '' then
      new.public_id := 'PDK-RUN-' || to_char(v_now, 'YYMMDD') || '-' || upper(substr(replace(gen_random_uuid()::text, '-', ''), 1, 8));
    end if;
    if new.motion_seed is null or new.motion_seed = '' then
      new.motion_seed := encode(gen_random_bytes(24), 'hex');
    end if;
    new.locked_stake_krw := coalesce(new.locked_stake_krw, 0);
    new.stipend_krw := coalesce(new.stipend_krw, new.reward_amount, 0);
    new.is_trial := coalesce(new.is_trial, false);
    new.stake_released := coalesce(new.stake_released, false);
    new.updated_at := v_now;
    return new;
  end if;

  v_user_id := auth.uid();
  if v_user_id is null then
    raise exception using errcode = '42501', message = '로그인 후 업무를 시작할 수 있습니다.';
  end if;

  if not exists (
    select 1 from public.profiles p
    where p.id = v_user_id and p.status = 'active'
  ) then
    raise exception using errcode = '42501', message = '활성화된 회원 계정만 업무를 시작할 수 있습니다.';
  end if;

  if new.node_id is null then
    raise exception using errcode = '22023', message = '시작할 업무 노드가 없습니다.';
  end if;

  perform pg_advisory_xact_lock(hashtextextended('putduk-user:' || v_user_id::text, 0));
  perform pg_advisory_xact_lock(
    hashtextextended('putduk-node:' || new.node_id::text || ':' || to_char(v_now, 'YYYY-MM-DD'), 0)
  );

  select a.*
    into v_assignment
  from public.task_assignments a
  where a.user_id = v_user_id
    and a.node_id = new.node_id
    and a.status = 'active'
    and (a.visible_from is null or a.visible_from <= v_now)
    and (a.visible_until is null or a.visible_until >= v_now)
  order by a.created_at desc
  limit 1
  for update;

  select n.*
    into v_node
  from public.nodes n
  join public.partner_brands b on b.id = n.partner_brand_id
  where n.id = new.node_id
    and n.supply_source = 'operator'
    and (
      v_assignment.id is not null
      or (
        n.enabled = true
        and n.catalog_status = 'published'
        and b.published = true
        and b.verification_status = 'approved'
        and b.logo_usage_status = 'approved'
      )
    )
  for share;

  if not found then
    raise exception using errcode = 'P0001', message = '현재 공개 중이거나 배정된 업무가 아닙니다.';
  end if;

  if coalesce(v_node.requires_assign, false) and v_assignment.id is null then
    raise exception using errcode = '42501', message = '이 금액 구간은 운영자 확인 후 열립니다.';
  end if;

  select p.member_tier, p.daily_task_limit_override, p.extra_task_starts
    into v_tier, v_override, v_extra
  from public.profiles p
  where p.id = v_user_id;
  if coalesce(cardinality(v_node.allowed_tiers), 0) > 0
     and not (v_tier = any (v_node.allowed_tiers)) then
    raise exception using errcode = '42501', message = '현재 등급에서는 이 업무를 시작할 수 없습니다.';
  end if;

  if exists (
    select 1 from public.task_runs r
    where r.user_id = v_user_id
      and r.status in ('reserved', 'in_progress', 'checkpointed', 'submitted', 'review_pending')
  ) then
    raise exception using errcode = '23514', message = '진행 중인 업무를 먼저 마무리해 주세요.';
  end if;

  -- 노드 공급량과 회원 횟수 모두 같은 KST 날짜 경계를 사용한다.
  v_kst_day_start := date_trunc('day', v_now at time zone 'Asia/Seoul') at time zone 'Asia/Seoul';

  v_cap := case when coalesce(v_node.daily_cap, 0) > 0 then v_node.daily_cap else v_node.daily_capacity end;
  if v_cap > 0 then
    select count(*)::integer into v_daily_count
    from public.task_runs r
    where r.node_id = v_node.id
      and r.created_at >= v_kst_day_start
      and r.created_at < v_kst_day_start + interval '1 day'
      and r.status <> 'cancelled';
    if v_daily_count >= v_cap then
      raise exception using errcode = 'P0001', message = '오늘 준비된 업무 수량이 모두 소진되었습니다.';
    end if;
  end if;

  v_tier_label := private.putduk_normalize_member_tier(v_tier);
  select daily_limit
    into v_tier_limit
  from public.member_tier_daily_limits
  where tier = v_tier_label;
  v_tier_limit := coalesce(v_tier_limit, 0);
  v_extra := greatest(coalesce(v_extra, 0), 0);
  v_member_daily_limit := coalesce(v_override, v_tier_limit);

  if v_member_daily_limit > 0 then
    v_member_cap := v_member_daily_limit + v_extra;
    v_kst_day_start := date_trunc('day', v_now at time zone 'Asia/Seoul') at time zone 'Asia/Seoul';
    select count(*)::integer
      into v_member_daily_count
    from public.task_runs r
    where r.user_id = v_user_id
      and r.created_at >= v_kst_day_start
      and r.created_at < v_kst_day_start + interval '1 day'
      and r.status <> 'cancelled';
    if coalesce(v_member_daily_count, 0) >= v_member_cap then
      raise exception using
        errcode = 'P0001',
        message = '오늘 이용 가능한 업무 횟수를 모두 사용했어요. 자정에 다시 채워져요.';
    end if;
  end if;

  v_seconds := coalesce(v_assignment.estimated_seconds, v_node.estimated_seconds);
  if v_assignment.reward_amount is not null then
    v_stipend := round(v_assignment.reward_amount, 2);
  else
    v_stipend := round(coalesce(nullif(v_node.stipend_krw, 0), v_node.reward_min, 0), 2);
  end if;

  new.id := gen_random_uuid();
  new.public_id := 'PDK-RUN-' || to_char(v_now, 'YYMMDD') || '-' || upper(substr(replace(new.id::text, '-', ''), 1, 8));
  new.user_id := v_user_id;
  new.status := 'in_progress';
  new.started_at := v_now;
  new.expected_completed_at := v_now + make_interval(secs => v_seconds);
  new.completed_at := null;
  new.progress := 0;
  v_variant_index := ((hashtextextended(new.id::text, 0) % 4 + 4) % 4)::integer;
  new.motion_variant := (array['a', 'b', 'c', 'd'])[v_variant_index + 1];
  new.motion_seed := encode(gen_random_bytes(24), 'hex');
  new.reward_policy_version := 'operator-catalog-1.0.0';
  new.reward_amount := v_stipend;
  new.stipend_krw := v_stipend;
  new.reward_status := 'held';
  new.stake_released := false;
  new.created_at := v_now;
  new.updated_at := v_now;

  v_lock := private.putduk_lock_stake(v_user_id, new.id, v_node.id, v_user_id);
  new.locked_stake_krw := coalesce((v_lock ->> 'locked_stake_krw')::numeric, 0);
  new.stipend_krw := coalesce((v_lock ->> 'stipend_krw')::numeric, v_stipend);
  new.reward_amount := new.stipend_krw;
  new.stake_bucket := v_lock ->> 'stake_bucket';
  new.is_trial := coalesce((v_lock ->> 'is_trial')::boolean, false);

  if v_assignment.id is not null then
    update public.task_assignments
    set status = 'started', started_at = v_now, updated_at = v_now
    where id = v_assignment.id;
  end if;

  return new;
end;
$$;

comment on function private.prepare_putduk_task_run() is
  '업무 시작 검증. 노드 공급량과 회원 횟수를 모두 Asia/Seoul 자정 경계로 집계한다.';

commit;
