-- 카탈로그 입력 제출과 중간 저장. 금액은 바꾸지 않는다.

begin;

create or replace function private.putduk_catalog_expected_listing(p_run_id uuid)
returns jsonb
language plpgsql
immutable
set search_path = pg_catalog
as $$
declare
  v_hex text;
  v_seed bigint;
  v_names text[] := array[
    '무선 이어폰 실리콘 케이스',
    '캠핑 접이식 테이블',
    '유아 스트라이프 내의',
    '스테인리스 텀블러 500ml'
  ];
  v_prices text[] := array['12900', '35900', '18900', '24900'];
  v_options text[] := array['블랙 / 1개', '우드 / 2인용', '90호 / 아이보리', '실버 / 손잡이형'];
  v_shipping text[] := array['무료배송 · 오늘출발', '3,000원 · 2-3일', '무료배송 · 해외직구 10일', '조건부무료 · 3만원 이상'];
begin
  if p_run_id is null then
    return null;
  end if;
  v_hex := substr(replace(p_run_id::text, '-', ''), 1, 8);
  v_seed := ('x' || v_hex)::bit(32)::bigint;
  if v_seed < 0 then
    v_seed := v_seed + 4294967296;
  end if;
  return jsonb_build_object(
    'product_name', v_names[1 + (v_seed % 4)::integer],
    'price', v_prices[1 + (((v_seed / 8)::bigint) % 4)::integer],
    'option', v_options[1 + (((v_seed / 32)::bigint) % 4)::integer],
    'shipping', v_shipping[1 + (((v_seed / 128)::bigint) % 4)::integer]
  );
end;
$$;

revoke all on function private.putduk_catalog_expected_listing(uuid) from public, anon, authenticated;
grant execute on function private.putduk_catalog_expected_listing(uuid) to service_role;

create or replace function public.putduk_member_checkpoint_work(
  p_user_id uuid,
  p_task_run_id uuid,
  p_payload jsonb default '{}'::jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public, private
as $$
declare
  v_run public.task_runs%rowtype;
  v_now timestamptz := now();
  v_payload jsonb := coalesce(p_payload, '{}'::jsonb);
begin
  if p_user_id is null or p_task_run_id is null then
    raise exception using errcode = '22023', message = '근무 정보가 필요해요.';
  end if;

  select r.* into v_run
  from public.task_runs r
  where r.id = p_task_run_id
    and r.user_id = p_user_id
  for update;

  if not found then
    raise exception using errcode = 'P0002', message = '본인 업무만 저장할 수 있어요.';
  end if;

  if v_run.status not in ('reserved', 'in_progress', 'checkpointed') then
    raise exception using errcode = '23514', message = '지금은 중간 저장할 수 없어요.';
  end if;

  insert into public.task_checkpoints (
    task_run_id,
    user_id,
    checkpoint_key,
    checkpoint_payload
  )
  values (
    v_run.id,
    p_user_id,
    'work-draft',
    v_payload || jsonb_build_object('saved_at', v_now)
  )
  on conflict (task_run_id, checkpoint_key)
  do update
    set checkpoint_payload = excluded.checkpoint_payload;

  update public.task_runs
  set
    status = 'checkpointed',
    progress = greatest(coalesce(progress, 0), coalesce((v_payload ->> 'progress')::numeric, progress, 0)),
    updated_at = v_now
  where id = v_run.id
  returning * into v_run;

  return jsonb_build_object(
    'id', v_run.id,
    'public_id', v_run.public_id,
    'status', v_run.status,
    'saved_at', v_now
  );
end;
$$;

revoke all on function public.putduk_member_checkpoint_work(uuid, uuid, jsonb)
  from public, anon, authenticated;
grant execute on function public.putduk_member_checkpoint_work(uuid, uuid, jsonb)
  to service_role;

comment on function public.putduk_member_checkpoint_work(uuid, uuid, jsonb) is
  '회원 근무 중간 저장. 초안만 남기고 금액은 바꾸지 않는다.';

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
  v_kind text;
  v_is_catalog boolean;
  v_listing jsonb;
  v_expected_listing jsonb;
  v_got_name text;
  v_got_price text;
  v_got_option text;
  v_got_shipping text;
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

  select n.* into v_node from public.nodes n where n.id = v_run.node_id;
  if not found then
    raise exception using
      errcode = 'P0002',
      message = '근무 카드를 찾을 수 없어요.';
  end if;

  v_is_catalog := coalesce(v_node.motion_profile, '') ilike '%catalog%';
  v_kind := coalesce(p_inspect ->> 'kind', '');

  if v_is_catalog then
    v_listing := case
      when jsonb_typeof(p_inspect -> 'listing') = 'object' then p_inspect -> 'listing'
      when v_kind = 'catalog_listing' then p_inspect
      else '{}'::jsonb
    end;
    v_got_name := btrim(regexp_replace(coalesce(v_listing ->> 'product_name', v_listing ->> 'productName', ''), '\s+', ' ', 'g'));
    v_got_price := regexp_replace(coalesce(v_listing ->> 'price', ''), '[^0-9]', '', 'g');
    v_got_option := btrim(regexp_replace(coalesce(v_listing ->> 'option', ''), '\s+', ' ', 'g'));
    v_got_shipping := btrim(regexp_replace(coalesce(v_listing ->> 'shipping', ''), '\s+', ' ', 'g'));
    v_expected_listing := private.putduk_catalog_expected_listing(p_task_run_id);

    if v_got_name = '' or v_got_price = '' or v_got_option = '' or v_got_shipping = '' then
      raise exception using errcode = '22023', message = '상품명·가격·옵션·배송을 모두 입력해 주세요.';
    end if;
    if v_got_name <> (v_expected_listing ->> 'product_name')
      or v_got_price <> (v_expected_listing ->> 'price')
      or v_got_option <> (v_expected_listing ->> 'option')
      or v_got_shipping <> (v_expected_listing ->> 'shipping')
    then
      raise exception using errcode = '22023', message = '상품 정보를 카드와 같게 다시 적어 주세요.';
    end if;

    v_choice := 'a';
    v_label := nullif(trim(coalesce(p_choice_label, '')), '');
    if v_label is null or v_label not like '%상품%' then
      v_label := '상품 정보 4칸 입력 완료';
    end if;
    if char_length(v_label) > 80 then
      v_label := left(v_label, 80);
    end if;

    v_payload := jsonb_build_object(
      'choice_id', v_choice,
      'choice', v_choice,
      'selected_choice', v_choice,
      'member_choice', v_choice,
      'picked', 'yes',
      'label', v_label,
      'choice_label', v_label,
      'work_kind', 'catalog_listing',
      'listing', jsonb_build_object(
        'product_name', v_got_name,
        'price', v_got_price,
        'option', v_got_option,
        'shipping', v_got_shipping
      ),
      'inspect_ok', true,
      'submitted_at', v_now,
      'completed_at', v_now,
      'reward_status', 'pending'
    );
  else
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
  end if;

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
  '회원 근무 제출. 5건 대조 또는 카탈로그 4칸 입력을 검증한다. 금액은 바꾸지 않는다.';

commit;
