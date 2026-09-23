-- 관리자 Auth 상태 검증을 모든 직접 role 경로에도 적용한다.
-- role 행만 남은 계정이 Edge/RPC의 별도 경로에서 관리자 권한을 계속 행사하지 못하게 한다.

begin;

create or replace function public.putduk_admin_list_roles(p_user_id uuid)
returns text[]
language sql
stable
security definer
set search_path = pg_catalog, public, private
as $$
  select coalesce(array_agg(ar.role order by ar.role), '{}'::text[])
  from private.admin_roles ar
  join auth.users u on u.id = ar.user_id
  where ar.user_id = p_user_id
    and u.email_confirmed_at is not null
    and u.deleted_at is null
    and (u.banned_until is null or u.banned_until <= now());
$$;

create or replace function public.putduk_admin_append_audit(
  p_admin_id uuid,
  p_action text,
  p_target_type text default null,
  p_target_id uuid default null,
  p_reason text default null,
  p_before jsonb default null,
  p_after jsonb default null
)
returns uuid
language plpgsql
security definer
set search_path = pg_catalog, public, private
as $$
declare
  v_id uuid;
begin
  if p_admin_id is null
     or not exists (
       select 1
       from private.admin_roles ar
       join auth.users u on u.id = ar.user_id
       where ar.user_id = p_admin_id
         and u.email_confirmed_at is not null
         and u.deleted_at is null
         and (u.banned_until is null or u.banned_until <= now())
     )
  then
    raise exception using errcode = '22023', message = '유효한 운영자 계정이 필요합니다.';
  end if;

  if nullif(trim(coalesce(p_action, '')), '') is null then
    raise exception using errcode = '22023', message = '감사 기록 동작명이 필요합니다.';
  end if;

  insert into private.admin_audit_logs (
    admin_id, action, target_type, target_id, reason, before_data, after_data
  )
  values (
    p_admin_id,
    trim(p_action),
    nullif(trim(coalesce(p_target_type, '')), ''),
    p_target_id,
    nullif(trim(coalesce(p_reason, '')), ''),
    p_before,
    p_after
  )
  returning id into v_id;

  return v_id;
end;
$$;

create or replace function public.putduk_admin_review_task(
  p_task_run_id uuid,
  p_reviewer_id uuid,
  p_decision text,
  p_reason text default null,
  p_score numeric default null
)
returns public.task_runs
language plpgsql
security definer
set search_path = pg_catalog, public, private, extensions
as $$
declare
  v_run public.task_runs%rowtype;
  v_after public.task_runs%rowtype;
  v_node public.nodes%rowtype;
  v_decision text := lower(trim(coalesce(p_decision, '')));
  v_reason text := nullif(left(trim(coalesce(p_reason, '')), 1000), '');
  v_now timestamptz := now();
  v_stipend numeric(18,2);
  v_stake numeric(18,2);
begin
  if p_task_run_id is null or p_reviewer_id is null then
    raise exception using errcode = '22023', message = '검수 대상과 운영자 정보가 필요합니다.';
  end if;

  if v_decision not in ('approved', 'rework', 'rejected') then
    raise exception using errcode = '22023', message = '검수 결과가 올바르지 않습니다.';
  end if;

  if p_score is not null and (p_score < 0 or p_score > 1) then
    raise exception using errcode = '22023', message = '검수 점수는 0~1 사이여야 합니다.';
  end if;

  if not public.putduk_admin_has_role(p_reviewer_id, array['super_admin', 'work_review']) then
    raise exception using errcode = '42501', message = '검수 권한이 있는 운영자만 처리할 수 있습니다.';
  end if;

  select r.* into v_run
  from public.task_runs r
  where r.id = p_task_run_id
  for update;

  if not found then
    raise exception using errcode = 'P0002', message = '검수 대상 업무를 찾을 수 없습니다.';
  end if;

  if v_run.status = 'approved' and v_run.reward_status = 'posted' then
    return v_run;
  end if;

  if v_run.status not in ('submitted', 'review_pending') then
    raise exception using errcode = '23514', message = '제출 완료 또는 검수 대기 상태의 업무만 처리할 수 있습니다.';
  end if;

  select n.* into v_node from public.nodes n where n.id = v_run.node_id;
  v_stipend := round(coalesce(nullif(v_run.stipend_krw, 0), v_run.reward_amount, 0), 2);
  v_stake := round(coalesce(v_run.locked_stake_krw, 0), 2);

  if v_decision = 'approved' then
    perform private.putduk_release_stake(v_run.id, p_reviewer_id);
    perform private.putduk_grant_stipend(v_run.id, p_reviewer_id);

    update public.task_runs
    set status = 'approved',
        progress = 1,
        completed_at = coalesce(completed_at, v_now),
        reward_status = 'posted',
        updated_at = v_now
    where id = v_run.id
    returning * into v_after;

    insert into public.notifications (user_id, title, body, notification_type)
    values (
      v_run.user_id,
      '✅ 근무가 승인됐어요',
      case
        when coalesce(v_after.is_trial, false) then
          '체험 지원금은 소진됐고, 수당 ' || to_char(v_stipend, 'FM999G999G999G990') || '원이 출금 가능에 들어왔어요.'
        else
          '원금 ' || to_char(v_stake, 'FM999G999G999G990') || '원은 근무 잔액에, 수당 ' ||
          to_char(v_stipend, 'FM999G999G999G990') || '원은 출금 가능에 반영됐어요.'
      end,
      'work'
    );

    insert into public.task_events (task_run_id, user_id, event_type, event_payload)
    values (
      v_run.id,
      v_run.user_id,
      'review_approved',
      jsonb_build_object(
        'reviewer_id', p_reviewer_id,
        'score', p_score,
        'stipend_krw', v_stipend,
        'locked_stake_krw', v_stake,
        'principal_to', 'work_balance',
        'stipend_to', 'available',
        'status', 'approved'
      )
    );
  elsif v_decision = 'rework' then
    update public.task_runs
    set status = 'rework', reward_status = 'held', updated_at = v_now
    where id = v_run.id
    returning * into v_after;

    insert into public.notifications (user_id, title, body, notification_type)
    values (
      v_run.user_id,
      '👀 업무를 한 번 더 확인해 주세요',
      coalesce(v_node.title_ko, '제출한 업무') || '에 재확인이 필요해요.' ||
        case when v_reason is null then '' else ' 운영자 안내: ' || v_reason end,
      'work'
    );

    insert into public.task_events (task_run_id, user_id, event_type, event_payload)
    values (
      v_run.id,
      v_run.user_id,
      'review_rework',
      jsonb_build_object(
        'reviewer_id', p_reviewer_id,
        'score', p_score,
        'reason', v_reason,
        'status', 'rework'
      )
    );
  else
    perform private.putduk_release_stake(v_run.id, p_reviewer_id);

    update public.task_runs
    set status = 'rejected', reward_status = 'reversed', updated_at = v_now
    where id = v_run.id
    returning * into v_after;

    insert into public.notifications (user_id, title, body, notification_type)
    values (
      v_run.user_id,
      '↩️ 근무가 반려됐어요',
      case
        when coalesce(v_after.is_trial, false) then
          '체험 지원금은 반환되지 않아요.'
        else
          '원금 ' || to_char(v_stake, 'FM999G999G999G990') || '원은 근무 잔액으로 돌아왔어요.'
      end ||
      case when v_reason is null then '' else ' 운영자 안내: ' || v_reason end,
      'work'
    );

    insert into public.task_events (task_run_id, user_id, event_type, event_payload)
    values (
      v_run.id,
      v_run.user_id,
      'review_rejected',
      jsonb_build_object(
        'reviewer_id', p_reviewer_id,
        'score', p_score,
        'reason', v_reason,
        'status', 'rejected'
      )
    );
  end if;

  insert into private.review_decisions (task_run_id, reviewer_id, decision, reason, score)
  values (v_run.id, p_reviewer_id, v_decision, v_reason, p_score);

  return v_after;
end;
$$;

comment on function public.putduk_admin_list_roles(uuid) is
  '관리자 역할 조회 시 Auth confirmed/deleted/banned 상태를 함께 검증';

comment on function public.putduk_admin_append_audit(uuid,text,text,uuid,text,jsonb,jsonb) is
  '감사로그 기록도 유효한 Auth 관리자 계정에서만 허용';

comment on function public.putduk_admin_review_task(uuid,uuid,text,text,numeric) is
  '업무 검수 권한을 공통 관리자 Auth 상태 검증 함수와 통일';

commit;
