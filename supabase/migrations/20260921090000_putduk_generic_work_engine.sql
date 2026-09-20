-- Stage 3: versioned generic work engine foundation.
-- Existing nodes/task_runs/review/settlement remain canonical. This migration is additive.

begin;

create table if not exists private.work_templates (
  id uuid primary key default gen_random_uuid(),
  template_key text not null unique,
  title_ko text not null,
  purpose_ko text not null,
  status text not null default 'draft' check (status in ('draft', 'published', 'archived')),
  created_by uuid null references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint work_templates_key_format check (template_key ~ '^[a-z0-9]+([._-][a-z0-9]+)*$')
);

create table if not exists private.work_template_versions (
  id uuid primary key default gen_random_uuid(),
  work_template_id uuid not null references private.work_templates(id) on delete cascade,
  version integer not null check (version > 0),
  schema_version text not null default 'putduk.work/1.0',
  definition jsonb not null,
  status text not null default 'draft' check (status in ('draft', 'published', 'retired')),
  created_by uuid null references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  published_at timestamptz null,
  unique (work_template_id, version),
  constraint work_template_versions_schema check (schema_version = 'putduk.work/1.0'),
  constraint work_template_versions_definition_object check (jsonb_typeof(definition) = 'object')
);

create index if not exists work_templates_created_by_idx on private.work_templates(created_by);
create index if not exists work_template_versions_template_id_idx
  on private.work_template_versions(work_template_id);
create index if not exists work_template_versions_created_by_idx on private.work_template_versions(created_by);

create table if not exists private.work_orders (
  id uuid primary key default gen_random_uuid(),
  order_key text not null unique,
  node_id uuid not null references public.nodes(id) on delete cascade,
  work_template_version_id uuid not null references private.work_template_versions(id) on delete restrict,
  source_mode text not null default 'static' check (source_mode in ('static', 'legacy_inspect', 'legacy_catalog')),
  input_payload jsonb not null default '{"items":[]}'::jsonb,
  validation_payload jsonb not null default '{"items":[]}'::jsonb,
  status text not null default 'draft' check (status in ('draft', 'active', 'paused', 'closed')),
  created_by uuid null references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint work_orders_input_object check (jsonb_typeof(input_payload) = 'object'),
  constraint work_orders_validation_object check (jsonb_typeof(validation_payload) = 'object')
);

create index if not exists work_orders_node_id_idx on private.work_orders(node_id);
create index if not exists work_orders_template_version_id_idx on private.work_orders(work_template_version_id);
create index if not exists work_orders_created_by_idx on private.work_orders(created_by);
create unique index if not exists work_orders_one_active_node_idx
  on private.work_orders(node_id) where status = 'active';

alter table public.task_runs
  add column if not exists work_order_id uuid null references private.work_orders(id) on delete restrict,
  add column if not exists work_template_version_id uuid null references private.work_template_versions(id) on delete restrict,
  add column if not exists work_schema_version text null;

create index if not exists task_runs_work_order_id_idx on public.task_runs(work_order_id);
create index if not exists task_runs_work_template_version_id_idx on public.task_runs(work_template_version_id);

create table if not exists private.task_run_items (
  id uuid primary key default gen_random_uuid(),
  task_run_id uuid not null references public.task_runs(id) on delete cascade,
  work_order_id uuid not null references private.work_orders(id) on delete restrict,
  work_template_version_id uuid not null references private.work_template_versions(id) on delete restrict,
  step_key text not null,
  item_key text not null,
  ordinal integer not null check (ordinal > 0),
  member_payload jsonb not null default '{}'::jsonb,
  validation_payload jsonb not null default '{}'::jsonb,
  evidence_policy jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  unique (task_run_id, item_key),
  constraint task_run_items_member_object check (jsonb_typeof(member_payload) = 'object'),
  constraint task_run_items_validation_object check (jsonb_typeof(validation_payload) = 'object'),
  constraint task_run_items_evidence_object check (jsonb_typeof(evidence_policy) = 'object')
);

create index if not exists task_run_items_task_run_id_idx on private.task_run_items(task_run_id);
create index if not exists task_run_items_work_order_id_idx on private.task_run_items(work_order_id);
create index if not exists task_run_items_template_version_id_idx on private.task_run_items(work_template_version_id);

create table if not exists private.task_run_answers (
  id uuid primary key default gen_random_uuid(),
  task_run_item_id uuid not null unique references private.task_run_items(id) on delete cascade,
  task_run_id uuid not null references public.task_runs(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  answer_payload jsonb not null default '{}'::jsonb,
  evidence_payload jsonb not null default '{}'::jsonb,
  validation_status text not null default 'pending' check (validation_status in ('pending', 'passed', 'failed')),
  validation_errors jsonb not null default '[]'::jsonb,
  answered_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint task_run_answers_answer_object check (jsonb_typeof(answer_payload) = 'object'),
  constraint task_run_answers_evidence_object check (jsonb_typeof(evidence_payload) = 'object'),
  constraint task_run_answers_errors_array check (jsonb_typeof(validation_errors) = 'array')
);

create index if not exists task_run_answers_task_run_id_idx on private.task_run_answers(task_run_id);
create index if not exists task_run_answers_user_id_idx on private.task_run_answers(user_id);

revoke all on table private.work_templates from public, anon, authenticated;
revoke all on table private.work_template_versions from public, anon, authenticated;
revoke all on table private.work_orders from public, anon, authenticated;
revoke all on table private.task_run_items from public, anon, authenticated;
revoke all on table private.task_run_answers from public, anon, authenticated;
grant select, insert, update, delete on table private.work_templates to service_role;
grant select, insert, update, delete on table private.work_template_versions to service_role;
grant select, insert, update, delete on table private.work_orders to service_role;
grant select, insert, update, delete on table private.task_run_items to service_role;
grant select, insert, update, delete on table private.task_run_answers to service_role;

comment on table private.work_templates is '범용 업무 흐름의 안정된 식별자. 회원/어드민 UI에 내부 이름을 직접 노출하지 않는다.';
comment on table private.work_template_versions is '버전 고정된 업무 schema/component/workflow/submission/review/settlement 계약.';
comment on table private.work_orders is '기존 node를 versioned 업무 정의와 실제 입력 데이터에 연결하는 운영 주문.';
comment on table private.task_run_items is '업무 시작 시 run에 고정된 member-safe 입력과 server-only validation 기대값.';
comment on table private.task_run_answers is '범용 제출의 item별 답변·증빙·서버 검증 결과.';

insert into private.work_templates (template_key, title_ko, purpose_ko, status)
values
  ('inspect_bundle', '라벨·전표 5건 대조', '표시된 송장 번호와 실물 라벨 번호가 일치하는지 5건을 확인합니다.', 'published'),
  ('catalog_listing', '상품 정보 4칸 입력', '카드에 보이는 상품명·가격·옵션·배송 정보를 그대로 입력합니다.', 'published')
on conflict (template_key) do update
set title_ko = excluded.title_ko,
    purpose_ko = excluded.purpose_ko,
    status = excluded.status,
    updated_at = now();

insert into private.work_template_versions (
  work_template_id, version, schema_version, definition, status, published_at
)
select
  t.id,
  1,
  'putduk.work/1.0',
  '{"schema_version":"putduk.work/1.0","template_key":"inspect_bundle","template_version":1,"title_ko":"라벨·전표 5건 대조","purpose_ko":"표시된 송장 번호와 실물 라벨 번호가 일치하는지 5건을 확인합니다.","components":[{"key":"match","type":"choice","label_ko":"두 번호가 같나요?","required":true,"options":[{"value":"yes","label_ko":"같아요"},{"value":"no","label_ko":"달라요"}],"validation":{"mode":"equals_expected"},"evidence":{"capture":"value","type":"answer_snapshot"}}],"workflow":{"mode":"linear","steps":[{"key":"inspect","title_ko":"라벨 확인","repeat":"items","component_keys":["match"]}]},"evidence":{"model":"answer_snapshot.v1","retain_with_submission":true},"submission":{"contract":"putduk.work_submission/1.0","mode":"all_required_valid"},"review":{"contract":"putduk.review/1.0","decisions":["approved","rework","rejected"]},"settlement":{"contract":"putduk.stake_stipend/1.0","trigger":"review_approved","release_stake":true,"post_stipend":true}}'::jsonb,
  'published',
  now()
from private.work_templates t
where t.template_key = 'inspect_bundle'
on conflict (work_template_id, version) do update
set schema_version = excluded.schema_version,
    definition = excluded.definition,
    status = excluded.status,
    published_at = coalesce(private.work_template_versions.published_at, excluded.published_at);

insert into private.work_template_versions (
  work_template_id, version, schema_version, definition, status, published_at
)
select
  t.id,
  1,
  'putduk.work/1.0',
  '{"schema_version":"putduk.work/1.0","template_key":"catalog_listing","template_version":1,"title_ko":"상품 정보 4칸 입력","purpose_ko":"카드에 보이는 상품명·가격·옵션·배송 정보를 그대로 입력합니다.","components":[{"key":"product_name","type":"text","label_ko":"상품명","required":true,"max_length":120,"validation":{"mode":"equals_expected"},"evidence":{"capture":"value"}},{"key":"price","type":"digits","label_ko":"가격","required":true,"min_length":1,"max_length":12,"validation":{"mode":"equals_expected"},"evidence":{"capture":"value"}},{"key":"option","type":"text","label_ko":"옵션","required":true,"max_length":120,"validation":{"mode":"equals_expected"},"evidence":{"capture":"value"}},{"key":"shipping","type":"text","label_ko":"배송","required":true,"max_length":120,"validation":{"mode":"equals_expected"},"evidence":{"capture":"value"}}],"workflow":{"mode":"linear","steps":[{"key":"listing","title_ko":"상품 정보 입력","repeat":"items","component_keys":["product_name","price","option","shipping"]}]},"evidence":{"model":"answer_snapshot.v1","retain_with_submission":true},"submission":{"contract":"putduk.work_submission/1.0","mode":"all_required_valid"},"review":{"contract":"putduk.review/1.0","decisions":["approved","rework","rejected"]},"settlement":{"contract":"putduk.stake_stipend/1.0","trigger":"review_approved","release_stake":true,"post_stipend":true}}'::jsonb,
  'published',
  now()
from private.work_templates t
where t.template_key = 'catalog_listing'
on conflict (work_template_id, version) do update
set schema_version = excluded.schema_version,
    definition = excluded.definition,
    status = excluded.status,
    published_at = coalesce(private.work_template_versions.published_at, excluded.published_at);

insert into private.work_orders (
  order_key, node_id, work_template_version_id, source_mode, input_payload, validation_payload, status
)
select
  'node:' || n.id::text,
  n.id,
  v.id,
  case when coalesce(n.motion_profile, '') ilike '%catalog%' then 'legacy_catalog' else 'legacy_inspect' end,
  '{"items":[]}'::jsonb,
  '{"items":[]}'::jsonb,
  'active'
from public.nodes n
join private.work_templates t
  on t.template_key = case when coalesce(n.motion_profile, '') ilike '%catalog%' then 'catalog_listing' else 'inspect_bundle' end
join private.work_template_versions v
  on v.work_template_id = t.id and v.version = 1 and v.status = 'published'
on conflict (order_key) do update
set work_template_version_id = excluded.work_template_version_id,
    source_mode = excluded.source_mode,
    status = 'active',
    updated_at = now();

create or replace function private.putduk_work_actor_ok(p_user_id uuid)
returns boolean
language sql
stable
security definer
set search_path = pg_catalog, auth
as $$
  select
    p_user_id is not null
    and (
      auth.uid() = p_user_id
      or coalesce(auth.role(), '') = 'service_role'
      or (auth.uid() is null and coalesce(auth.role(), '') = '')
    );
$$;

revoke all on function private.putduk_work_actor_ok(uuid) from public, anon, authenticated;
grant execute on function private.putduk_work_actor_ok(uuid) to service_role;

create or replace function private.putduk_work_normalize_value(p_type text, p_value jsonb)
returns text
language plpgsql
immutable
set search_path = pg_catalog
as $$
declare
  v_type text := lower(trim(coalesce(p_type, 'text')));
  v_text text;
begin
  if p_value is null or p_value = 'null'::jsonb then
    return null;
  end if;
  v_text := p_value #>> '{}';
  if v_type = 'digits' then
    return regexp_replace(coalesce(v_text, ''), '[^0-9]', '', 'g');
  elsif v_type = 'choice' then
    return lower(trim(coalesce(v_text, '')));
  elsif v_type = 'boolean' then
    if lower(trim(coalesce(v_text, ''))) in ('1', 'true', 'yes', 'y') then return 'true'; end if;
    if lower(trim(coalesce(v_text, ''))) in ('0', 'false', 'no', 'n') then return 'false'; end if;
    return null;
  elsif v_type = 'integer' then
    if trim(coalesce(v_text, '')) ~ '^-?[0-9]+$' then return (trim(v_text)::numeric)::text; end if;
    return null;
  end if;
  return btrim(regexp_replace(coalesce(v_text, ''), '\s+', ' ', 'g'));
end;
$$;

revoke all on function private.putduk_work_normalize_value(text, jsonb) from public, anon, authenticated;
grant execute on function private.putduk_work_normalize_value(text, jsonb) to service_role;

create or replace function private.putduk_legacy_inspect_member_item(p_run_id uuid, p_index integer)
returns jsonb
language plpgsql
immutable
set search_path = pg_catalog
as $$
declare
  v_hex text;
  v_seed bigint;
  v_invoice integer;
  v_target integer;
  v_mismatch boolean;
begin
  if p_run_id is null or p_index < 0 or p_index > 4 then
    return null;
  end if;
  v_hex := substr(replace(p_run_id::text, '-', ''), 1, 8);
  v_seed := ('x' || v_hex)::bit(32)::bigint;
  if v_seed < 0 then v_seed := v_seed + 4294967296; end if;
  v_invoice := 1000 + ((v_seed + p_index * 137) % 9000)::integer;
  v_mismatch := p_index = (v_seed % 5)::integer or p_index = ((v_seed + 2) % 5)::integer;
  v_target := case
    when v_mismatch then 1000 + ((v_invoice - 1000 + 17) % 9000)
    else v_invoice
  end;
  return jsonb_build_object(
    'index', p_index + 1,
    'invoice_code', 'PDK-' || lpad(v_invoice::text, 4, '0'),
    'target_code', 'PDK-' || lpad(v_target::text, 4, '0')
  );
end;
$$;

revoke all on function private.putduk_legacy_inspect_member_item(uuid, integer) from public, anon, authenticated;
grant execute on function private.putduk_legacy_inspect_member_item(uuid, integer) to service_role;

create or replace function private.putduk_bind_work_contract()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, public, private
as $$
declare
  v_order private.work_orders%rowtype;
  v_version private.work_template_versions%rowtype;
begin
  if new.node_id is null then return new; end if;
  select o.* into v_order
  from private.work_orders o
  join private.work_template_versions v on v.id = o.work_template_version_id
  where o.node_id = new.node_id
    and o.status = 'active'
    and v.status = 'published'
  order by o.updated_at desc
  limit 1;
  if not found then return new; end if;
  select * into v_version from private.work_template_versions where id = v_order.work_template_version_id;
  new.work_order_id := v_order.id;
  new.work_template_version_id := v_version.id;
  new.work_schema_version := v_version.schema_version;
  return new;
end;
$$;

create or replace function private.putduk_materialize_work_items()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, public, private
as $$
declare
  v_order private.work_orders%rowtype;
  v_template_key text;
  v_definition jsonb;
  v_item jsonb;
  v_validation jsonb;
  v_listing jsonb;
  v_index integer;
  v_ordinal bigint;
begin
  if new.work_order_id is null or new.work_template_version_id is null then return new; end if;
  select * into v_order
  from private.work_orders
  where id = new.work_order_id;
  select t.template_key, v.definition
    into v_template_key, v_definition
  from private.work_template_versions v
  join private.work_templates t on t.id = v.work_template_id
  where v.id = new.work_template_version_id;

  if v_order.source_mode = 'legacy_inspect' then
    for v_index in 0..4 loop
      insert into private.task_run_items (
        task_run_id, work_order_id, work_template_version_id, step_key, item_key, ordinal,
        member_payload, validation_payload, evidence_policy
      ) values (
        new.id, v_order.id, new.work_template_version_id, 'inspect', 'inspect-' || (v_index + 1)::text, v_index + 1,
        private.putduk_legacy_inspect_member_item(new.id, v_index),
        jsonb_build_object('match', private.putduk_inspect_expected_choice(new.id, v_index)),
        jsonb_build_object('match', jsonb_build_object('capture', 'value', 'type', 'answer_snapshot'))
      )
      on conflict (task_run_id, item_key) do nothing;
    end loop;
  elsif v_order.source_mode = 'legacy_catalog' then
    v_listing := private.putduk_catalog_expected_listing(new.id);
    insert into private.task_run_items (
      task_run_id, work_order_id, work_template_version_id, step_key, item_key, ordinal,
      member_payload, validation_payload, evidence_policy
    ) values (
      new.id, v_order.id, new.work_template_version_id, 'listing', 'listing-1', 1,
      v_listing,
      v_listing,
      jsonb_build_object(
        'product_name', jsonb_build_object('capture', 'value'),
        'price', jsonb_build_object('capture', 'value'),
        'option', jsonb_build_object('capture', 'value'),
        'shipping', jsonb_build_object('capture', 'value')
      )
    )
    on conflict (task_run_id, item_key) do nothing;
  else
    for v_item, v_ordinal in
      select value, ordinality
      from jsonb_array_elements(coalesce(v_order.input_payload -> 'items', '[]'::jsonb)) with ordinality
    loop
      select value into v_validation
      from jsonb_array_elements(coalesce(v_order.validation_payload -> 'items', '[]'::jsonb))
      where value ->> 'item_key' = coalesce(v_item ->> 'item_key', 'item-' || v_ordinal::text)
      limit 1;
      insert into private.task_run_items (
        task_run_id, work_order_id, work_template_version_id, step_key, item_key, ordinal,
        member_payload, validation_payload, evidence_policy
      ) values (
        new.id,
        v_order.id,
        new.work_template_version_id,
        coalesce(nullif(v_item ->> 'step_key', ''), v_definition #>> '{workflow,steps,0,key}', 'work'),
        coalesce(nullif(v_item ->> 'item_key', ''), 'item-' || v_ordinal::text),
        v_ordinal::integer,
        coalesce(v_item -> 'payload', '{}'::jsonb),
        coalesce(v_validation -> 'expected', '{}'::jsonb),
        coalesce(v_item -> 'evidence_policy', '{}'::jsonb)
      )
      on conflict (task_run_id, item_key) do nothing;
    end loop;
  end if;
  return new;
end;
$$;

drop trigger if exists zz_putduk_bind_work_contract on public.task_runs;
create trigger zz_putduk_bind_work_contract
before insert on public.task_runs
for each row execute function private.putduk_bind_work_contract();

drop trigger if exists putduk_materialize_work_items on public.task_runs;
create trigger putduk_materialize_work_items
after insert on public.task_runs
for each row execute function private.putduk_materialize_work_items();

create or replace function public.putduk_member_work_contract(p_user_id uuid, p_task_run_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public, private, auth
as $$
declare
  v_run public.task_runs%rowtype;
  v_definition jsonb;
  v_template_key text;
  v_template_version integer;
  v_items jsonb;
begin
  if not private.putduk_work_actor_ok(p_user_id) then
    raise exception using errcode = '42501', message = '본인 업무만 열 수 있습니다.';
  end if;
  select * into v_run
  from public.task_runs
  where id = p_task_run_id and user_id = p_user_id;
  if not found then
    raise exception using errcode = 'P0002', message = '업무를 찾을 수 없습니다.';
  end if;
  if v_run.work_template_version_id is null then
    return jsonb_build_object('available', false, 'legacy', true, 'task_run_id', v_run.id);
  end if;
  select v.definition, t.template_key, v.version
    into v_definition, v_template_key, v_template_version
  from private.work_template_versions v
  join private.work_templates t on t.id = v.work_template_id
  where v.id = v_run.work_template_version_id;

  select coalesce(jsonb_agg(jsonb_build_object(
    'item_key', i.item_key,
    'step_key', i.step_key,
    'ordinal', i.ordinal,
    'payload', i.member_payload
  ) order by i.ordinal), '[]'::jsonb)
  into v_items
  from private.task_run_items i
  where i.task_run_id = v_run.id;

  return jsonb_build_object(
    'available', true,
    'contract', 'putduk.work_contract/1.0',
    'schema_version', v_run.work_schema_version,
    'template_key', v_template_key,
    'template_version', v_template_version,
    'task_run_id', v_run.id,
    'definition', v_definition,
    'items', v_items
  );
end;
$$;

revoke all on function public.putduk_member_work_contract(uuid, uuid) from public, anon;
grant execute on function public.putduk_member_work_contract(uuid, uuid) to authenticated, service_role;
comment on function public.putduk_member_work_contract(uuid, uuid) is '범용 업무 member-safe contract. server-only validation_payload는 반환하지 않는다.';

create or replace function public.putduk_member_submit_work_v2(
  p_user_id uuid,
  p_task_run_id uuid,
  p_submission jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public, private, auth
as $$
declare
  v_run public.task_runs%rowtype;
  v_definition jsonb;
  v_template_key text;
  v_template_version integer;
  v_item private.task_run_items%rowtype;
  v_step jsonb;
  v_component_key text;
  v_component jsonb;
  v_type text;
  v_mode text;
  v_required boolean;
  v_answer jsonb;
  v_answer_text text;
  v_expected jsonb;
  v_expected_text text;
  v_evidence jsonb;
  v_errors jsonb := '[]'::jsonb;
  v_component_errors jsonb;
  v_options text[];
  v_len integer;
  v_now timestamptz := now();
  v_event_id uuid;
begin
  if not private.putduk_work_actor_ok(p_user_id) then
    raise exception using errcode = '42501', message = '본인 업무만 제출할 수 있습니다.';
  end if;
  if p_submission is null or jsonb_typeof(p_submission) <> 'object' then
    raise exception using errcode = '22023', message = '제출 내용을 확인해 주세요.';
  end if;

  select * into v_run
  from public.task_runs
  where id = p_task_run_id and user_id = p_user_id
  for update;
  if not found then
    raise exception using errcode = 'P0002', message = '업무를 찾을 수 없습니다.';
  end if;
  if v_run.status not in ('in_progress', 'checkpointed') then
    raise exception using errcode = '23514', message = '현재 상태에서는 업무를 제출할 수 없습니다.';
  end if;
  if v_run.work_template_version_id is null or v_run.work_order_id is null then
    raise exception using errcode = '23514', message = '이 업무는 기존 제출 경로를 사용해 주세요.';
  end if;
  if not exists (select 1 from private.task_run_items where task_run_id = v_run.id) then
    raise exception using errcode = '23514', message = '업무 항목이 준비되지 않았습니다. 다시 시작해 주세요.';
  end if;

  select v.definition, t.template_key, v.version
    into v_definition, v_template_key, v_template_version
  from private.work_template_versions v
  join private.work_templates t on t.id = v.work_template_id
  where v.id = v_run.work_template_version_id;

  if coalesce(p_submission ->> 'contract', '') <> 'putduk.work_submission/1.0'
     or coalesce(p_submission ->> 'schema_version', '') <> v_run.work_schema_version
     or coalesce(p_submission ->> 'template_key', '') <> v_template_key
     or coalesce(p_submission ->> 'template_version', '') <> v_template_version::text then
    raise exception using errcode = '22023', message = '업무 제출 버전이 맞지 않습니다. 화면을 새로고침해 주세요.';
  end if;
  if nullif(p_submission ->> 'task_run_id', '') is not null
     and (p_submission ->> 'task_run_id') <> v_run.id::text then
    raise exception using errcode = '22023', message = '업무 제출 대상을 확인해 주세요.';
  end if;

  for v_item in
    select * from private.task_run_items where task_run_id = v_run.id order by ordinal
  loop
    select value into v_step
    from jsonb_array_elements(coalesce(v_definition #> '{workflow,steps}', '[]'::jsonb))
    where value ->> 'key' = v_item.step_key
    limit 1;
    if v_step is null then
      v_errors := v_errors || jsonb_build_array(jsonb_build_object('item_key', v_item.item_key, 'code', 'step_missing'));
      continue;
    end if;

    for v_component_key in
      select jsonb_array_elements_text(coalesce(v_step -> 'component_keys', '[]'::jsonb))
    loop
      select value into v_component
      from jsonb_array_elements(coalesce(v_definition -> 'components', '[]'::jsonb))
      where value ->> 'key' = v_component_key
      limit 1;
      if v_component is null then
        v_errors := v_errors || jsonb_build_array(jsonb_build_object('item_key', v_item.item_key, 'component_key', v_component_key, 'code', 'component_missing'));
        continue;
      end if;
      v_component_errors := '[]'::jsonb;
      v_type := coalesce(v_component ->> 'type', 'text');
      v_mode := coalesce(v_component #>> '{validation,mode}', 'none');
      v_required := coalesce((v_component ->> 'required')::boolean, true);
      v_answer := p_submission #> array['answers', v_item.item_key, v_component_key];
      v_answer_text := private.putduk_work_normalize_value(v_type, v_answer);

      if v_required and coalesce(v_answer_text, '') = '' then
        v_component_errors := v_component_errors || jsonb_build_array(jsonb_build_object('code', 'required'));
      end if;

      if coalesce(v_answer_text, '') <> '' and v_type = 'choice' then
        select array_agg(lower(value ->> 'value')) into v_options
        from jsonb_array_elements(coalesce(v_component -> 'options', '[]'::jsonb));
        if v_options is null or not (lower(v_answer_text) = any(v_options)) then
          v_component_errors := v_component_errors || jsonb_build_array(jsonb_build_object('code', 'option'));
        end if;
      end if;

      if coalesce(v_answer_text, '') <> '' and v_type in ('text', 'digits') then
        v_len := char_length(v_answer_text);
        if v_component ? 'min_length' and v_len < (v_component ->> 'min_length')::integer then
          v_component_errors := v_component_errors || jsonb_build_array(jsonb_build_object('code', 'min_length'));
        end if;
        if v_component ? 'max_length' and v_len > (v_component ->> 'max_length')::integer then
          v_component_errors := v_component_errors || jsonb_build_array(jsonb_build_object('code', 'max_length'));
        end if;
      end if;

      if coalesce(v_answer_text, '') <> '' and v_type = 'integer' then
        if v_component ? 'min' and v_answer_text::numeric < (v_component ->> 'min')::numeric then
          v_component_errors := v_component_errors || jsonb_build_array(jsonb_build_object('code', 'min'));
        end if;
        if v_component ? 'max' and v_answer_text::numeric > (v_component ->> 'max')::numeric then
          v_component_errors := v_component_errors || jsonb_build_array(jsonb_build_object('code', 'max'));
        end if;
      end if;

      if v_mode = 'equals_expected' and coalesce(v_answer_text, '') <> '' then
        v_expected := v_item.validation_payload -> v_component_key;
        v_expected_text := private.putduk_work_normalize_value(v_type, v_expected);
        if v_expected_text is null or v_answer_text is distinct from v_expected_text then
          v_component_errors := v_component_errors || jsonb_build_array(jsonb_build_object('code', 'mismatch'));
        end if;
      elsif v_mode not in ('none', 'equals_expected') then
        v_component_errors := v_component_errors || jsonb_build_array(jsonb_build_object('code', 'validator_unsupported'));
      end if;

      if coalesce((v_component #>> '{evidence,required}')::boolean, false) then
        v_evidence := p_submission #> array['evidence', v_item.item_key, v_component_key];
        if v_evidence is null or v_evidence = 'null'::jsonb then
          v_component_errors := v_component_errors || jsonb_build_array(jsonb_build_object('code', 'evidence_required'));
        end if;
      end if;

      if jsonb_array_length(v_component_errors) > 0 then
        v_errors := v_errors || jsonb_build_array(jsonb_build_object(
          'item_key', v_item.item_key,
          'component_key', v_component_key,
          'errors', v_component_errors
        ));
      end if;
    end loop;
  end loop;

  if jsonb_array_length(v_errors) > 0 then
    return jsonb_build_object('ok', false, 'errors', v_errors);
  end if;

  for v_item in
    select * from private.task_run_items where task_run_id = v_run.id order by ordinal
  loop
    insert into private.task_run_answers (
      task_run_item_id, task_run_id, user_id, answer_payload, evidence_payload,
      validation_status, validation_errors, answered_at, updated_at
    ) values (
      v_item.id,
      v_run.id,
      p_user_id,
      coalesce(p_submission #> array['answers', v_item.item_key], '{}'::jsonb),
      coalesce(p_submission #> array['evidence', v_item.item_key], '{}'::jsonb),
      'passed',
      '[]'::jsonb,
      v_now,
      v_now
    )
    on conflict (task_run_item_id) do update
    set answer_payload = excluded.answer_payload,
        evidence_payload = excluded.evidence_payload,
        validation_status = 'passed',
        validation_errors = '[]'::jsonb,
        answered_at = excluded.answered_at,
        updated_at = excluded.updated_at;
  end loop;

  update public.task_runs
  set status = 'submitted', completed_at = v_now, progress = 1, reward_status = 'pending', updated_at = v_now
  where id = v_run.id
  returning * into v_run;

  insert into public.work_submissions (task_run_id, user_id, answer_payload, submitted_at)
  values (
    v_run.id,
    p_user_id,
    p_submission || jsonb_build_object('server_validation', 'passed', 'server_validated_at', v_now),
    v_now
  )
  on conflict on constraint work_submissions_task_run_id_key
  do update set answer_payload = excluded.answer_payload, submitted_at = excluded.submitted_at;

  select e.id into v_event_id
  from public.task_events e
  where e.task_run_id = v_run.id and e.event_type = 'submitted'
  order by e.created_at desc limit 1;

  if v_event_id is null then
    insert into public.task_events (task_run_id, user_id, event_type, event_payload)
    values (
      v_run.id,
      p_user_id,
      'submitted',
      jsonb_build_object(
        'work_engine', 'v2',
        'schema_version', v_run.work_schema_version,
        'template_key', v_template_key,
        'template_version', v_template_version,
        'submitted_at', v_now
      )
    );
  else
    update public.task_events
    set event_payload = coalesce(event_payload, '{}'::jsonb) || jsonb_build_object(
      'work_engine', 'v2',
      'schema_version', v_run.work_schema_version,
      'template_key', v_template_key,
      'template_version', v_template_version,
      'submitted_at', v_now
    )
    where id = v_event_id;
  end if;

  return jsonb_build_object(
    'ok', true,
    'id', v_run.id,
    'public_id', v_run.public_id,
    'status', v_run.status,
    'schema_version', v_run.work_schema_version,
    'template_key', v_template_key,
    'template_version', v_template_version,
    'reward_amount', v_run.reward_amount,
    'completed_at', v_run.completed_at,
    'submitted_at', v_now
  );
end;
$$;

revoke all on function public.putduk_member_submit_work_v2(uuid, uuid, jsonb) from public, anon;
grant execute on function public.putduk_member_submit_work_v2(uuid, uuid, jsonb) to authenticated, service_role;
comment on function public.putduk_member_submit_work_v2(uuid, uuid, jsonb) is '범용 work schema 기반 제출. 서버 expected 값으로 검증하고 금액은 변경하지 않는다. 검수/정산은 기존 review contract가 담당한다.';

commit;
