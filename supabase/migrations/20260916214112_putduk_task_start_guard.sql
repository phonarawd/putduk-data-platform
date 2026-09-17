-- 서버 기준 업무 시작 경계
-- 회원 브라우저는 node_id만 제출하고, 나머지 실행 정보는 DB가 결정한다.

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
  v_now timestamptz := now();
  v_daily_count integer;
  v_variant_index integer;
  v_reward numeric(12,2);
begin
  -- 운영자/서버 계정의 별도 처리 경로는 그대로 허용한다.
  -- 브라우저의 authenticated 요청은 아래 검증을 반드시 통과해야 한다.
  if current_setting('request.jwt.claim.role', true) = 'service_role'
     and auth.uid() is null then
    return new;
  end if;

  v_user_id := auth.uid();
  if v_user_id is null then
    raise exception using
      errcode = '42501',
      message = '로그인 후 업무를 시작할 수 있습니다.';
  end if;

  if not exists (
    select 1
    from public.profiles p
    where p.id = v_user_id
      and p.status = 'active'
  ) then
    raise exception using
      errcode = '42501',
      message = '활성화된 회원 계정만 업무를 시작할 수 있습니다.';
  end if;

  if new.node_id is null then
    raise exception using
      errcode = '22023',
      message = '시작할 업무 노드가 없습니다.';
  end if;

  -- 같은 회원의 중복 시작과 같은 노드의 일일 한도 경쟁을 직렬화한다.
  perform pg_advisory_xact_lock(
    hashtextextended('putduk-user:' || v_user_id::text, 0)
  );
  perform pg_advisory_xact_lock(
    hashtextextended(
      'putduk-node:' || new.node_id::text || ':' || to_char(v_now, 'YYYY-MM-DD'),
      0
    )
  );

  select n.*
    into v_node
  from public.nodes n
  join public.partner_brands b on b.id = n.partner_brand_id
  where n.id = new.node_id
    and n.enabled = true
    and n.supply_source = 'operator'
    and n.catalog_status = 'published'
    and b.published = true
    and b.verification_status = 'approved'
    and b.logo_usage_status = 'approved'
  for share;

  if not found then
    raise exception using
      errcode = 'P0001',
      message = '현재 공개 중인 업무 노드가 아닙니다.';
  end if;

  if exists (
    select 1
    from public.task_runs r
    where r.user_id = v_user_id
      and r.status in ('reserved', 'in_progress', 'checkpointed', 'submitted', 'review_pending')
  ) then
    raise exception using
      errcode = '23514',
      message = '진행 중인 업무를 먼저 마무리해 주세요.';
  end if;

  if v_node.daily_capacity > 0 then
    select count(*)::integer
      into v_daily_count
    from public.task_runs r
    where r.node_id = v_node.id
      and r.created_at >= date_trunc('day', v_now)
      and r.created_at < date_trunc('day', v_now) + interval '1 day'
      and r.status <> 'cancelled';

    if v_daily_count >= v_node.daily_capacity then
      raise exception using
        errcode = 'P0001',
        message = '오늘 준비된 업무 수량이 모두 소진되었습니다.';
    end if;
  end if;

  -- 사용자 입력값을 모두 무시하고 서버 기준 값을 채운다.
  new.id := gen_random_uuid();
  new.public_id := 'PDK-RUN-' ||
    to_char(v_now, 'YYMMDD') || '-' ||
    upper(substr(replace(new.id::text, '-', ''), 1, 8));
  new.user_id := v_user_id;
  new.status := 'in_progress';
  new.started_at := v_now;
  new.expected_completed_at := v_now + make_interval(secs => v_node.estimated_seconds);
  new.completed_at := null;
  new.progress := 0;

  v_variant_index := (
    (hashtextextended(new.id::text, 0) % 4 + 4) % 4
  )::integer;
  new.motion_variant := (array['a', 'b', 'c', 'd'])[v_variant_index + 1];
  new.motion_seed := encode(gen_random_bytes(24), 'hex');
  new.reward_policy_version := 'operator-catalog-1.0.0';
  v_reward := round(
    v_node.reward_min +
    random() * (v_node.reward_max - v_node.reward_min),
    2
  );
  new.reward_amount := v_reward;
  new.reward_status := 'held';
  new.created_at := v_now;
  new.updated_at := v_now;

  insert into public.task_events (
    task_run_id,
    user_id,
    event_type,
    event_payload
  )
  values (
    new.id,
    new.user_id,
    'started',
    jsonb_build_object(
      'node_id', v_node.id,
      'node_public_id', v_node.public_id,
      'motion_profile', v_node.motion_profile,
      'motion_version', v_node.motion_version,
      'expected_seconds', v_node.estimated_seconds
    )
  );

  return new;
end;
$$;

revoke all on function private.prepare_putduk_task_run() from public, anon, authenticated;
grant execute on function private.prepare_putduk_task_run() to service_role;

drop trigger if exists prepare_putduk_task_run on public.task_runs;
create trigger prepare_putduk_task_run
before insert on public.task_runs
for each row
execute function private.prepare_putduk_task_run();

drop policy if exists task_runs_insert_own on public.task_runs;
create policy task_runs_insert_own
on public.task_runs
for insert
to authenticated
with check ((select auth.uid()) = user_id);

create index if not exists task_runs_active_user_idx
on public.task_runs (user_id, status)
where status in ('reserved', 'in_progress', 'checkpointed', 'submitted', 'review_pending');

comment on function private.prepare_putduk_task_run() is
  '회원 업무 시작 시 서버가 회원·노드·한도·보상을 검증하고 실행 정보를 생성한다.';

commit;
