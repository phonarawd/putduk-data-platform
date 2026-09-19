-- P0 업무 생명주기 가드
-- 1) Edge/service-role 제출도 expected_completed_at 이전에는 완료할 수 없다.
-- 2) 운영자 rework는 검수 이벤트/결정은 보존하되 실제 run을 checkpointed로 돌려
--    회원이 같은 업무를 다시 열고 수정·재제출할 수 있게 한다.

begin;

create or replace function private.enforce_putduk_submit_minimum_duration()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, public, private
as $$
begin
  if old.status in ('in_progress', 'checkpointed', 'rework')
     and new.status = 'submitted'
     and old.expected_completed_at is not null
     and now() < old.expected_completed_at
  then
    raise exception using
      errcode = '23514',
      message = '예상 처리 시간이 지나면 제출할 수 있습니다.';
  end if;

  return new;
end;
$$;

revoke all on function private.enforce_putduk_submit_minimum_duration()
  from public, anon, authenticated;
grant execute on function private.enforce_putduk_submit_minimum_duration()
  to service_role;

drop trigger if exists enforce_putduk_submit_minimum_duration on public.task_runs;
create trigger enforce_putduk_submit_minimum_duration
before update of status on public.task_runs
for each row
execute function private.enforce_putduk_submit_minimum_duration();

comment on function private.enforce_putduk_submit_minimum_duration() is
  '회원 업무 제출의 최소 처리시간을 DB에서 강제한다. service_role RPC도 우회할 수 없다.';

create or replace function private.resume_putduk_rework_run()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, public, private
as $$
begin
  if new.status = 'rework'
     and old.status in ('submitted', 'review_pending')
  then
    update public.task_runs
    set status = 'checkpointed',
        completed_at = null,
        progress = least(coalesce(new.progress, 1), 0.95),
        reward_status = 'held',
        updated_at = now()
    where id = new.id
      and status = 'rework';
  end if;

  return new;
end;
$$;

revoke all on function private.resume_putduk_rework_run()
  from public, anon, authenticated;
grant execute on function private.resume_putduk_rework_run()
  to service_role;

drop trigger if exists resume_putduk_rework_run on public.task_runs;
create trigger resume_putduk_rework_run
after update of status on public.task_runs
for each row
execute function private.resume_putduk_rework_run();

comment on function private.resume_putduk_rework_run() is
  '운영자 재작업 요청을 기록한 뒤 같은 run을 checkpointed로 복귀시켜 원금 잠금을 유지한 채 재제출하게 한다.';

commit;
