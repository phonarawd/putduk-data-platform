-- 서버 기준 업무 완료 경계
-- 회원은 자신의 실행을 제출할 수 있지만, 완료 시각·보상·노드 정보는 DB가 고정한다.

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
begin
  -- 운영자/서버 계정은 별도 검수·정산 경로를 사용한다.
  if current_setting('request.jwt.claim.role', true) = 'service_role'
     and auth.uid() is null then
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

  -- 식별자·노드·시작 시각·보상은 시작 시 서버가 정한 값을 유지한다.
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

drop trigger if exists guard_putduk_task_run_update on public.task_runs;
create trigger guard_putduk_task_run_update
before update on public.task_runs
for each row
execute function private.guard_putduk_task_run_update();

drop policy if exists task_runs_update_submit_own on public.task_runs;
create policy task_runs_update_submit_own
on public.task_runs
for update
to authenticated
using ((select auth.uid()) = user_id)
with check ((select auth.uid()) = user_id);

comment on function private.guard_putduk_task_run_update() is
  '회원 제출 시 서버 시각과 원래 보상·노드 정보를 보존하고 제출 이벤트를 기록한다.';

commit;
