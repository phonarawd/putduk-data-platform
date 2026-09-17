-- 운영자 검수 RPC가 task_runs를 갱신할 때 회원 제출 가드에 막히지 않게 한다.

begin;

create or replace function private.guard_putduk_task_run_update()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, public, private, extensions
as $$
declare
  v_user_id uuid;
  v_now timestamptz := now();
  v_jwt_role text := coalesce(auth.role(), current_setting('request.jwt.claim.role', true), '');
begin
  if v_jwt_role = 'service_role' then
    new.updated_at := coalesce(new.updated_at, v_now);
    return new;
  end if;

  v_user_id := auth.uid();
  if v_user_id is null or old.user_id <> v_user_id then
    raise exception using
      errcode = '42501',
      message = '본인 업무만 제출할 수 있습니다.';
  end if;

  if old.status not in ('in_progress', 'checkpointed') then
    raise exception using
      errcode = '23514',
      message = '현재 상태에서는 업무를 제출할 수 없습니다.';
  end if;

  if new.status <> 'submitted' then
    raise exception using
      errcode = '23514',
      message = '업무는 제출 상태로만 변경할 수 있습니다.';
  end if;

  if v_now < old.expected_completed_at then
    raise exception using
      errcode = '23514',
      message = '예상 처리 시간이 지나면 제출할 수 있습니다.';
  end if;

  new.id := old.id;
  new.public_id := old.public_id;
  new.user_id := old.user_id;
  new.node_id := old.node_id;
  new.started_at := old.started_at;
  new.expected_completed_at := old.expected_completed_at;
  new.completed_at := v_now;
  new.progress := 1;
  new.motion_variant := old.motion_variant;
  new.motion_seed := old.motion_seed;
  new.reward_policy_version := old.reward_policy_version;
  new.reward_amount := old.reward_amount;
  new.reward_status := 'pending';
  new.created_at := old.created_at;
  new.updated_at := v_now;

  insert into public.task_events (
    task_run_id,
    user_id,
    event_type,
    event_payload
  )
  values (
    old.id,
    old.user_id,
    'submitted',
    jsonb_build_object(
      'completed_at', v_now,
      'reward_status', 'pending'
    )
  );

  return new;
end;
$$;

revoke all on function private.guard_putduk_task_run_update() from public, anon, authenticated;
grant execute on function private.guard_putduk_task_run_update() to service_role;

commit;
