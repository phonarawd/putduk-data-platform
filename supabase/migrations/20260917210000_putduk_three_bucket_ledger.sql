-- P0 세 칸 원장: 체험 지원금 / 근무 잔액 / 출금 가능. 잠금·정산·출금 완료 RPC.

begin;

-- ---------------------------------------------------------------------------
-- 1. 스키마
-- ---------------------------------------------------------------------------

alter table public.wallet_accounts
  drop constraint if exists wallet_accounts_bucket_check;

alter table public.wallet_accounts
  add constraint wallet_accounts_bucket_check
  check (bucket in ('support_grant', 'work_balance', 'task_reward', 'referral_reward', 'available', 'held'));

insert into public.wallet_accounts (user_id, bucket, currency, available_amount, held_amount)
select distinct w.user_id, 'work_balance', w.currency, 0, 0
from public.wallet_accounts w
on conflict (user_id, bucket, currency) do nothing;

insert into public.wallet_accounts (user_id, bucket, currency, available_amount, held_amount)
select p.id, 'work_balance', 'KRW', 0, 0
from public.profiles p
on conflict (user_id, bucket, currency) do nothing;

alter table public.profiles
  add column if not exists trial_consumed_at timestamptz,
  add column if not exists line_open boolean not null default true,
  add column if not exists line_closed_at timestamptz,
  add column if not exists priority_pick boolean not null default true,
  add column if not exists dedicated_queue boolean not null default true,
  add column if not exists weekly_volume_boost boolean not null default true,
  add column if not exists high_value_notice boolean not null default true,
  add column if not exists principal_withdraw_count integer not null default 0;

alter table public.task_runs
  add column if not exists locked_stake_krw numeric(18,2) not null default 0,
  add column if not exists stipend_krw numeric(18,2) not null default 0,
  add column if not exists stake_bucket text,
  add column if not exists is_trial boolean not null default false,
  add column if not exists stake_released boolean not null default false;

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conrelid = 'public.task_runs'::regclass
      and conname = 'task_runs_stake_bucket_check'
  ) then
    alter table public.task_runs
      add constraint task_runs_stake_bucket_check
      check (stake_bucket is null or stake_bucket in ('support_grant', 'work_balance'));
  end if;
end
$$;

alter table public.withdrawal_requests
  drop constraint if exists withdrawal_requests_status_check;

alter table public.withdrawal_requests
  add constraint withdrawal_requests_status_check
  check (status in ('submitted', 'checking', 'approved', 'sent', 'completed', 'rejected', 'cancelled'));

alter table public.withdrawal_requests
  add column if not exists include_principal boolean not null default false,
  add column if not exists principal_included boolean not null default false,
  add column if not exists note text,
  add column if not exists stipend_amount numeric(18,2) not null default 0,
  add column if not exists principal_amount numeric(18,2) not null default 0,
  add column if not exists completed_at timestamptz,
  add column if not exists completed_by uuid references auth.users(id) on delete set null,
  add column if not exists demotion_applied boolean not null default false,
  add column if not exists previous_member_tier text,
  add column if not exists new_member_tier text,
  add column if not exists line_closed boolean not null default false;

create unique index if not exists withdrawal_requests_one_open_uidx
  on public.withdrawal_requests (user_id)
  where status in ('submitted', 'checking', 'approved');

create index if not exists withdrawal_requests_completed_by_idx
  on public.withdrawal_requests (completed_by);

alter table public.nodes
  add column if not exists stake_krw numeric(18,2) not null default 0,
  add column if not exists stipend_krw numeric(18,2) not null default 0,
  add column if not exists tier_band text not null default '소액',
  add column if not exists partner_slug text,
  add column if not exists question_prompt_ko text,
  add column if not exists question_image_path text,
  add column if not exists choice_a_ko text,
  add column if not exists choice_b_ko text,
  add column if not exists daily_cap integer not null default 0,
  add column if not exists requires_assign boolean not null default false,
  add column if not exists is_trial boolean not null default false;

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conrelid = 'public.nodes'::regclass and conname = 'nodes_stake_krw_check'
  ) then
    alter table public.nodes add constraint nodes_stake_krw_check check (stake_krw >= 0);
  end if;
  if not exists (
    select 1 from pg_constraint
    where conrelid = 'public.nodes'::regclass and conname = 'nodes_stipend_krw_check'
  ) then
    alter table public.nodes add constraint nodes_stipend_krw_check check (stipend_krw >= 0);
  end if;
  if not exists (
    select 1 from pg_constraint
    where conrelid = 'public.nodes'::regclass and conname = 'nodes_tier_band_check'
  ) then
    alter table public.nodes
      add constraint nodes_tier_band_check
      check (tier_band in ('체험', '소액', '중간', '고액', '초고액'));
  end if;
  if not exists (
    select 1 from pg_constraint
    where conrelid = 'public.nodes'::regclass and conname = 'nodes_daily_cap_check'
  ) then
    alter table public.nodes add constraint nodes_daily_cap_check check (daily_cap >= 0);
  end if;
end
$$;

update public.nodes
set daily_cap = daily_capacity
where daily_cap = 0 and daily_capacity > 0;

update public.nodes
set stipend_krw = reward_min
where stipend_krw = 0 and reward_min > 0;

update public.nodes n
set partner_slug = b.slug
from public.partner_brands b
where b.id = n.partner_brand_id
  and (n.partner_slug is null or n.partner_slug = '');

create table if not exists private.node_answer_keys (
  node_id uuid primary key references public.nodes(id) on delete cascade,
  correct_choice text not null check (correct_choice in ('a', 'b')),
  updated_at timestamptz not null default now()
);

alter table private.node_answer_keys enable row level security;

drop policy if exists private_service_role_full_access on private.node_answer_keys;
create policy private_service_role_full_access
  on private.node_answer_keys for all to service_role
  using (true) with check (true);

grant select, insert, update, delete on private.node_answer_keys to service_role;

update public.support_grant_campaigns
set amount = 10000
where trigger_type = 'signup'
  and name = '신규 회원 업무 지원금';

comment on column public.wallet_accounts.bucket is
  '세 칸 진실: support_grant(체험 지원금), work_balance(근무 잔액), available(출금 가능). 합치지 않는다.';
comment on column public.nodes.stake_krw is '근무 시작 시 잠그는 원금(원).';
comment on column public.nodes.stipend_krw is '검수 승인 시 출금 가능 칸으로 가는 수당(원).';
comment on column public.nodes.requires_assign is '초고액 등 운영자 배정 후에만 시작.';
comment on table private.node_answer_keys is '2지선다 정답. 회원 RLS로 노출하지 않는다.';

-- ---------------------------------------------------------------------------
-- 2. 원장  primitive
-- ---------------------------------------------------------------------------

create or replace function private.putduk_ensure_wallets(p_user_id uuid, p_currency text)
returns void
language plpgsql
security definer
set search_path = pg_catalog, public, private
as $$
begin
  insert into public.wallet_accounts (user_id, bucket, currency, available_amount, held_amount)
  values
    (p_user_id, 'support_grant', p_currency, 0, 0),
    (p_user_id, 'work_balance', p_currency, 0, 0),
    (p_user_id, 'available', p_currency, 0, 0),
    (p_user_id, 'task_reward', p_currency, 0, 0),
    (p_user_id, 'referral_reward', p_currency, 0, 0),
    (p_user_id, 'held', p_currency, 0, 0)
  on conflict (user_id, bucket, currency) do nothing;
end;
$$;

revoke all on function private.putduk_ensure_wallets(uuid, text) from public, anon, authenticated;
grant execute on function private.putduk_ensure_wallets(uuid, text) to service_role;

create or replace function private.putduk_wallet_snapshot(p_user_id uuid)
returns jsonb
language sql
stable
security definer
set search_path = pg_catalog, public, private
as $$
  select coalesce((
    select jsonb_agg(jsonb_build_object(
      'bucket', w.bucket,
      'currency', w.currency,
      'available_amount', w.available_amount,
      'held_amount', w.held_amount
    ) order by w.currency, w.bucket)
    from public.wallet_accounts w
    where w.user_id = p_user_id
  ), '[]'::jsonb);
$$;

revoke all on function private.putduk_wallet_snapshot(uuid) from public, anon, authenticated;
grant execute on function private.putduk_wallet_snapshot(uuid) to service_role;

create or replace function private.putduk_apply_bucket_delta(
  p_user_id uuid,
  p_bucket text,
  p_currency text,
  p_available_delta numeric,
  p_held_delta numeric,
  p_entry_type text,
  p_reference_type text,
  p_reference_id uuid,
  p_idempotency_key text,
  p_created_by uuid
)
returns boolean
language plpgsql
security definer
set search_path = pg_catalog, public, private, extensions
as $$
declare
  v_inserted integer := 0;
  v_avail numeric(18,2);
  v_held numeric(18,2);
  v_avail_delta numeric(18,2) := round(coalesce(p_available_delta, 0), 2);
  v_held_delta numeric(18,2) := round(coalesce(p_held_delta, 0), 2);
begin
  if p_user_id is null or p_idempotency_key is null or p_bucket is null then
    raise exception using errcode = '22023', message = '원장 정보가 부족합니다.';
  end if;

  if p_currency not in ('KRW', 'USDT') then
    raise exception using errcode = '22023', message = '지원하지 않는 통화입니다.';
  end if;

  if p_bucket not in ('support_grant', 'work_balance', 'task_reward', 'referral_reward', 'available', 'held') then
    raise exception using errcode = '22023', message = '지갑 칸이 올바르지 않습니다.';
  end if;

  if v_avail_delta = 0 and v_held_delta = 0 then
    return true;
  end if;

  perform pg_advisory_xact_lock(
    hashtextextended('putduk-wallet:' || p_user_id::text || ':' || p_currency, 0)
  );

  perform private.putduk_ensure_wallets(p_user_id, p_currency);

  insert into private.ledger_entries (
    public_id, user_id, bucket, currency, amount, entry_type,
    reference_type, reference_id, idempotency_key, created_by
  )
  values (
    'PDK-LEDGER-' || upper(substr(replace(gen_random_uuid()::text, '-', ''), 1, 16)),
    p_user_id,
    p_bucket,
    p_currency,
    case when v_avail_delta <> 0 then v_avail_delta else v_held_delta end,
    p_entry_type,
    p_reference_type,
    p_reference_id,
    p_idempotency_key,
    p_created_by
  )
  on conflict (idempotency_key) do nothing;

  get diagnostics v_inserted = row_count;
  if v_inserted <> 1 then
    return false;
  end if;

  select available_amount, held_amount
    into v_avail, v_held
  from public.wallet_accounts
  where user_id = p_user_id and bucket = p_bucket and currency = p_currency
  for update;

  v_avail := coalesce(v_avail, 0) + v_avail_delta;
  v_held := coalesce(v_held, 0) + v_held_delta;

  if v_avail < 0 or v_held < 0 then
    raise exception using errcode = '23514', message = '잔액이 부족합니다.';
  end if;

  update public.wallet_accounts
  set available_amount = v_avail,
      held_amount = v_held,
      updated_at = now()
  where user_id = p_user_id
    and bucket = p_bucket
    and currency = p_currency;

  return true;
end;
$$;

revoke all on function private.putduk_apply_bucket_delta(uuid, text, text, numeric, numeric, text, text, uuid, text, uuid)
  from public, anon, authenticated;
grant execute on function private.putduk_apply_bucket_delta(uuid, text, text, numeric, numeric, text, text, uuid, text, uuid)
  to service_role;

-- ---------------------------------------------------------------------------
-- 3. 잠금 · 원금 반환 · 수당
-- ---------------------------------------------------------------------------

create or replace function private.putduk_lock_stake(
  p_user_id uuid,
  p_task_run_id uuid,
  p_node_id uuid,
  p_created_by uuid
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public, private, extensions
as $$
declare
  v_node public.nodes%rowtype;
  v_grant public.support_grants%rowtype;
  v_is_trial boolean := false;
  v_stake numeric(18,2) := 0;
  v_stipend numeric(18,2) := 0;
  v_bucket text;
  v_grant_avail numeric(18,2) := 0;
  v_work_avail numeric(18,2) := 0;
  v_already boolean := false;
begin
  if p_user_id is null or p_task_run_id is null or p_node_id is null then
    raise exception using errcode = '22023', message = '잠금 정보가 부족합니다.';
  end if;

  perform pg_advisory_xact_lock(
    hashtextextended('putduk-wallet:' || p_user_id::text || ':KRW', 0)
  );

  select n.* into v_node from public.nodes n where n.id = p_node_id;
  if not found then
    raise exception using errcode = 'P0002', message = '업무 카드를 찾을 수 없습니다.';
  end if;

  v_is_trial := coalesce(v_node.is_trial, false) or v_node.tier_band = '체험';
  v_stipend := round(coalesce(nullif(v_node.stipend_krw, 0), v_node.reward_min, 0), 2);

  perform private.putduk_ensure_wallets(p_user_id, 'KRW');

  if exists (
    select 1 from private.ledger_entries
    where idempotency_key = 'stake-lock:' || p_task_run_id::text
       or idempotency_key = 'support-grant-consumed:' || p_task_run_id::text
  ) then
    v_already := true;
  end if;

  if v_is_trial then
    if exists (
      select 1 from public.profiles p
      where p.id = p_user_id and p.trial_consumed_at is not null
    ) and not v_already then
      raise exception using errcode = '23514', message = '체험 근무는 한 번만 할 수 있어요.';
    end if;

    select * into v_grant
    from public.support_grants g
    where g.user_id = p_user_id
      and g.status in ('available', 'held')
    order by g.created_at
    limit 1
    for update;

    select available_amount into v_grant_avail
    from public.wallet_accounts
    where user_id = p_user_id and bucket = 'support_grant' and currency = 'KRW'
    for update;

    v_grant_avail := coalesce(v_grant_avail, 0);
    if v_grant_avail <= 0 then
      raise exception using errcode = '23514', message = '체험 지원금이 없어요.';
    end if;

    v_stake := v_grant_avail;
    v_bucket := 'support_grant';

    if not v_already then
      perform private.putduk_apply_bucket_delta(
        p_user_id, 'support_grant', 'KRW', -v_stake, 0,
        'support_grant_consumed', 'task_run', p_task_run_id,
        'support-grant-consumed:' || p_task_run_id::text,
        p_created_by
      );

      if v_grant.id is not null then
        update public.support_grants
        set status = 'used'
        where id = v_grant.id
          and status in ('available', 'held');
      end if;

      update public.profiles
      set trial_consumed_at = coalesce(trial_consumed_at, now()),
          updated_at = now()
      where id = p_user_id;
    end if;
  else
    v_stake := round(coalesce(v_node.stake_krw, 0), 2);
    if v_stake <= 0 then
      raise exception using errcode = '22023', message = '잠금 금액이 없는 카드입니다.';
    end if;
    v_bucket := 'work_balance';

    select available_amount into v_work_avail
    from public.wallet_accounts
    where user_id = p_user_id and bucket = 'work_balance' and currency = 'KRW'
    for update;

    if coalesce(v_work_avail, 0) < v_stake and not v_already then
      raise exception using errcode = '23514', message = '근무 잔액이 잠금 금액보다 부족해요.';
    end if;

    if not v_already then
      perform private.putduk_apply_bucket_delta(
        p_user_id, 'work_balance', 'KRW', -v_stake, v_stake,
        'stake_locked', 'task_run', p_task_run_id,
        'stake-lock:' || p_task_run_id::text,
        p_created_by
      );
    end if;
  end if;

  return jsonb_build_object(
    'locked_stake_krw', v_stake,
    'stipend_krw', v_stipend,
    'is_trial', v_is_trial,
    'stake_bucket', v_bucket,
    'applied', not v_already
  );
end;
$$;

revoke all on function private.putduk_lock_stake(uuid, uuid, uuid, uuid)
  from public, anon, authenticated;
grant execute on function private.putduk_lock_stake(uuid, uuid, uuid, uuid) to service_role;

create or replace function private.putduk_release_stake(
  p_task_run_id uuid,
  p_created_by uuid
)
returns boolean
language plpgsql
security definer
set search_path = pg_catalog, public, private, extensions
as $$
declare
  v_run public.task_runs%rowtype;
begin
  select * into v_run from public.task_runs where id = p_task_run_id for update;
  if not found then
    raise exception using errcode = 'P0002', message = '업무를 찾을 수 없습니다.';
  end if;

  if v_run.stake_released then
    return false;
  end if;

  if coalesce(v_run.is_trial, false) or v_run.stake_bucket = 'support_grant' then
    update public.task_runs
    set stake_released = true, updated_at = now()
    where id = v_run.id;
    return true;
  end if;

  if coalesce(v_run.locked_stake_krw, 0) > 0 and v_run.stake_bucket = 'work_balance' then
    perform private.putduk_apply_bucket_delta(
      v_run.user_id, 'work_balance', 'KRW',
      v_run.locked_stake_krw, -v_run.locked_stake_krw,
      'stake_released', 'task_run', v_run.id,
      'stake-release:' || v_run.id::text,
      p_created_by
    );
  end if;

  update public.task_runs
  set stake_released = true, updated_at = now()
  where id = v_run.id;

  return true;
end;
$$;

revoke all on function private.putduk_release_stake(uuid, uuid)
  from public, anon, authenticated;
grant execute on function private.putduk_release_stake(uuid, uuid) to service_role;

create or replace function private.putduk_grant_stipend(
  p_task_run_id uuid,
  p_created_by uuid
)
returns boolean
language plpgsql
security definer
set search_path = pg_catalog, public, private, extensions
as $$
declare
  v_run public.task_runs%rowtype;
  v_amount numeric(18,2);
begin
  select * into v_run from public.task_runs where id = p_task_run_id for update;
  if not found then
    raise exception using errcode = 'P0002', message = '업무를 찾을 수 없습니다.';
  end if;

  v_amount := round(coalesce(nullif(v_run.stipend_krw, 0), v_run.reward_amount, 0), 2);
  if v_amount <= 0 then
    return true;
  end if;

  return private.putduk_apply_bucket_delta(
    v_run.user_id, 'available', 'KRW', v_amount, 0,
    'stipend_posted', 'task_run', v_run.id,
    'stipend-posted:' || v_run.id::text,
    p_created_by
  );
end;
$$;

revoke all on function private.putduk_grant_stipend(uuid, uuid)
  from public, anon, authenticated;
grant execute on function private.putduk_grant_stipend(uuid, uuid) to service_role;

create or replace function private.putduk_apply_principal_penalties(p_user_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public, private
as $$
declare
  v_tier text;
  v_next text;
  v_work numeric(18,2) := 0;
  v_close boolean := false;
begin
  select member_tier into v_tier from public.profiles where id = p_user_id for update;
  if not found then
    raise exception using errcode = 'P0002', message = '회원 정보를 찾을 수 없습니다.';
  end if;

  v_next := case v_tier
    when '전담' then '선임'
    when '선임' then '주임'
    when '주임' then '라인'
    when '라인' then '체험'
    when '체험' then '체험'
    when '일반 파트너' then '라인'
    else '라인'
  end;

  select coalesce(available_amount, 0) + coalesce(held_amount, 0)
    into v_work
  from public.wallet_accounts
  where user_id = p_user_id and bucket = 'work_balance' and currency = 'KRW';

  v_close := coalesce(v_work, 0) <= 0;

  update public.profiles
  set member_tier = v_next,
      line_open = case when v_close then false else line_open end,
      line_closed_at = case when v_close then now() else line_closed_at end,
      priority_pick = false,
      dedicated_queue = false,
      weekly_volume_boost = false,
      high_value_notice = false,
      principal_withdraw_count = principal_withdraw_count + 1,
      updated_at = now()
  where id = p_user_id;

  return jsonb_build_object(
    'previous_tier', v_tier,
    'new_tier', v_next,
    'line_closed', v_close
  );
end;
$$;

revoke all on function private.putduk_apply_principal_penalties(uuid)
  from public, anon, authenticated;
grant execute on function private.putduk_apply_principal_penalties(uuid) to service_role;

create or replace function public.putduk_member_lock_stake(
  p_user_id uuid,
  p_task_run_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public, private
as $$
declare
  v_run public.task_runs%rowtype;
  v_lock jsonb;
begin
  select * into v_run from public.task_runs where id = p_task_run_id and user_id = p_user_id;
  if not found then
    raise exception using errcode = 'P0002', message = '본인 업무만 잠글 수 있습니다.';
  end if;

  v_lock := private.putduk_lock_stake(p_user_id, p_task_run_id, v_run.node_id, p_user_id);

  update public.task_runs
  set locked_stake_krw = coalesce((v_lock ->> 'locked_stake_krw')::numeric, locked_stake_krw),
      stipend_krw = coalesce((v_lock ->> 'stipend_krw')::numeric, stipend_krw),
      stake_bucket = coalesce(v_lock ->> 'stake_bucket', stake_bucket),
      is_trial = coalesce((v_lock ->> 'is_trial')::boolean, is_trial),
      reward_amount = coalesce((v_lock ->> 'stipend_krw')::numeric, reward_amount),
      updated_at = now()
  where id = p_task_run_id;

  return v_lock;
end;
$$;

revoke all on function public.putduk_member_lock_stake(uuid, uuid) from public, anon, authenticated;
grant execute on function public.putduk_member_lock_stake(uuid, uuid) to service_role;

-- ---------------------------------------------------------------------------
-- 4. 가입 지원금 1회 원장
-- ---------------------------------------------------------------------------

create or replace function private.handle_new_putduk_user()
returns trigger
language plpgsql
security definer
set search_path = public, private, extensions
as $$
declare
  v_public_id text;
  v_referral_code text;
  v_referrer_id uuid;
  v_campaign_id uuid;
  v_support_amount numeric(18,2) := 0;
  v_birth_date date;
  v_metadata jsonb := coalesce(new.raw_user_meta_data, '{}'::jsonb);
  v_suffix text;
  v_grant_id uuid;
begin
  v_suffix := upper(substr(replace(new.id::text, '-', ''), 1, 6));
  v_public_id := 'PDK-' || to_char(coalesce(new.created_at, now()), 'YY') || '-' || v_suffix || '-' || lpad((floor(random() * 100000))::int::text, 5, '0');
  while exists (select 1 from public.profiles where public_id = v_public_id) loop
    v_public_id := 'PDK-' || to_char(coalesce(new.created_at, now()), 'YY') || '-' || v_suffix || '-' || lpad((floor(random() * 100000))::int::text, 5, '0');
  end loop;

  v_referral_code := 'PDK' || upper(substr(replace(new.id::text, '-', ''), 1, 9));
  begin
    v_birth_date := nullif(v_metadata ->> 'birth_date', '')::date;
  exception when others then
    v_birth_date := null;
  end;

  insert into public.profiles (id, public_id, display_name, status, referral_code)
  values (
    new.id,
    v_public_id,
    coalesce(nullif(v_metadata ->> 'display_name', ''), '퍼뜩 회원'),
    'pending',
    v_referral_code
  )
  on conflict (id) do nothing;

  insert into private.profile_private (
    user_id, legal_name, birth_date, phone_e164, email_snapshot,
    terms_version, privacy_version, marketing_opt_in
  )
  values (
    new.id,
    nullif(v_metadata ->> 'legal_name', ''),
    v_birth_date,
    nullif(v_metadata ->> 'phone_e164', ''),
    new.email,
    nullif(v_metadata ->> 'terms_version', ''),
    nullif(v_metadata ->> 'privacy_version', ''),
    coalesce((v_metadata ->> 'marketing_opt_in')::boolean, false)
  )
  on conflict (user_id) do nothing;

  perform private.putduk_ensure_wallets(new.id, 'KRW');

  select id, amount
    into v_campaign_id, v_support_amount
  from public.support_grant_campaigns
  where enabled = true
    and trigger_type = 'signup'
    and starts_at <= now()
    and (ends_at is null or ends_at > now())
  order by starts_at desc
  limit 1;

  if v_campaign_id is not null then
    insert into public.support_grants (campaign_id, user_id, amount, status, expires_at)
    values (
      v_campaign_id,
      new.id,
      coalesce(v_support_amount, 10000),
      'available',
      (select case when expires_in_days is null then null else now() + make_interval(days => expires_in_days) end
       from public.support_grant_campaigns where id = v_campaign_id)
    )
    on conflict (campaign_id, user_id) do nothing
    returning id into v_grant_id;

    if v_grant_id is not null then
      perform private.putduk_apply_bucket_delta(
        new.id, 'support_grant', 'KRW', coalesce(v_support_amount, 10000), 0,
        'support_grant_posted', 'support_grant', v_grant_id,
        'signup-grant:' || new.id::text || ':' || v_campaign_id::text,
        new.id
      );
    end if;
  end if;

  select id into v_referrer_id
  from public.profiles
  where referral_code = upper(nullif(v_metadata ->> 'referral_code', ''))
    and id <> new.id
  limit 1;

  if v_referrer_id is not null then
    insert into public.referral_relations (referrer_id, invitee_id, status)
    values (v_referrer_id, new.id, 'joined')
    on conflict (invitee_id) do nothing;
  end if;

  return new;
end;
$$;

-- ---------------------------------------------------------------------------
-- 5. 카드 메타 동기화 · 시작/제출 가드
-- ---------------------------------------------------------------------------

create or replace function private.sync_node_catalog_metadata()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, public, private
as $$
begin
  if new.catalog_status = 'published' then
    new.published_at := coalesce(new.published_at, now());
    new.published_by := coalesce(new.published_by, auth.uid());
  else
    new.published_at := null;
    new.published_by := null;
  end if;

  if new.tier_band = '초고액' then
    new.requires_assign := true;
  end if;
  if new.tier_band = '체험' then
    new.is_trial := true;
  end if;

  if coalesce(new.stipend_krw, 0) > 0 then
    new.reward_min := new.stipend_krw;
    new.reward_max := new.stipend_krw;
  end if;

  if coalesce(new.daily_cap, 0) > 0 then
    new.daily_capacity := new.daily_cap;
  elsif coalesce(new.daily_capacity, 0) > 0 and coalesce(new.daily_cap, 0) = 0 then
    new.daily_cap := new.daily_capacity;
  end if;

  if new.partner_slug is null or btrim(new.partner_slug) = '' then
    select slug into new.partner_slug
    from public.partner_brands
    where id = new.partner_brand_id;
  end if;

  new.updated_at := now();
  return new;
end;
$$;

drop trigger if exists sync_node_catalog_metadata on public.nodes;
create trigger sync_node_catalog_metadata
before insert or update on public.nodes
for each row
execute function private.sync_node_catalog_metadata();

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

  insert into public.task_events (task_run_id, user_id, event_type, event_payload)
  values (
    new.id, new.user_id, 'started',
    jsonb_build_object(
      'node_id', v_node.id,
      'node_public_id', v_node.public_id,
      'motion_profile', v_node.motion_profile,
      'motion_version', v_node.motion_version,
      'expected_seconds', v_seconds,
      'assignment_id', v_assignment.id,
      'locked_stake_krw', new.locked_stake_krw,
      'stipend_krw', new.stipend_krw,
      'is_trial', new.is_trial
    )
  );

  return new;
end;
$$;

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
    raise exception using errcode = '42501', message = '본인 업무만 제출할 수 있습니다.';
  end if;

  if old.status not in ('in_progress', 'checkpointed') then
    raise exception using errcode = '23514', message = '현재 상태에서는 업무를 제출할 수 없습니다.';
  end if;

  if new.status <> 'submitted' then
    raise exception using errcode = '23514', message = '업무는 제출 상태로만 변경할 수 있습니다.';
  end if;

  if v_now < old.expected_completed_at then
    raise exception using errcode = '23514', message = '예상 처리 시간이 지나면 제출할 수 있습니다.';
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
  new.locked_stake_krw := old.locked_stake_krw;
  new.stipend_krw := old.stipend_krw;
  new.stake_bucket := old.stake_bucket;
  new.is_trial := old.is_trial;
  new.stake_released := old.stake_released;
  new.reward_status := 'pending';
  new.created_at := old.created_at;
  new.updated_at := v_now;

  insert into public.task_events (task_run_id, user_id, event_type, event_payload)
  values (
    old.id, old.user_id, 'submitted',
    jsonb_build_object('completed_at', v_now, 'reward_status', 'pending')
  );

  return new;
end;
$$;

-- ---------------------------------------------------------------------------
-- 6. 검수: 승인=원금 근무잔액+수당 출금가능, 반려=원금만
-- ---------------------------------------------------------------------------

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

  if not exists (
    select 1 from private.admin_roles ar
    where ar.user_id = p_reviewer_id
      and ar.role in ('super_admin', 'work_review')
  ) then
    raise exception using errcode = '42501', message = '검수 권한이 있는 운영자만 처리할 수 있습니다.';
  end if;

  select r.* into v_run from public.task_runs r where r.id = p_task_run_id for update;
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
      v_run.id, v_run.user_id, 'review_approved',
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
      v_run.id, v_run.user_id, 'review_rework',
      jsonb_build_object('reviewer_id', p_reviewer_id, 'score', p_score, 'reason', v_reason, 'status', 'rework')
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
      v_run.id, v_run.user_id, 'review_rejected',
      jsonb_build_object('reviewer_id', p_reviewer_id, 'score', p_score, 'reason', v_reason, 'status', 'rejected')
    );
  end if;

  insert into private.review_decisions (task_run_id, reviewer_id, decision, reason, score)
  values (v_run.id, p_reviewer_id, v_decision, v_reason, p_score);

  return v_after;
end;
$$;

-- ---------------------------------------------------------------------------
-- 7. 입금 → 근무 잔액
-- ---------------------------------------------------------------------------

create or replace function public.putduk_admin_review_deposit(
  p_admin_id uuid,
  p_deposit_id uuid,
  p_decision text,
  p_reason text default null
)
returns public.deposit_requests
language plpgsql
security definer
set search_path = pg_catalog, public, private, extensions
as $$
declare
  v_row public.deposit_requests%rowtype;
  v_after public.deposit_requests%rowtype;
  v_decision text := lower(trim(coalesce(p_decision, '')));
  v_reason text := nullif(left(trim(coalesce(p_reason, '')), 500), '');
  v_now timestamptz := now();
begin
  perform private.putduk_assert_admin(p_admin_id, array['super_admin', 'finance']);

  if v_decision not in ('approved', 'rejected') then
    raise exception using errcode = '22023', message = '입금 처리 결과를 선택해 주세요.';
  end if;

  if v_decision = 'rejected' and v_reason is null then
    raise exception using errcode = '22023', message = '반려 사유를 입력해 주세요.';
  end if;

  select * into v_row from public.deposit_requests where id = p_deposit_id for update;
  if not found then
    raise exception using errcode = 'P0002', message = '입금 요청을 찾을 수 없습니다.';
  end if;

  if v_row.status = 'approved' then
    return v_row;
  end if;

  if v_row.status not in ('submitted', 'checking') then
    raise exception using errcode = '23514', message = '이미 처리된 입금 요청입니다.';
  end if;

  if v_decision = 'approved' then
    update public.deposit_requests
    set status = 'approved', reviewed_by = p_admin_id, reviewed_at = v_now,
        rejection_reason = null, updated_at = v_now
    where id = v_row.id
    returning * into v_after;

    perform private.putduk_apply_bucket_delta(
      v_row.user_id, 'work_balance', v_row.currency, v_row.amount, 0,
      'deposit_posted', 'deposit_request', v_row.id,
      'deposit-posted:' || v_row.id::text,
      p_admin_id
    );

    update public.profiles
    set line_open = true, updated_at = v_now
    where id = v_row.user_id;

    update public.referral_relations
    set status = case when status in ('joined', 'verified') then 'funded' else status end,
        updated_at = v_now
    where invitee_id = v_row.user_id
      and status in ('joined', 'verified');

    insert into public.notifications (user_id, title, body, notification_type)
    values (
      v_row.user_id,
      '✅ 입금이 확인됐어요',
      to_char(v_row.amount, 'FM999G999G999G990D00') ||
        case when v_row.currency = 'USDT' then ' USDT' else '원' end ||
        '이 근무 잔액에 반영됐어요.',
      'finance'
    );
  else
    update public.deposit_requests
    set status = 'rejected', reviewed_by = p_admin_id, reviewed_at = v_now,
        rejection_reason = v_reason, updated_at = v_now
    where id = v_row.id
    returning * into v_after;

    insert into public.notifications (user_id, title, body, notification_type)
    values (
      v_row.user_id,
      '입금 확인이 반려됐어요',
      '운영자 안내: ' || v_reason,
      'finance'
    );
  end if;

  return v_after;
end;
$$;

-- ---------------------------------------------------------------------------
-- 8. 출금 신청(보류) · 완료(즉시, 대기 일수 없음)
-- ---------------------------------------------------------------------------

create or replace function public.putduk_member_withdraw_request(
  p_user_id uuid,
  p_currency text,
  p_amount numeric,
  p_pin text,
  p_destination_type text,
  p_include_principal boolean default false,
  p_bank_name text default null,
  p_account_holder text default null,
  p_account_number text default null,
  p_usdt_network text default null,
  p_usdt_address text default null
)
returns public.withdrawal_requests
language plpgsql
security definer
set search_path = pg_catalog, public, private, extensions
as $$
declare
  v_row public.withdrawal_requests%rowtype;
  v_pin private.withdrawal_pins%rowtype;
  v_currency text := upper(trim(coalesce(p_currency, 'KRW')));
  v_type text := lower(trim(coalesce(p_destination_type, '')));
  v_now timestamptz := now();
  v_stipend_avail numeric(18,2) := 0;
  v_principal_avail numeric(18,2) := 0;
  v_stipend numeric(18,2) := 0;
  v_principal numeric(18,2) := 0;
  v_need numeric(18,2);
  v_masked text;
  v_label text;
  v_dest_id uuid;
begin
  if p_user_id is null then
    raise exception using errcode = '22023', message = '회원 정보가 필요합니다.';
  end if;

  if not exists (
    select 1 from public.profiles p
    where p.id = p_user_id and p.status = 'active' and p.kyc_status = 'approved'
  ) then
    raise exception using errcode = '42501', message = '출금 전 본인확인이 필요해요.';
  end if;

  if v_currency not in ('KRW', 'USDT') then
    raise exception using errcode = '22023', message = '출금 통화를 확인해 주세요.';
  end if;

  if p_amount is null or p_amount < 1000 or p_amount > 100000000 then
    raise exception using errcode = '22023', message = '출금 금액은 1,000~100,000,000 범위여야 합니다.';
  end if;

  if v_type not in ('bank', 'usdt') then
    raise exception using errcode = '22023', message = '출금 방법을 선택해 주세요.';
  end if;

  if (v_currency = 'KRW' and v_type <> 'bank') or (v_currency = 'USDT' and v_type <> 'usdt') then
    raise exception using errcode = '22023', message = '통화와 출금 방법이 맞지 않습니다.';
  end if;

  if exists (
    select 1 from public.withdrawal_requests w
    where w.user_id = p_user_id
      and w.status in ('submitted', 'checking', 'approved')
  ) then
    raise exception using errcode = '23505', message = '이미 처리 중인 출금 요청이 있어요.';
  end if;

  select * into v_pin from private.withdrawal_pins where user_id = p_user_id for update;
  if not found then
    raise exception using errcode = '42501', message = '출금 비밀번호를 먼저 설정해 주세요.';
  end if;

  if v_pin.locked_until is not null and v_pin.locked_until > v_now then
    raise exception using errcode = '42501', message = '출금 비밀번호가 잠겨 있습니다. 잠시 후 다시 시도해 주세요.';
  end if;

  if p_pin is null or p_pin !~ '^[0-9]{6}$' or v_pin.pin_hash <> crypt(p_pin, v_pin.pin_hash) then
    update private.withdrawal_pins
    set failed_attempts = failed_attempts + 1,
        locked_until = case when failed_attempts + 1 >= 5 then v_now + interval '15 minutes' else locked_until end,
        updated_at = v_now
    where user_id = p_user_id;
    raise exception using errcode = '42501', message = '출금 비밀번호가 올바르지 않습니다.';
  end if;

  update private.withdrawal_pins
  set failed_attempts = 0, locked_until = null, updated_at = v_now
  where user_id = p_user_id;

  perform pg_advisory_xact_lock(
    hashtextextended('putduk-wallet:' || p_user_id::text || ':' || v_currency, 0)
  );
  perform private.putduk_ensure_wallets(p_user_id, v_currency);

  select available_amount into v_stipend_avail
  from public.wallet_accounts
  where user_id = p_user_id and bucket = 'available' and currency = v_currency
  for update;

  select available_amount into v_principal_avail
  from public.wallet_accounts
  where user_id = p_user_id and bucket = 'work_balance' and currency = v_currency
  for update;

  v_stipend_avail := coalesce(v_stipend_avail, 0);
  v_principal_avail := coalesce(v_principal_avail, 0);
  v_need := round(p_amount, 2);

  if coalesce(p_include_principal, false) then
    v_stipend := least(v_need, v_stipend_avail);
    v_principal := v_need - v_stipend;
    if v_principal > v_principal_avail then
      raise exception using errcode = '23514',
        message = '출금 가능·근무 잔액이 부족합니다. 잠긴 원금은 출금할 수 없어요.';
    end if;
  else
    v_stipend := v_need;
    v_principal := 0;
    if v_stipend > v_stipend_avail then
      raise exception using errcode = '23514', message = '출금 가능 잔액이 부족합니다.';
    end if;
  end if;

  if v_type = 'bank' then
    if nullif(trim(coalesce(p_bank_name, '')), '') is null
       or nullif(trim(coalesce(p_account_holder, '')), '') is null
       or nullif(trim(coalesce(p_account_number, '')), '') is null then
      raise exception using errcode = '22023', message = '은행명·예금주·계좌번호를 입력해 주세요.';
    end if;
    v_label := left(trim(p_bank_name) || ' ' || trim(p_account_holder), 80);
    v_masked := left(trim(p_bank_name), 20) || ' ****' || right(regexp_replace(trim(p_account_number), '\s', '', 'g'), 4);
  else
    if nullif(trim(coalesce(p_usdt_network, '')), '') is null
       or nullif(trim(coalesce(p_usdt_address, '')), '') is null then
      raise exception using errcode = '22023', message = 'USDT 네트워크와 주소를 입력해 주세요.';
    end if;
    v_label := left('USDT ' || trim(p_usdt_network), 80);
    v_masked := left(trim(p_usdt_address), 6) || '…' || right(trim(p_usdt_address), 4);
  end if;

  insert into private.member_payout_destinations (
    user_id, destination_type, bank_name, account_holder, account_number,
    usdt_network, usdt_address, masked_value
  )
  values (
    p_user_id, v_type,
    nullif(trim(coalesce(p_bank_name, '')), ''),
    nullif(trim(coalesce(p_account_holder, '')), ''),
    nullif(trim(coalesce(p_account_number, '')), ''),
    nullif(trim(coalesce(p_usdt_network, '')), ''),
    nullif(trim(coalesce(p_usdt_address, '')), ''),
    v_masked
  )
  returning id into v_dest_id;

  insert into public.withdrawal_requests (
    public_id, user_id, currency, amount, destination_type, status,
    destination_label, destination_masked,
    include_principal, principal_included, note, stipend_amount, principal_amount
  )
  values (
    'PDK-WDR-' || to_char(v_now, 'YYMMDD') || '-' || upper(substr(replace(gen_random_uuid()::text, '-', ''), 1, 8)),
    p_user_id, v_currency, v_need, v_type, 'submitted',
    v_label, v_masked,
    coalesce(p_include_principal, false),
    coalesce(p_include_principal, false),
    case when coalesce(p_include_principal, false) then '원금포함' else '수당만' end,
    v_stipend, v_principal
  )
  returning * into v_row;

  if v_stipend > 0 then
    perform private.putduk_apply_bucket_delta(
      p_user_id, 'available', v_currency, -v_stipend, v_stipend,
      'withdrawal_hold', 'withdrawal_request', v_row.id,
      'withdrawal-hold-stipend:' || v_row.id::text,
      p_user_id
    );
  end if;

  if v_principal > 0 then
    perform private.putduk_apply_bucket_delta(
      p_user_id, 'work_balance', v_currency, -v_principal, v_principal,
      'withdrawal_hold', 'withdrawal_request', v_row.id,
      'withdrawal-hold-principal:' || v_row.id::text,
      p_user_id
    );
  end if;

  insert into public.notifications (user_id, title, body, notification_type)
  values (
    p_user_id,
    '💸 출금 요청을 접수했어요',
    to_char(v_need, 'FM999G999G999G990D00') ||
      case when v_currency = 'USDT' then ' USDT' else '원' end ||
      case when coalesce(p_include_principal, false)
        then ' · 원금 포함. 운영자가 바로 처리합니다.'
        else ' · 수당만. 운영자가 확인합니다.'
      end,
    'finance'
  );

  return v_row;
end;
$$;

revoke all on function public.putduk_member_withdraw_request(uuid, text, numeric, text, text, boolean, text, text, text, text, text)
  from public, anon, authenticated;
grant execute on function public.putduk_member_withdraw_request(uuid, text, numeric, text, text, boolean, text, text, text, text, text)
  to service_role;

create or replace function public.putduk_member_submit_withdrawal(
  p_user_id uuid,
  p_currency text,
  p_amount numeric,
  p_pin text,
  p_destination_type text,
  p_bank_name text default null,
  p_account_holder text default null,
  p_account_number text default null,
  p_usdt_network text default null,
  p_usdt_address text default null
)
returns public.withdrawal_requests
language plpgsql
security definer
set search_path = pg_catalog, public, private, extensions
as $$
begin
  return public.putduk_member_withdraw_request(
    p_user_id, p_currency, p_amount, p_pin, p_destination_type,
    false, p_bank_name, p_account_holder, p_account_number, p_usdt_network, p_usdt_address
  );
end;
$$;

create or replace function public.putduk_admin_withdraw_complete(
  p_admin_id uuid,
  p_withdrawal_id uuid,
  p_transaction_reference text default null,
  p_reason text default null
)
returns public.withdrawal_requests
language plpgsql
security definer
set search_path = pg_catalog, public, private, extensions
as $$
declare
  v_row public.withdrawal_requests%rowtype;
  v_after public.withdrawal_requests%rowtype;
  v_ref text := nullif(left(trim(coalesce(p_transaction_reference, '')), 120), '');
  v_now timestamptz := now();
  v_stipend numeric(18,2);
  v_principal numeric(18,2);
  v_penalty jsonb := '{}'::jsonb;
  v_legacy_held numeric(18,2) := 0;
  v_avail_held numeric(18,2) := 0;
begin
  perform private.putduk_assert_admin(p_admin_id, array['super_admin', 'finance']);

  select * into v_row from public.withdrawal_requests where id = p_withdrawal_id for update;
  if not found then
    raise exception using errcode = 'P0002', message = '출금 요청을 찾을 수 없습니다.';
  end if;

  if v_row.status in ('completed', 'sent') then
    return v_row;
  end if;

  if v_row.status not in ('submitted', 'checking', 'approved') then
    raise exception using errcode = '23514', message = '완료할 수 없는 출금 상태입니다.';
  end if;

  v_stipend := round(coalesce(nullif(v_row.stipend_amount, 0), case when (v_row.include_principal or v_row.principal_included) then 0 else v_row.amount end), 2);
  v_principal := round(coalesce(v_row.principal_amount, 0), 2);
  if (v_row.include_principal or v_row.principal_included) and v_principal = 0 and v_stipend = 0 then
    v_principal := v_row.amount;
  end if;
  if (not v_row.include_principal) and v_stipend = 0 then
    v_stipend := v_row.amount;
  end if;

  perform pg_advisory_xact_lock(
    hashtextextended('putduk-wallet:' || v_row.user_id::text || ':' || v_row.currency, 0)
  );
  perform private.putduk_ensure_wallets(v_row.user_id, v_row.currency);

  if v_stipend > 0 then
    select held_amount into v_avail_held
    from public.wallet_accounts
    where user_id = v_row.user_id and bucket = 'available' and currency = v_row.currency
    for update;
    select held_amount into v_legacy_held
    from public.wallet_accounts
    where user_id = v_row.user_id and bucket = 'held' and currency = v_row.currency
    for update;

    if coalesce(v_avail_held, 0) >= v_stipend then
      perform private.putduk_apply_bucket_delta(
        v_row.user_id, 'available', v_row.currency, 0, -v_stipend,
        'withdrawal_completed', 'withdrawal_request', v_row.id,
        'withdrawal-complete-stipend:' || v_row.id::text,
        p_admin_id
      );
    elsif coalesce(v_legacy_held, 0) >= v_stipend then
      perform private.putduk_apply_bucket_delta(
        v_row.user_id, 'held', v_row.currency, 0, -v_stipend,
        'withdrawal_completed', 'withdrawal_request', v_row.id,
        'withdrawal-complete-stipend:' || v_row.id::text,
        p_admin_id
      );
    else
      raise exception using errcode = '23514', message = '출금 보류 금액을 찾을 수 없습니다.';
    end if;
  end if;

  if v_principal > 0 then
    perform private.putduk_apply_bucket_delta(
      v_row.user_id, 'work_balance', v_row.currency, 0, -v_principal,
      'withdrawal_completed', 'withdrawal_request', v_row.id,
      'withdrawal-complete-principal:' || v_row.id::text,
      p_admin_id
    );
  end if;

  if v_principal > 0 then
    v_penalty := private.putduk_apply_principal_penalties(v_row.user_id);
  end if;

  update public.withdrawal_requests
  set status = 'completed',
      transaction_reference = coalesce(v_ref, transaction_reference),
      reviewed_by = p_admin_id,
      reviewed_at = v_now,
      completed_at = v_now,
      completed_by = p_admin_id,
      demotion_applied = v_principal > 0,
      previous_member_tier = nullif(v_penalty ->> 'previous_tier', ''),
      new_member_tier = nullif(v_penalty ->> 'new_tier', ''),
      line_closed = coalesce((v_penalty ->> 'line_closed')::boolean, false),
      stipend_amount = v_stipend,
      principal_amount = v_principal,
      include_principal = coalesce(v_row.include_principal, v_row.principal_included, v_principal > 0),
      principal_included = coalesce(v_row.include_principal, v_row.principal_included, v_principal > 0),
      updated_at = v_now
  where id = v_row.id
  returning * into v_after;

  insert into public.notifications (user_id, title, body, notification_type)
  values (
    v_row.user_id,
    '✅ 출금이 완료됐어요',
    to_char(v_row.amount, 'FM999G999G999G990D00') ||
      case when v_row.currency = 'USDT' then ' USDT' else '원' end ||
      ' 이체가 끝났어요.' ||
      case
        when v_principal > 0 then
          ' 🪪 사원증 등급이 ' || coalesce(v_after.new_member_tier, '라인') || '으로 내려갔어요.' ||
          case when v_after.line_closed then ' 근무 잔액이 0원이라 해당 라인은 닫혔어요. 같은 칸은 다시 입금해야 열려요.' else '' end
        else ''
      end,
    'finance'
  );

  return v_after;
end;
$$;

revoke all on function public.putduk_admin_withdraw_complete(uuid, uuid, text, text)
  from public, anon, authenticated;
grant execute on function public.putduk_admin_withdraw_complete(uuid, uuid, text, text)
  to service_role;

create or replace function public.putduk_admin_review_withdrawal(
  p_admin_id uuid,
  p_withdrawal_id uuid,
  p_decision text,
  p_reason text default null,
  p_transaction_reference text default null
)
returns public.withdrawal_requests
language plpgsql
security definer
set search_path = pg_catalog, public, private, extensions
as $$
declare
  v_row public.withdrawal_requests%rowtype;
  v_after public.withdrawal_requests%rowtype;
  v_decision text := lower(trim(coalesce(p_decision, '')));
  v_reason text := nullif(left(trim(coalesce(p_reason, '')), 500), '');
  v_now timestamptz := now();
  v_stipend numeric(18,2);
  v_principal numeric(18,2);
begin
  perform private.putduk_assert_admin(p_admin_id, array['super_admin', 'finance']);

  if v_decision in ('sent', 'completed', 'complete') then
    return public.putduk_admin_withdraw_complete(p_admin_id, p_withdrawal_id, p_transaction_reference);
  end if;

  if v_decision not in ('approved', 'rejected') then
    raise exception using errcode = '22023', message = '출금 처리 결과를 선택해 주세요.';
  end if;

  select * into v_row from public.withdrawal_requests where id = p_withdrawal_id for update;
  if not found then
    raise exception using errcode = 'P0002', message = '출금 요청을 찾을 수 없습니다.';
  end if;

  if v_row.status in ('completed', 'sent') then
    return v_row;
  end if;

  v_stipend := round(coalesce(v_row.stipend_amount, 0), 2);
  v_principal := round(coalesce(v_row.principal_amount, 0), 2);

  if v_decision = 'approved' then
    if v_row.status not in ('submitted', 'checking') then
      raise exception using errcode = '23514', message = '승인할 수 없는 출금 상태입니다.';
    end if;
    update public.withdrawal_requests
    set status = 'approved', reviewed_by = p_admin_id, reviewed_at = v_now, updated_at = v_now
    where id = v_row.id
    returning * into v_after;
    insert into public.notifications (user_id, title, body, notification_type)
    values (v_row.user_id, '출금이 승인됐어요', '운영자가 바로 이체 준비 중이에요. 대기 일수는 없어요.', 'finance');
    return v_after;
  end if;

  if v_row.include_principal or v_row.principal_included or v_principal > 0 then
    raise exception using errcode = '23514',
      message = '원금 출금은 거절하거나 수수료로 깎을 수 없어요. 완료로 바로 처리해 주세요.';
  end if;

  if v_reason is null then
    raise exception using errcode = '22023', message = '반려 사유를 입력해 주세요.';
  end if;
  if v_row.status not in ('submitted', 'checking', 'approved') then
    raise exception using errcode = '23514', message = '반려할 수 없는 출금 상태입니다.';
  end if;

  if v_stipend <= 0 then
    v_stipend := v_row.amount;
  end if;

  update public.withdrawal_requests
  set status = 'rejected', rejection_reason = v_reason,
      reviewed_by = p_admin_id, reviewed_at = v_now, updated_at = v_now
  where id = v_row.id
  returning * into v_after;

  perform private.putduk_apply_bucket_delta(
    v_row.user_id, 'available', v_row.currency, v_stipend, -v_stipend,
    'withdrawal_reversed', 'withdrawal_request', v_row.id,
    'withdrawal-reversed:' || v_row.id::text,
    p_admin_id
  );

  insert into public.notifications (user_id, title, body, notification_type)
  values (v_row.user_id, '출금 요청이 반려됐어요', '운영자 안내: ' || v_reason, 'finance');

  return v_after;
end;
$$;

-- ---------------------------------------------------------------------------
-- 9. 운영자 잔액 조정 · 회원 검색 세 칸
-- ---------------------------------------------------------------------------

drop function if exists public.putduk_admin_adjust_balance(uuid, uuid, text, numeric, text, text);

create or replace function public.putduk_admin_adjust_balance(
  p_admin_id uuid,
  p_user_id uuid,
  p_direction text,
  p_amount numeric,
  p_currency text default 'KRW',
  p_reason text default null,
  p_bucket text default null
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public, private, extensions
as $$
declare
  v_direction text := lower(trim(coalesce(p_direction, '')));
  v_currency text := upper(trim(coalesce(p_currency, 'KRW')));
  v_reason text := nullif(left(trim(coalesce(p_reason, '')), 500), '');
  v_amount numeric(18,2) := p_amount;
  v_bucket text := nullif(trim(coalesce(p_bucket, '')), '');
  v_signed numeric(18,2);
  v_entry_type text;
  v_applied boolean := false;
begin
  perform private.putduk_assert_admin(p_admin_id, array['super_admin', 'finance']);

  if v_direction in ('입금', 'deposit') then
    v_direction := 'credit';
  elsif v_direction in ('차감', 'withdraw', 'withdrawal') then
    v_direction := 'debit';
  end if;

  if v_direction not in ('credit', 'debit') then
    raise exception using errcode = '22023', message = '잔액 입금 또는 차감을 선택해 주세요.';
  end if;

  if v_currency not in ('KRW', 'USDT') then
    raise exception using errcode = '22023', message = '통화를 확인해 주세요.';
  end if;

  if v_amount is null or v_amount <= 0 or v_amount > 100000000 then
    raise exception using errcode = '22023', message = '금액을 확인해 주세요.';
  end if;

  if v_reason is null then
    raise exception using errcode = '22023', message = '사유를 입력해 주세요.';
  end if;

  if not exists (select 1 from public.profiles p where p.id = p_user_id) then
    raise exception using errcode = 'P0002', message = '회원 정보를 찾을 수 없습니다.';
  end if;

  if v_bucket is null then
    v_bucket := case when v_direction = 'credit' then 'work_balance' else 'available' end;
  end if;

  if v_bucket not in ('support_grant', 'work_balance', 'available') then
    raise exception using errcode = '22023', message = '지원금·근무 잔액·출금 가능 칸만 조정할 수 있어요.';
  end if;

  v_signed := case when v_direction = 'credit' then v_amount else -v_amount end;
  v_entry_type := case when v_direction = 'credit' then 'admin_credit' else 'admin_debit' end;

  v_applied := private.putduk_apply_bucket_delta(
    p_user_id, v_bucket, v_currency, v_signed, 0,
    v_entry_type, 'admin_adjustment', null,
    'admin-adjust:' || v_direction || ':' || v_bucket || ':' || gen_random_uuid()::text,
    p_admin_id
  );

  if v_applied is not true then
    raise exception using errcode = '23505', message = '같은 잔액 조정이 이미 처리되었습니다.';
  end if;

  insert into public.notifications (user_id, title, body, notification_type)
  values (
    p_user_id,
    case when v_direction = 'credit' then '운영자가 잔액을 입금했어요' else '운영자가 잔액을 차감했어요' end,
    to_char(v_amount, 'FM999G999G999G990D00') ||
      case when v_currency = 'USDT' then ' 테더' else '원' end ||
      ' · 운영자 안내: ' || v_reason,
    'finance'
  );

  return jsonb_build_object(
    'user_id', p_user_id,
    'direction', v_direction,
    'amount', v_amount,
    'currency', v_currency,
    'bucket', v_bucket,
    'reason', v_reason,
    'wallets', private.putduk_wallet_snapshot(p_user_id)
  );
end;
$$;

revoke all on function public.putduk_admin_adjust_balance(uuid, uuid, text, numeric, text, text, text)
  from public, anon, authenticated;
grant execute on function public.putduk_admin_adjust_balance(uuid, uuid, text, numeric, text, text, text)
  to service_role;

drop function if exists public.putduk_admin_search_members(uuid, text, integer, integer);

create or replace function public.putduk_admin_search_members(
  p_admin_id uuid,
  p_query text default null,
  p_limit integer default 50,
  p_offset integer default 0
)
returns table (
  user_id uuid,
  public_id text,
  display_name text,
  legal_name text,
  email text,
  phone_e164 text,
  member_tier text,
  status public.member_status,
  kyc_status text,
  created_at timestamptz,
  last_login_at timestamptz,
  last_login_ip inet,
  last_sign_in_at timestamptz,
  available_krw numeric,
  referral_count bigint,
  work_balance_krw numeric,
  support_grant_krw numeric,
  available_held_krw numeric,
  work_held_krw numeric,
  line_open boolean,
  trial_consumed_at timestamptz
)
language plpgsql
security definer
stable
set search_path = pg_catalog, public, private, auth
as $$
declare
  v_query text := nullif(lower(trim(coalesce(p_query, ''))), '');
  v_limit integer := least(greatest(coalesce(p_limit, 50), 1), 100);
  v_offset integer := greatest(coalesce(p_offset, 0), 0);
begin
  perform private.putduk_assert_admin(p_admin_id, array['super_admin', 'member_support']);

  return query
  select
    p.id,
    p.public_id,
    p.display_name,
    pp.legal_name,
    coalesce(u.email::text, pp.email_snapshot),
    pp.phone_e164,
    p.member_tier,
    p.status,
    p.kyc_status,
    p.created_at,
    pp.last_login_at,
    pp.last_login_ip,
    u.last_sign_in_at,
    coalesce((
      select w.available_amount from public.wallet_accounts w
      where w.user_id = p.id and w.bucket = 'available' and w.currency = 'KRW'
    ), 0::numeric),
    (select count(*)::bigint from public.referral_relations r where r.referrer_id = p.id),
    coalesce((
      select w.available_amount from public.wallet_accounts w
      where w.user_id = p.id and w.bucket = 'work_balance' and w.currency = 'KRW'
    ), 0::numeric),
    coalesce((
      select w.available_amount from public.wallet_accounts w
      where w.user_id = p.id and w.bucket = 'support_grant' and w.currency = 'KRW'
    ), 0::numeric),
    coalesce((
      select w.held_amount from public.wallet_accounts w
      where w.user_id = p.id and w.bucket = 'available' and w.currency = 'KRW'
    ), 0::numeric),
    coalesce((
      select w.held_amount from public.wallet_accounts w
      where w.user_id = p.id and w.bucket = 'work_balance' and w.currency = 'KRW'
    ), 0::numeric),
    p.line_open,
    p.trial_consumed_at
  from public.profiles p
  left join private.profile_private pp on pp.user_id = p.id
  left join auth.users u on u.id = p.id
  where v_query is null
     or p.public_id ilike '%' || v_query || '%'
     or p.display_name ilike '%' || v_query || '%'
     or coalesce(pp.legal_name, '') ilike '%' || v_query || '%'
     or coalesce(u.email::text, pp.email_snapshot, '') ilike '%' || v_query || '%'
     or coalesce(pp.phone_e164, '') ilike '%' || v_query || '%'
  order by p.created_at desc
  limit v_limit
  offset v_offset;
end;
$$;

revoke all on function public.putduk_admin_search_members(uuid, text, integer, integer)
  from public, anon, authenticated;
grant execute on function public.putduk_admin_search_members(uuid, text, integer, integer)
  to service_role;

-- ---------------------------------------------------------------------------
-- 10. 근무 카드 CRUD RPC
-- ---------------------------------------------------------------------------

create or replace function public.putduk_admin_upsert_node(
  p_admin_id uuid,
  p_node_id uuid default null,
  p_payload jsonb default '{}'::jsonb
)
returns public.nodes
language plpgsql
security definer
set search_path = pg_catalog, public, private
as $$
declare
  v_payload jsonb := coalesce(p_payload, '{}'::jsonb);
  v_row public.nodes%rowtype;
  v_brand public.partner_brands%rowtype;
  v_correct text;
  v_tiers text[];
  v_partner uuid;
  v_title text;
  v_desc text;
  v_family text;
  v_band text;
begin
  perform private.putduk_assert_admin(p_admin_id, array['super_admin', 'content']);

  if p_node_id is not null then
    select * into v_row from public.nodes where id = p_node_id for update;
    if not found then
      raise exception using errcode = 'P0002', message = '업무 카드를 찾을 수 없습니다.';
    end if;
  end if;

  v_partner := coalesce(nullif(v_payload ->> 'partner_brand_id', '')::uuid, v_row.partner_brand_id);
  if v_partner is null then
    raise exception using errcode = '22023', message = '협력사를 선택해 주세요.';
  end if;
  select * into v_brand from public.partner_brands where id = v_partner;
  if not found then
    raise exception using errcode = 'P0002', message = '등록된 협력사를 선택해 주세요.';
  end if;

  v_title := coalesce(nullif(trim(v_payload ->> 'title_ko'), ''), v_row.title_ko);
  v_desc := coalesce(nullif(trim(v_payload ->> 'description_ko'), ''), v_row.description_ko);
  v_family := coalesce(nullif(trim(v_payload ->> 'node_family'), ''), v_row.node_family, '근무 확인');
  v_band := coalesce(nullif(trim(v_payload ->> 'tier_band'), ''), v_row.tier_band, '소액');
  if v_title is null or v_desc is null then
    raise exception using errcode = '22023', message = '업무 이름과 설명을 입력해 주세요.';
  end if;
  if v_band not in ('체험', '소액', '중간', '고액', '초고액') then
    raise exception using errcode = '22023', message = '금액 구간을 확인해 주세요.';
  end if;

  if v_payload ? 'allowed_tiers' then
    select coalesce(array_agg(x), '{}'::text[])
      into v_tiers
    from jsonb_array_elements_text(coalesce(v_payload -> 'allowed_tiers', '[]'::jsonb)) as x
    where nullif(trim(x), '') is not null;
  else
    v_tiers := coalesce(v_row.allowed_tiers, '{}'::text[]);
  end if;

  v_correct := lower(nullif(trim(v_payload ->> 'correct_choice'), ''));
  if v_correct is not null and v_correct not in ('a', 'b') then
    raise exception using errcode = '22023', message = '정답은 보기 1 또는 보기 2여야 해요.';
  end if;

  if p_node_id is null then
    insert into public.nodes (
      public_id, partner_brand_id, title_ko, description_ko, node_family, difficulty,
      estimated_seconds, reward_min, reward_max, daily_capacity, enabled,
      motion_profile, motion_version, allowed_tiers,
      scene_theme, vehicle_type, route_type, particle_style, completion_effect,
      supply_source, catalog_status,
      stake_krw, stipend_krw, tier_band, partner_slug,
      question_prompt_ko, question_image_path, choice_a_ko, choice_b_ko,
      daily_cap, requires_assign, is_trial
    )
    values (
      coalesce(nullif(v_payload ->> 'public_id', ''), 'PDK-NODE-' || upper(substr(replace(gen_random_uuid()::text, '-', ''), 1, 8))),
      v_partner, v_title, v_desc, v_family,
      coalesce(nullif(trim(v_payload ->> 'difficulty'), ''), '일반 처리'),
      coalesce(nullif(v_payload ->> 'estimated_seconds', '')::integer, 1800),
      coalesce(nullif(v_payload ->> 'stipend_krw', '')::numeric, nullif(v_payload ->> 'reward_min', '')::numeric, 0),
      coalesce(nullif(v_payload ->> 'stipend_krw', '')::numeric, nullif(v_payload ->> 'reward_max', '')::numeric, 0),
      coalesce(nullif(v_payload ->> 'daily_cap', '')::integer, nullif(v_payload ->> 'daily_capacity', '')::integer, 0),
      false,
      coalesce(nullif(trim(v_payload ->> 'motion_profile'), ''), 'default'),
      coalesce(nullif(trim(v_payload ->> 'motion_version'), ''), '1.0.0'),
      v_tiers,
      nullif(trim(v_payload ->> 'scene_theme'), ''),
      nullif(trim(v_payload ->> 'vehicle_type'), ''),
      nullif(trim(v_payload ->> 'route_type'), ''),
      nullif(trim(v_payload ->> 'particle_style'), ''),
      nullif(trim(v_payload ->> 'completion_effect'), ''),
      'operator',
      coalesce(nullif(trim(v_payload ->> 'catalog_status'), ''), 'draft'),
      coalesce(nullif(v_payload ->> 'stake_krw', '')::numeric, 0),
      coalesce(nullif(v_payload ->> 'stipend_krw', '')::numeric, 0),
      v_band,
      coalesce(nullif(trim(v_payload ->> 'partner_slug'), ''), v_brand.slug),
      nullif(trim(v_payload ->> 'question_prompt_ko'), ''),
      nullif(trim(v_payload ->> 'question_image_path'), ''),
      nullif(trim(v_payload ->> 'choice_a_ko'), ''),
      nullif(trim(v_payload ->> 'choice_b_ko'), ''),
      coalesce(nullif(v_payload ->> 'daily_cap', '')::integer, 0),
      coalesce((v_payload ->> 'requires_assign')::boolean, v_band = '초고액'),
      coalesce((v_payload ->> 'is_trial')::boolean, v_band = '체험')
    )
    returning * into v_row;
  else
    update public.nodes
    set partner_brand_id = v_partner,
        title_ko = v_title,
        description_ko = v_desc,
        node_family = v_family,
        difficulty = coalesce(nullif(trim(v_payload ->> 'difficulty'), ''), difficulty),
        estimated_seconds = coalesce(nullif(v_payload ->> 'estimated_seconds', '')::integer, estimated_seconds),
        stake_krw = coalesce(nullif(v_payload ->> 'stake_krw', '')::numeric, stake_krw),
        stipend_krw = coalesce(nullif(v_payload ->> 'stipend_krw', '')::numeric, stipend_krw),
        tier_band = v_band,
        partner_slug = coalesce(nullif(trim(v_payload ->> 'partner_slug'), ''), partner_slug, v_brand.slug),
        question_prompt_ko = case when v_payload ? 'question_prompt_ko' then nullif(trim(v_payload ->> 'question_prompt_ko'), '') else question_prompt_ko end,
        question_image_path = case when v_payload ? 'question_image_path' then nullif(trim(v_payload ->> 'question_image_path'), '') else question_image_path end,
        choice_a_ko = case when v_payload ? 'choice_a_ko' then nullif(trim(v_payload ->> 'choice_a_ko'), '') else choice_a_ko end,
        choice_b_ko = case when v_payload ? 'choice_b_ko' then nullif(trim(v_payload ->> 'choice_b_ko'), '') else choice_b_ko end,
        daily_cap = coalesce(nullif(v_payload ->> 'daily_cap', '')::integer, daily_cap),
        requires_assign = coalesce((v_payload ->> 'requires_assign')::boolean, requires_assign, v_band = '초고액'),
        is_trial = coalesce((v_payload ->> 'is_trial')::boolean, is_trial, v_band = '체험'),
        motion_profile = coalesce(nullif(trim(v_payload ->> 'motion_profile'), ''), motion_profile),
        motion_version = coalesce(nullif(trim(v_payload ->> 'motion_version'), ''), motion_version),
        allowed_tiers = v_tiers,
        scene_theme = case when v_payload ? 'scene_theme' then nullif(trim(v_payload ->> 'scene_theme'), '') else scene_theme end,
        vehicle_type = case when v_payload ? 'vehicle_type' then nullif(trim(v_payload ->> 'vehicle_type'), '') else vehicle_type end,
        route_type = case when v_payload ? 'route_type' then nullif(trim(v_payload ->> 'route_type'), '') else route_type end,
        particle_style = case when v_payload ? 'particle_style' then nullif(trim(v_payload ->> 'particle_style'), '') else particle_style end,
        completion_effect = case when v_payload ? 'completion_effect' then nullif(trim(v_payload ->> 'completion_effect'), '') else completion_effect end,
        catalog_status = coalesce(nullif(trim(v_payload ->> 'catalog_status'), ''), catalog_status)
    where id = p_node_id
    returning * into v_row;
  end if;

  if v_correct is not null then
    insert into private.node_answer_keys (node_id, correct_choice, updated_at)
    values (v_row.id, v_correct, now())
    on conflict (node_id) do update
      set correct_choice = excluded.correct_choice,
          updated_at = now();
  end if;

  return v_row;
end;
$$;

revoke all on function public.putduk_admin_upsert_node(uuid, uuid, jsonb)
  from public, anon, authenticated;
grant execute on function public.putduk_admin_upsert_node(uuid, uuid, jsonb)
  to service_role;

comment on function private.putduk_apply_bucket_delta(uuid, text, text, numeric, numeric, text, text, uuid, text, uuid) is
  '한 칸의 available/held만 바꾸고 원장 1건을 남긴다. 칸을 합치지 않는다.';
comment on function private.putduk_lock_stake(uuid, uuid, uuid, uuid) is
  '근무 잔액 잠금 또는 체험 지원금 전액 소진. idempotent.';
comment on function private.putduk_release_stake(uuid, uuid) is
  '잠긴 원금을 근무 잔액으로 되돌린다. 체험 지원금은 반환하지 않는다.';
comment on function private.putduk_grant_stipend(uuid, uuid) is
  '수당만 출금 가능 칸에 넣는다.';
comment on function public.putduk_member_withdraw_request(uuid, text, numeric, text, text, boolean, text, text, text, text, text) is
  '출금 신청. 수당만 또는 원금포함. 해당 금액을 보류하고 이중 신청을 막는다. 잠긴 원금은 출금 불가.';
comment on function public.putduk_admin_withdraw_complete(uuid, uuid, text, text) is
  '운영자 완료. 보류 차감·내역 완료. 원금포함이면 등급 강등·라인 닫힘. 대기 일수·원금 거절·수수료 없음.';
comment on function public.putduk_admin_upsert_node(uuid, uuid, jsonb) is
  '근무 카드 등록·수정. 정답은 private.node_answer_keys에만 둔다.';

commit;
