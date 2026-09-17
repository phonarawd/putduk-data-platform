-- 회원 근무 제출 답을 work_submissions·task_events에 남긴다.
-- 금액은 기존 잠금·검수 RPC만 바꾸고, 이 함수는 보기만 저장한다.

begin;

create or replace function public.putduk_member_submit_work(
  p_user_id uuid,
  p_task_run_id uuid,
  p_choice_id text,
  p_choice_label text default null
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public, private
as $$
declare
  v_run public.task_runs%rowtype;
  v_node public.nodes%rowtype;
  v_now timestamptz := now();
  v_raw text;
  v_choice text;
  v_label text;
  v_payload jsonb;
  v_event_id uuid;
begin
  if p_user_id is null or p_task_run_id is null then
    raise exception using
      errcode = '22023',
      message = '근무 정보가 필요해요.';
  end if;

  select r.*
    into v_run
  from public.task_runs r
  where r.id = p_task_run_id
    and r.user_id = p_user_id
  for update;

  if not found then
    raise exception using
      errcode = 'P0002',
      message = '본인 업무만 제출할 수 있습니다.';
  end if;

  if v_run.status not in ('in_progress', 'checkpointed') then
    raise exception using
      errcode = '23514',
      message = '현재 상태에서는 업무를 제출할 수 없습니다.';
  end if;

  if v_run.expected_completed_at is not null and v_now < v_run.expected_completed_at then
    raise exception using
      errcode = '23514',
      message = '예상 처리 시간이 지나면 제출할 수 있습니다.';
  end if;

  select n.* into v_node from public.nodes n where n.id = v_run.node_id;
  if not found then
    raise exception using
      errcode = 'P0002',
      message = '근무 카드를 찾을 수 없어요.';
  end if;

  v_raw := lower(trim(coalesce(p_choice_id, '')));
  v_label := nullif(trim(coalesce(p_choice_label, '')), '');

  if v_raw in ('a', '1', 'yes', 'choice_a', 'choice-a') then
    v_choice := 'a';
  elsif v_raw in ('b', '2', 'no', 'choice_b', 'choice-b') then
    v_choice := 'b';
  elsif v_label is not null and nullif(trim(coalesce(v_node.choice_a_ko, '')), '') is not null
        and v_label = trim(v_node.choice_a_ko) then
    v_choice := 'a';
  elsif v_label is not null and nullif(trim(coalesce(v_node.choice_b_ko, '')), '') is not null
        and v_label = trim(v_node.choice_b_ko) then
    v_choice := 'b';
  else
    raise exception using
      errcode = '22023',
      message = '맞아요 / 달라요 중 하나를 골라 주세요.';
  end if;

  if v_choice = 'a' then
    v_label := coalesce(nullif(trim(coalesce(v_node.choice_a_ko, '')), ''), v_label, '맞아요');
  else
    v_label := coalesce(nullif(trim(coalesce(v_node.choice_b_ko, '')), ''), v_label, '달라요');
  end if;

  if char_length(v_label) > 80 then
    v_label := left(v_label, 80);
  end if;

  v_payload := jsonb_build_object(
    'choice_id', v_choice,
    'choice', v_choice,
    'selected_choice', v_choice,
    'member_choice', v_choice,
    'picked', case when v_choice = 'a' then 'yes' else 'no' end,
    'label', v_label,
    'submitted_at', v_now,
    'completed_at', v_now,
    'reward_status', 'pending'
  );

  update public.task_runs
  set
    status = 'submitted',
    completed_at = v_now,
    progress = 1,
    reward_status = 'pending',
    updated_at = v_now
  where id = v_run.id
  returning * into v_run;

  insert into public.work_submissions (
    task_run_id,
    user_id,
    answer_payload,
    submitted_at
  )
  values (
    v_run.id,
    p_user_id,
    v_payload,
    v_now
  )
  on conflict on constraint work_submissions_task_run_id_key
  do update
    set answer_payload = excluded.answer_payload,
        submitted_at = excluded.submitted_at;

  select e.id
    into v_event_id
  from public.task_events e
  where e.task_run_id = v_run.id
    and e.event_type = 'submitted'
  order by e.created_at desc
  limit 1;

  if v_event_id is not null then
    update public.task_events
    set event_payload = coalesce(event_payload, '{}'::jsonb) || v_payload
    where id = v_event_id;
  else
    insert into public.task_events (
      task_run_id,
      user_id,
      event_type,
      event_payload
    )
    values (
      v_run.id,
      p_user_id,
      'submitted',
      v_payload
    );
  end if;

  return jsonb_build_object(
    'id', v_run.id,
    'public_id', v_run.public_id,
    'status', v_run.status,
    'reward_amount', v_run.reward_amount,
    'completed_at', v_run.completed_at,
    'choice_id', v_choice,
    'choice_label', v_label,
    'submitted_at', v_now
  );
end;
$$;

revoke all on function public.putduk_member_submit_work(uuid, uuid, text, text)
  from public, anon, authenticated;
grant execute on function public.putduk_member_submit_work(uuid, uuid, text, text)
  to service_role;

comment on function public.putduk_member_submit_work(uuid, uuid, text, text) is
  '회원 근무 제출. 고른 보기를 work_submissions와 task_events에 저장한다. 금액은 바꾸지 않는다.';

commit;
