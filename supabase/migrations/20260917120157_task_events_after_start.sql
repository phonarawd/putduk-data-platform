create or replace function private.record_putduk_task_run_started()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, public, private, extensions
as $$
declare
  v_node public.nodes%rowtype;
  v_seconds integer;
begin
  if new.status is distinct from 'in_progress' then
    return new;
  end if;

  select n.* into v_node from public.nodes n where n.id = new.node_id;
  v_seconds := greatest(
    1,
    coalesce(
      extract(epoch from (new.expected_completed_at - new.started_at))::integer,
      v_node.estimated_seconds,
      30
    )
  );

  insert into public.task_events (task_run_id, user_id, event_type, event_payload)
  values (
    new.id,
    new.user_id,
    'started',
    jsonb_build_object(
      'node_id', new.node_id,
      'node_public_id', v_node.public_id,
      'motion_profile', v_node.motion_profile,
      'motion_version', v_node.motion_version,
      'expected_seconds', v_seconds,
      'locked_stake_krw', new.locked_stake_krw,
      'stipend_krw', new.stipend_krw,
      'is_trial', new.is_trial
    )
  );
  return new;
end;
$$;

revoke all on function private.record_putduk_task_run_started() from public, anon, authenticated;
grant execute on function private.record_putduk_task_run_started() to service_role;

drop trigger if exists record_putduk_task_run_started on public.task_runs;
create trigger record_putduk_task_run_started
after insert on public.task_runs
for each row
execute function private.record_putduk_task_run_started();

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

comment on function private.record_putduk_task_run_started() is
  '출근 행이 생긴 뒤에 시작 이벤트를 남긴다. BEFORE INSERT에서 FK가 깨지지 않게 한다.';
