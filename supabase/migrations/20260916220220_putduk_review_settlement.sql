-- 운영자 검수 완료·보상 확정 트랜잭션
-- 제출/검수 대기 업무를 운영자가 승인하면 상태·지갑·원장·알림을 한 번에 확정한다.

begin;

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
  v_reward numeric(18,2);
  v_inserted integer := 0;
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

  if not exists (
    select 1
    from private.admin_roles ar
    where ar.user_id = p_reviewer_id
      and ar.role in ('super_admin', 'work_review')
  ) then
    raise exception using errcode = '42501', message = '검수 권한이 있는 운영자만 처리할 수 있습니다.';
  end if;

  select r.*
    into v_run
  from public.task_runs r
  where r.id = p_task_run_id
  for update;

  if not found then
    raise exception using errcode = 'P0002', message = '검수 대상 업무를 찾을 수 없습니다.';
  end if;

  -- 이미 확정된 업무는 중복 보상 없이 현재 결과를 반환한다.
  if v_run.status = 'approved' and v_run.reward_status = 'posted' then
    return v_run;
  end if;

  if v_run.status not in ('submitted', 'review_pending') then
    raise exception using errcode = '23514', message = '제출 완료 또는 검수 대기 상태의 업무만 처리할 수 있습니다.';
  end if;

  select n.*
    into v_node
  from public.nodes n
  where n.id = v_run.node_id;

  if v_decision = 'approved' then
    v_reward := greatest(0, round(v_run.reward_amount, 2));

    update public.task_runs
    set status = 'approved',
        progress = 1,
        completed_at = coalesce(completed_at, v_now),
        reward_status = 'posted',
        updated_at = v_now
    where id = v_run.id
    returning * into v_after;

    perform pg_advisory_xact_lock(
      hashtextextended('putduk-wallet:' || v_run.user_id::text || ':KRW', 0)
    );

    insert into public.wallet_accounts (user_id, bucket, currency, available_amount, held_amount)
    values
      (v_run.user_id, 'task_reward', 'KRW', 0, 0),
      (v_run.user_id, 'available', 'KRW', 0, 0)
    on conflict (user_id, bucket, currency) do nothing;

    insert into private.ledger_entries (
      public_id,
      user_id,
      bucket,
      currency,
      amount,
      entry_type,
      reference_type,
      reference_id,
      idempotency_key,
      created_by
    )
    values (
      'PDK-LEDGER-' || upper(substr(replace(gen_random_uuid()::text, '-', ''), 1, 16)),
      v_run.user_id,
      'task_reward',
      'KRW',
      v_reward,
      'task_reward_posted',
      'task_run',
      v_run.id,
      'task-reward:' || v_run.id::text,
      p_reviewer_id
    )
    on conflict (idempotency_key) do nothing;

    get diagnostics v_inserted = row_count;

    if v_inserted = 1 then
      update public.wallet_accounts
      set available_amount = available_amount + v_reward,
          updated_at = v_now
      where user_id = v_run.user_id
        and bucket in ('task_reward', 'available')
        and currency = 'KRW';

      insert into public.notifications (user_id, title, body, notification_type)
      values (
        v_run.user_id,
        '업무 검수가 완료됐어요',
        coalesce(v_node.title_ko, '선택한 업무') || ' 업무가 검수 완료됐어요. ' ||
          to_char(v_reward, 'FM999G999G999G990D00') || '원이 작업 보상 지갑에 반영됐습니다.',
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
          'reward_amount', v_reward,
          'status', 'approved'
        )
      );
    end if;
  elsif v_decision = 'rework' then
    update public.task_runs
    set status = 'rework',
        reward_status = 'held',
        updated_at = v_now
    where id = v_run.id
    returning * into v_after;

    insert into public.notifications (user_id, title, body, notification_type)
    values (
      v_run.user_id,
      '업무를 한 번 더 확인해 주세요',
      coalesce(v_node.title_ko, '제출한 업무') || '에 재확인이 필요합니다.' ||
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
    update public.task_runs
    set status = 'rejected',
        reward_status = 'reversed',
        updated_at = v_now
    where id = v_run.id
    returning * into v_after;

    insert into public.notifications (user_id, title, body, notification_type)
    values (
      v_run.user_id,
      '업무 검수 결과를 확인해 주세요',
      coalesce(v_node.title_ko, '제출한 업무') || '가 반려됐습니다.' ||
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

revoke all on function public.putduk_admin_review_task(uuid, uuid, text, text, numeric)
  from public, anon, authenticated;
grant execute on function public.putduk_admin_review_task(uuid, uuid, text, text, numeric)
  to service_role;

comment on function public.putduk_admin_review_task(uuid, uuid, text, text, numeric) is
  '운영자 검수 결과를 업무 상태·보상 원장·지갑·회원 알림과 함께 원자적으로 확정한다.';

commit;
