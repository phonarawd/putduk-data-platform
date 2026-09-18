-- 관리자 등급 한도 화면·회원별 예외/추가 횟수.
--
-- 기존 18110000 테이블·RPC를 대체하지 않고 그 위에 얹는다.
-- 18120000 체험 출금 함수 본문은 건드리지 않는다. 아래는 주석만 정책에 맞게 정리한다.
--   - 지원금 1만 원은 support_grant 칸이라 출금 대상이 아님
--   - 체험 근무로 확정된 수당(최대 3,000원)만 출금가능 칸에서 1회 신청
--   - 원장 통화는 KRW. 실제 송금은 운영자가 기존 출금 대기열에서 수동 처리(USDT 포함)

begin;

comment on column public.profiles.trial_withdraw_used_at is
  '체험 근무로 확정된 수당(최대 3,000원)을 KYC 전에 1회 출금 신청했는지. 지원금 1만 원 자체는 출금 대상이 아니다. 실제 송금은 운영자가 대기열에서 수동 처리한다.';

comment on function public.putduk_member_withdraw_request(uuid, text, numeric, text, text, boolean, text, text, text, text, text) is
  '출금 신청. 수당만 또는 원금포함. KYC 미승인이어도 체험 근무 확정 수당 3,000원 이하는 평생 1회 예외(trial_withdraw_used_at). 지원금 칸은 출금하지 않음. 잠긴 원금은 출금 불가. 실제 송금은 운영자 수동 처리.';

-- ---------------------------------------------------------------------------
-- 1. 회원별 한도 예외·추가 횟수
-- ---------------------------------------------------------------------------

alter table public.profiles
  add column if not exists daily_task_limit_override integer,
  add column if not exists extra_task_starts integer not null default 0;

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'profiles_daily_task_limit_override_check'
  ) then
    alter table public.profiles
      add constraint profiles_daily_task_limit_override_check
      check (daily_task_limit_override is null or daily_task_limit_override >= 0);
  end if;
  if not exists (
    select 1 from pg_constraint
    where conname = 'profiles_extra_task_starts_check'
  ) then
    alter table public.profiles
      add constraint profiles_extra_task_starts_check
      check (extra_task_starts >= 0);
  end if;
end
$$;

comment on column public.profiles.daily_task_limit_override is
  '이 회원만 쓰는 하루 업무 한도. null이면 등급 기본값. 0은 무제한.';
comment on column public.profiles.extra_task_starts is
  '등급(또는 예외) 한도에 더하는 추가 횟수. 무제한 회원에는 적용하지 않는다.';

-- ---------------------------------------------------------------------------
-- 2. 등급 한도 목록은 라인→크루→선임→전담 순
-- ---------------------------------------------------------------------------

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
      select jsonb_agg(row_to_json(x)::jsonb order by x.rank)
      from (
        select
          tier,
          daily_limit,
          updated_at,
          updated_by,
          case tier
            when '라인' then 1
            when '크루' then 2
            when '선임' then 3
            when '전담' then 4
            else 9
          end as rank
        from public.member_tier_daily_limits
      ) x
    ),
    '[]'::jsonb
  );
end;
$$;

revoke all on function public.putduk_admin_list_tier_daily_limits(uuid) from public, anon, authenticated;
grant execute on function public.putduk_admin_list_tier_daily_limits(uuid) to service_role;

-- ---------------------------------------------------------------------------
-- 3. 회원 quota: 등급 한도 → 회원 예외 → 추가 횟수
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
  v_tier_limit integer;
  v_override integer;
  v_extra integer;
  v_base integer;
  v_limit integer;
  v_used integer;
  v_unlimited boolean;
  v_kst_day_start timestamptz := date_trunc('day', now() at time zone 'Asia/Seoul') at time zone 'Asia/Seoul';
begin
  if p_user_id is null then
    raise exception using errcode = '22023', message = '회원 정보가 필요합니다.';
  end if;

  select member_tier, daily_task_limit_override, extra_task_starts
    into v_tier, v_override, v_extra
  from public.profiles
  where id = p_user_id;

  v_tier_label := private.putduk_normalize_member_tier(v_tier);
  select daily_limit into v_tier_limit from public.member_tier_daily_limits where tier = v_tier_label;
  v_tier_limit := coalesce(v_tier_limit, 0);
  v_extra := greatest(coalesce(v_extra, 0), 0);
  v_base := coalesce(v_override, v_tier_limit);
  v_unlimited := coalesce(v_base, 0) <= 0;
  v_limit := case when v_unlimited then 0 else v_base + v_extra end;

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
    'tier_limit', v_tier_limit,
    'member_override', v_override,
    'extra_starts', v_extra,
    'used_today', v_used,
    'remaining_today', case when v_unlimited then null else greatest(v_limit - v_used, 0) end,
    'unlimited', v_unlimited,
    'resets_at', v_kst_day_start + interval '1 day'
  );
end;
$$;

revoke all on function public.putduk_member_daily_task_quota(uuid) from public, anon, authenticated;
grant execute on function public.putduk_member_daily_task_quota(uuid) to service_role;

comment on function public.putduk_member_daily_task_quota(uuid) is
  '회원 하루 업무 시작 한도(KST 자정). 등급 한도 → 회원 예외 → 추가 횟수. daily_limit=0은 무제한.';

-- ---------------------------------------------------------------------------
-- 4. 업무 시작 트리거: 같은 유효 한도를 강제
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
  '회원 업무 시작 시 공개 카드/배정·등급 접근·동시진행 1건·노드별 하루 한도·회원 하루 총 횟수(등급→예외→추가)·보상·잠금을 서버가 확정한다.';

-- ---------------------------------------------------------------------------
-- 5. 운영자: 회원별 예외·추가 횟수
-- ---------------------------------------------------------------------------

create or replace function public.putduk_admin_set_member_task_quota(
  p_admin_id uuid,
  p_user_id uuid,
  p_daily_limit_override integer,
  p_extra_task_starts integer
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public, private, extensions
as $$
begin
  perform private.putduk_assert_admin(p_admin_id, array['super_admin', 'member_support', 'content']);

  if p_user_id is null then
    raise exception using errcode = '22023', message = '회원 정보가 필요합니다.';
  end if;

  if p_daily_limit_override is not null and p_daily_limit_override < 0 then
    raise exception using errcode = '22023', message = '회원 한도는 0 이상 숫자여야 해요. 0은 무제한이에요.';
  end if;

  if p_extra_task_starts is null or p_extra_task_starts < 0 then
    raise exception using errcode = '22023', message = '추가 횟수는 0 이상 숫자여야 해요.';
  end if;

  update public.profiles
  set daily_task_limit_override = p_daily_limit_override,
      extra_task_starts = p_extra_task_starts,
      updated_at = now()
  where id = p_user_id;
  if not found then
    raise exception using errcode = 'P0002', message = '회원 정보를 찾을 수 없습니다.';
  end if;

  return jsonb_build_object(
    'user_id', p_user_id,
    'daily_task_limit_override', p_daily_limit_override,
    'extra_task_starts', p_extra_task_starts,
    'quota', public.putduk_member_daily_task_quota(p_user_id)
  );
end;
$$;

revoke all on function public.putduk_admin_set_member_task_quota(uuid, uuid, integer, integer) from public, anon, authenticated;
grant execute on function public.putduk_admin_set_member_task_quota(uuid, uuid, integer, integer) to service_role;

comment on function public.putduk_admin_set_member_task_quota(uuid, uuid, integer, integer) is
  '운영자가 회원별 하루 한도 예외와 추가 횟수를 저장한다. override null은 등급 기본값, 0은 무제한.';

commit;
