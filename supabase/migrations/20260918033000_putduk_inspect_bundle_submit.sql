-- 근무 제출은 5건 대조 답을 서버가 검증한다. 시계 대기는 검수 행위로 대체한다.

begin;

create or replace function private.putduk_inspect_expected_choice(
  p_run_id uuid,
  p_index integer
)
returns text
language plpgsql
immutable
set search_path = pg_catalog, public, private
as $$
declare
  v_hex text;
  v_seed bigint;
  v_mismatch_a integer;
  v_mismatch_b integer;
begin
  if p_run_id is null or p_index is null or p_index < 0 or p_index > 4 then
    return null;
  end if;
  v_hex := substr(replace(p_run_id::text, '-', ''), 1, 8);
  v_seed := ('x' || v_hex)::bit(32)::bigint;
  if v_seed < 0 then
    v_seed := v_seed + 4294967296;
  end if;
  v_mismatch_a := (v_seed % 5)::integer;
  v_mismatch_b := ((v_seed + 2) % 5)::integer;
  if p_index = v_mismatch_a or p_index = v_mismatch_b then
    return 'no';
  end if;
  return 'yes';
end;
$$;

revoke all on function private.putduk_inspect_expected_choice(uuid, integer) from public, anon, authenticated;
grant execute on function private.putduk_inspect_expected_choice(uuid, integer) to service_role;

create or replace function private.putduk_inspect_normalize_choice(p_raw text)
returns text
language plpgsql
immutable
set search_path = pg_catalog
as $$
declare
  v_raw text := lower(trim(coalesce(p_raw, '')));
begin
  if v_raw in ('a', '1', 'yes', 'choice_a', 'choice-a') then
    return 'yes';
  end if;
  if v_raw in ('b', '2', 'no', 'choice_b', 'choice-b') then
    return 'no';
  end if;
  return null;
end;
$$;

revoke all on function private.putduk_inspect_normalize_choice(text) from public, anon, authenticated;
grant execute on function private.putduk_inspect_normalize_choice(text) to service_role;

drop function if exists public.putduk_member_submit_work(uuid, uuid, text, text);

create or replace function public.putduk_member_submit_work(
  p_user_id uuid,
  p_task_run_id uuid,
  p_choice_id text,
  p_choice_label text default null,
  p_inspect jsonb default null
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
  v_answers jsonb;
  v_got text;
  v_expected text;
  v_i integer;
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

  v_answers := case
    when p_inspect is null then '[]'::jsonb
    when jsonb_typeof(p_inspect -> 'answers') = 'array' then p_inspect -> 'answers'
    when jsonb_typeof(p_inspect) = 'array' then p_inspect
    else '[]'::jsonb
  end;

  if jsonb_array_length(v_answers) <> 5 then
    raise exception using
      errcode = '22023',
      message = '오늘 배정 물량 5건을 대조해 주세요.';
  end if;

  for v_i in 0..4 loop
    v_got := private.putduk_inspect_normalize_choice(v_answers ->> v_i);
    v_expected := private.putduk_inspect_expected_choice(p_task_run_id, v_i);
    if v_got is null or v_got <> v_expected then
      raise exception using
        errcode = '22023',
        message = '번호를 다시 확인해 주세요.';
    end if;
  end loop;

  select n.* into v_node from public.nodes n where n.id = v_run.node_id;
  if not found then
    raise exception using
      errcode = 'P0002',
      message = '근무 카드를 찾을 수 없어요.';
  end if;

  v_raw := coalesce(
    private.putduk_inspect_normalize_choice(v_answers ->> 4),
    private.putduk_inspect_normalize_choice(p_choice_id)
  );
  if v_raw = 'yes' then
    v_choice := 'a';
  else
    v_choice := 'b';
  end if;

  v_label := nullif(trim(coalesce(p_choice_label, '')), '');
  if v_label is null or v_label not like '%5건%' then
    v_label := '오늘 배정 물량 5건 정상 검수';
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
    'choice_label', v_label,
    'inspect_ok', true,
    'inspect_total', 5,
    'inspect_answers', v_answers,
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
    'inspect_ok', true,
    'submitted_at', v_now
  );
end;
$$;

revoke all on function public.putduk_member_submit_work(uuid, uuid, text, text, jsonb)
  from public, anon, authenticated;
grant execute on function public.putduk_member_submit_work(uuid, uuid, text, text, jsonb)
  to service_role;

comment on function public.putduk_member_submit_work(uuid, uuid, text, text, jsonb) is
  '회원 근무 제출. 5건 대조 답을 검증해 work_submissions와 task_events에 저장한다. 금액은 바꾸지 않는다.';

commit;
