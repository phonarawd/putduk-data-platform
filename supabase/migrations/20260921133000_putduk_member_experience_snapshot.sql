-- Stage 6 / P4 member experience: real member-facing work snapshot.
-- Aggregates actual daily seats/completions and verified partner budget in the database.
-- Does not change wallet/ledger settlement or synthetic FOMO storage.

create index if not exists task_runs_member_experience_daily_idx
  on public.task_runs (created_at, node_id, status);

create or replace function public.putduk_member_experience_snapshot(p_user_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public, private, pg_temp
as $$
declare
  v_day_start timestamptz := date_trunc('day', timezone('Asia/Seoul', now())) at time zone 'Asia/Seoul';
  v_work numeric := 0;
  v_support numeric := 0;
  v_available numeric := 0;
  v_trial_consumed boolean := false;
  v_blocking boolean := false;
  v_nodes jsonb := '[]'::jsonb;
begin
  if p_user_id is null then
    raise exception '회원 정보를 확인할 수 없습니다.';
  end if;

  select
    coalesce(max(case when bucket = 'work_balance' and currency = 'KRW' then available_amount end), 0),
    coalesce(max(case when bucket = 'support_grant' and currency = 'KRW' then available_amount end), 0),
    coalesce(max(case when bucket = 'available' and currency = 'KRW' then available_amount end), 0)
  into v_work, v_support, v_available
  from public.wallet_accounts
  where user_id = p_user_id;

  select (trial_consumed_at is not null)
    into v_trial_consumed
  from public.profiles
  where id = p_user_id;
  v_trial_consumed := coalesce(v_trial_consumed, false);

  select exists (
    select 1
    from public.task_runs
    where user_id = p_user_id
      and status in ('reserved','in_progress','checkpointed','submitted','review_pending','rework')
  ) into v_blocking;

  with run_counts as (
    select
      tr.node_id,
      count(*) filter (where tr.status <> 'cancelled')::int as used_today,
      count(*) filter (where tr.status = 'approved')::int as completed_today
    from public.task_runs tr
    where tr.created_at >= v_day_start
    group by tr.node_id
  ), assigned as (
    select distinct ta.node_id
    from public.task_assignments ta
    where ta.user_id = p_user_id
      and ta.status = 'active'
      and (ta.visible_from is null or ta.visible_from <= now())
      and (ta.visible_until is null or ta.visible_until > now())
  ), budget as (
    select
      a.node_id,
      count(*)::int as verified_rows,
      coalesce(sum(a.remaining_amount), 0)::numeric as budget_remaining
    from private.partner_budget_allocations a
    join private.partner_funding_pools f on f.id = a.funding_pool_id
    where f.verification_status = 'verified'
      and f.public_visible = true
      and (f.starts_at is null or f.starts_at <= now())
      and (f.ends_at is null or f.ends_at > now())
    group by a.node_id
  )
  select coalesce(jsonb_agg(
    jsonb_build_object(
      'id', n.id,
      'company_name', b.display_name_ko,
      'title', n.title_ko,
      'difficulty', coalesce(n.difficulty, '일반 처리'),
      'estimated_seconds', coalesce(n.estimated_seconds, 60),
      'stake', coalesce(n.stake_krw, 0),
      'stipend', coalesce(n.stipend_krw, n.reward_max, n.reward_min, 0),
      'is_trial', coalesce(n.is_trial, false) or coalesce(n.tier_band, '') = '체험',
      'requires_assign', coalesce(n.requires_assign, false),
      'assigned', (asg.node_id is not null),
      'visible', case
        when coalesce(n.is_trial, false) or coalesce(n.tier_band, '') = '체험' then not v_trial_consumed
        when coalesce(n.requires_assign, false) then asg.node_id is not null
        else true
      end,
      'daily_capacity', greatest(coalesce(nullif(n.daily_cap, 0), n.daily_capacity, 0), 0),
      'remaining_slots', greatest(coalesce(nullif(n.daily_cap, 0), n.daily_capacity, 0) - coalesce(rc.used_today, 0), 0),
      'completed_today', coalesce(rc.completed_today, 0),
      'budget_verified', coalesce(bg.verified_rows, 0) > 0,
      'budget_remaining', coalesce(bg.budget_remaining, 0),
      'can_start', case
        when v_blocking then false
        when greatest(coalesce(nullif(n.daily_cap, 0), n.daily_capacity, 0) - coalesce(rc.used_today, 0), 0) <= 0 then false
        when coalesce(n.requires_assign, false) and asg.node_id is null then false
        when coalesce(n.is_trial, false) or coalesce(n.tier_band, '') = '체험' then (not v_trial_consumed and v_support > 0)
        else v_work >= coalesce(n.stake_krw, 0)
      end
    ) order by n.created_at desc
  ), '[]'::jsonb)
  into v_nodes
  from public.nodes n
  join public.partner_brands b on b.id = n.partner_brand_id
  left join run_counts rc on rc.node_id = n.id
  left join assigned asg on asg.node_id = n.id
  left join budget bg on bg.node_id = n.id
  where n.catalog_status = 'published'
    and n.enabled = true
    and n.supply_source = 'operator'
    and b.published = true
    and b.verification_status::text = 'approved'
    and b.logo_usage_status = 'approved';

  return jsonb_build_object(
    'work_balance', v_work,
    'support_balance', v_support,
    'withdrawable_balance', v_available,
    'trial_consumed', v_trial_consumed,
    'blocking_run', v_blocking,
    'day_started_at', v_day_start,
    'nodes', v_nodes
  );
end;
$$;

revoke all on function public.putduk_member_experience_snapshot(uuid) from public, anon, authenticated;
grant execute on function public.putduk_member_experience_snapshot(uuid) to service_role;
