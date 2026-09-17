-- 회원 등급(라인/크루/선임/전담)별 "하루 총 업무 시작 횟수" 한도.
--
-- 조사 결과(2026-09-18 야간 세션): private.prepare_putduk_task_run()에는 이미
-- (a) 회원 1인당 동시 진행 업무 1건 제한, (b) 업무 카드(node)별 하루 슬롯(daily_cap/
-- daily_capacity) 소진 두 가지 한도만 있었고, "회원 등급별 하루 총 횟수" 한도는
-- 어디에도 없었다(프런트 MEMBER_BANDS의 perks 텍스트에도 숫자 없음, admin.js에도
-- 등급별 하루 횟수 설정 UI 없음). 기존 로직을 대체하지 않고 그 위에 추가한다.
--
-- 등급 값 표기 불일치 주의: profiles.member_tier 컬럼에는 가입 시 기본값인
-- '일반 파트너'/'인증 파트너'/'우수 파트너'/'글로벌 디렉터'(구 표기)가 들어갈 수도,
-- 운영자가 admin.js "사원증 등급 변경" 폼으로 바꾼 '라인'/'크루'/'선임'/'전담'(배지
-- 라벨)이 그대로 들어갈 수도 있다(admin.js changeMemberTier는 변환 없이 그대로 저장).
-- 이 마이그레이션은 두 표기를 모두 배지 라벨 4단계로 정규화해서 조회한다.
--
-- 기본값(라인 3 / 크루 5 / 선임 10 / 전담 0=무제한)은 확정된 기획 수치가 아니라
-- 사다리(소액→중간→고액→초고액) 구조에서 등급이 오를수록 하루 가능 건수가 늘어나는
-- 것이 자연스럽다는 가정 아래 정한 임시 기본값이다. 운영자가 나중에 바꿀 수 있도록
-- 테이블 + 전용 RPC로 만들었고, 코드에 하드코딩하지 않았다.

begin;

-- ---------------------------------------------------------------------------
-- 1. 등급 표기 정규화
-- ---------------------------------------------------------------------------

create or replace function private.putduk_normalize_member_tier(p_tier text)
returns text
language sql
immutable
set search_path = pg_catalog
as $$
  select case trim(coalesce(p_tier, ''))
    when '일반 파트너' then '라인'
    when '인증 파트너' then '크루'
    when '우수 파트너' then '선임'
    when '글로벌 디렉터' then '전담'
    when '라인' then '라인'
    when '크루' then '크루'
    when '선임' then '선임'
    when '전담' then '전담'
    else '라인'
  end;
$$;

revoke all on function private.putduk_normalize_member_tier(text) from public, anon, authenticated;
grant execute on function private.putduk_normalize_member_tier(text) to service_role;

comment on function private.putduk_normalize_member_tier(text) is
  'profiles.member_tier의 구 표기("일반 파트너" 등)와 배지 라벨("라인" 등)을 배지 라벨 4단계로 정규화한다.';

-- ---------------------------------------------------------------------------
-- 2. 등급별 하루 한도 설정 테이블 (운영자 조정 가능, 임시 기본값)
-- ---------------------------------------------------------------------------

create table if not exists public.member_tier_daily_limits (
  tier text primary key check (tier in ('라인', '크루', '선임', '전담')),
  daily_limit integer not null default 0 check (daily_limit >= 0),
  updated_at timestamptz not null default now(),
  updated_by uuid references auth.users(id) on delete set null
);

comment on table public.member_tier_daily_limits is
  '등급별 회원 1인당 하루 업무 시작 한도. daily_limit=0은 무제한. 값은 2026-09-18 야간 세션이 정한 임시 기본값이며 운영자가 putduk_admin_set_tier_daily_limit로 바꿀 수 있다.';

alter table public.member_tier_daily_limits enable row level security;

drop policy if exists member_tier_daily_limits_select_authenticated on public.member_tier_daily_limits;
create policy member_tier_daily_limits_select_authenticated
  on public.member_tier_daily_limits for select
  to authenticated
  using (true);

drop policy if exists member_tier_daily_limits_service_role on public.member_tier_daily_limits;
create policy member_tier_daily_limits_service_role
  on public.member_tier_daily_limits for all
  to service_role
  using (true) with check (true);

revoke all on table public.member_tier_daily_limits from public, anon;
grant select on table public.member_tier_daily_limits to authenticated;
grant select, insert, update, delete on table public.member_tier_daily_limits to service_role;

insert into public.member_tier_daily_limits (tier, daily_limit) values
  ('라인', 3),
  ('크루', 5),
  ('선임', 10),
  ('전담', 0)
on conflict (tier) do nothing;

-- ---------------------------------------------------------------------------
-- 3. private.prepare_putduk_task_run() 위에 등급별 하루 총 횟수 검사 추가
--    (기존 동시 진행 1건 제한 · 노드별 daily_cap 로직은 그대로 두고 아래 한 단락만 추가)
-- ---------------------------------------------------------------------------

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
  v_member_daily_limit integer;
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

  -- 같은 회원의 중복 시작·하루 총 횟수 카운트를 이 락 하나로 함께 직렬화한다.
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

  select p.member_tier into v_tier from public.profiles p where p.id = v_user_id;
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

  v_cap := case when coalesce(v_node.daily_cap, 0) > 0 then v_node.daily_cap else v_node.daily_capacity end;
  if v_cap > 0 then
    select count(*)::integer into v_daily_count
    from public.task_runs r
    where r.node_id = v_node.id
      and r.created_at >= date_trunc('day', v_now)
      and r.created_at < date_trunc('day', v_now) + interval '1 day'
      and r.status <> 'cancelled';
    if v_daily_count >= v_cap then
      raise exception using errcode = 'P0001', message = '오늘 준비된 업무 수량이 모두 소진되었습니다.';
    end if;
  end if;

  -- 신규: 회원 등급별 하루 총 시작 횟수 한도(KST 자정 기준). daily_limit=0은 무제한.
  v_tier_label := private.putduk_normalize_member_tier(v_tier);
  select daily_limit
    into v_member_daily_limit
  from public.member_tier_daily_limits
  where tier = v_tier_label;
  v_member_daily_limit := coalesce(v_member_daily_limit, 0);

  if v_member_daily_limit > 0 then
    v_kst_day_start := date_trunc('day', v_now at time zone 'Asia/Seoul') at time zone 'Asia/Seoul';
    select count(*)::integer
      into v_member_daily_count
    from public.task_runs r
    where r.user_id = v_user_id
      and r.created_at >= v_kst_day_start
      and r.created_at < v_kst_day_start + interval '1 day'
      and r.status <> 'cancelled';
    if coalesce(v_member_daily_count, 0) >= v_member_daily_limit then
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

  insert into public.task_events (task_run_id, user_id, event_type, event_payload)
  values (
    new.id, new.user_id, 'started',
    jsonb_build_object(
      'node_id', v_node.id,
      'node_public_id', v_node.public_id,
      'motion_profile', v_node.motion_profile,
      'motion_version', v_node.motion_version,
      'expected_seconds', v_seconds,
      'assignment_id', v_assignment.id,
      'locked_stake_krw', new.locked_stake_krw,
      'stipend_krw', new.stipend_krw,
      'is_trial', new.is_trial
    )
  );

  return new;
end;
$$;

revoke all on function private.prepare_putduk_task_run() from public, anon, authenticated;
grant execute on function private.prepare_putduk_task_run() to service_role;

comment on function private.prepare_putduk_task_run() is
  '회원 업무 시작 시 공개 카드/배정·등급 접근·동시진행 1건·노드별 하루 한도·회원 등급별 하루 총 횟수·보상·잠금을 서버가 확정한다.';

-- ---------------------------------------------------------------------------
-- 4. 회원용 조회 RPC: 오늘 몇 번 썼는지 / 몇 번 남았는지
-- ---------------------------------------------------------------------------

create or replace function public.putduk_member_daily_task_quota(p_user_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = pg_catalog, public, private, extensions
as $$
declare
  v_tier text;
  v_tier_label text;
  v_limit integer;
  v_used integer;
  v_kst_day_start timestamptz := date_trunc('day', now() at time zone 'Asia/Seoul') at time zone 'Asia/Seoul';
begin
  if p_user_id is null then
    raise exception using errcode = '22023', message = '회원 정보가 필요합니다.';
  end if;

  select member_tier into v_tier from public.profiles where id = p_user_id;
  v_tier_label := private.putduk_normalize_member_tier(v_tier);

  select daily_limit into v_limit from public.member_tier_daily_limits where tier = v_tier_label;
  v_limit := coalesce(v_limit, 0);

  select count(*)::integer
    into v_used
  from public.task_runs r
  where r.user_id = p_user_id
    and r.created_at >= v_kst_day_start
    and r.created_at < v_kst_day_start + interval '1 day'
    and r.status <> 'cancelled';
  v_used := coalesce(v_used, 0);

  return jsonb_build_object(
    'tier', v_tier_label,
    'daily_limit', v_limit,
    'used_today', v_used,
    'remaining_today', case when v_limit > 0 then greatest(v_limit - v_used, 0) else null end,
    'unlimited', v_limit <= 0,
    'resets_at', v_kst_day_start + interval '1 day'
  );
end;
$$;

revoke all on function public.putduk_member_daily_task_quota(uuid) from public, anon, authenticated;
grant execute on function public.putduk_member_daily_task_quota(uuid) to service_role;

comment on function public.putduk_member_daily_task_quota(uuid) is
  '회원 등급의 하루 업무 시작 한도·오늘 사용·남은 횟수(KST 자정 기준). daily_limit=0은 무제한.';

-- ---------------------------------------------------------------------------
-- 5. 운영자용 설정 RPC: 등급별 하루 한도를 나중에 바꿀 수 있게
-- ---------------------------------------------------------------------------

create or replace function public.putduk_admin_set_tier_daily_limit(
  p_admin_id uuid,
  p_tier text,
  p_daily_limit integer
)
returns public.member_tier_daily_limits
language plpgsql
security definer
set search_path = pg_catalog, public, private, extensions
as $$
declare
  v_tier text := private.putduk_normalize_member_tier(p_tier);
  v_row public.member_tier_daily_limits%rowtype;
begin
  perform private.putduk_assert_admin(p_admin_id, array['super_admin', 'content']);

  if p_daily_limit is null or p_daily_limit < 0 then
    raise exception using errcode = '22023', message = '하루 한도는 0 이상 숫자여야 해요. 0은 무제한이에요.';
  end if;

  insert into public.member_tier_daily_limits (tier, daily_limit, updated_at, updated_by)
  values (v_tier, p_daily_limit, now(), p_admin_id)
  on conflict (tier) do update
    set daily_limit = excluded.daily_limit,
        updated_at = now(),
        updated_by = p_admin_id
  returning * into v_row;

  return v_row;
end;
$$;

revoke all on function public.putduk_admin_set_tier_daily_limit(uuid, text, integer) from public, anon, authenticated;
grant execute on function public.putduk_admin_set_tier_daily_limit(uuid, text, integer) to service_role;

comment on function public.putduk_admin_set_tier_daily_limit(uuid, text, integer) is
  '운영자가 등급별 하루 업무 시작 한도를 바꾼다. 0은 무제한. super_admin/content 권한 필요.';

create or replace function public.putduk_admin_list_tier_daily_limits(p_admin_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = pg_catalog, public, private, extensions
as $$
begin
  perform private.putduk_assert_admin(p_admin_id, array['super_admin', 'content', 'finance', 'member_support']);
  return coalesce(
    (
      select jsonb_agg(row_to_json(x)::jsonb order by x.tier)
      from (
        select tier, daily_limit, updated_at, updated_by
        from public.member_tier_daily_limits
      ) x
    ),
    '[]'::jsonb
  );
end;
$$;

revoke all on function public.putduk_admin_list_tier_daily_limits(uuid) from public, anon, authenticated;
grant execute on function public.putduk_admin_list_tier_daily_limits(uuid) to service_role;

commit;
