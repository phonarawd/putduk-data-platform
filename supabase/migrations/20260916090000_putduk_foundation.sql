-- 퍼뜩 데이터 노드 신규 프로젝트 기반 스키마
-- 이 migration은 PUTDUK-DATA-PRODUCTION 프로젝트 전용입니다.

create extension if not exists pgcrypto;

create schema if not exists private;

do $$ begin
  create type public.member_status as enum ('active', 'pending', 'blocked', 'withdrawn');
exception when duplicate_object then null; end $$;
do $$ begin
  create type public.verification_status as enum ('pending', 'submitted', 'approved', 'rejected', 'expired');
exception when duplicate_object then null; end $$;
do $$ begin
  create type public.task_run_status as enum ('reserved', 'in_progress', 'checkpointed', 'submitted', 'review_pending', 'approved', 'rework', 'rejected', 'cancelled');
exception when duplicate_object then null; end $$;

create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  public_id text not null unique,
  display_name text not null default '퍼뜩 회원',
  member_tier text not null default '일반 파트너',
  status public.member_status not null default 'pending',
  referral_code text unique,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists private.profile_private (
  user_id uuid primary key references public.profiles(id) on delete cascade,
  legal_name text,
  birth_date date,
  phone_e164 text,
  email_snapshot text,
  phone_verified_at timestamptz,
  last_login_at timestamptz,
  last_login_ip inet,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists private.admin_roles (
  user_id uuid primary key references auth.users(id) on delete cascade,
  role text not null check (role in ('super_admin', 'member_support', 'kyc_review', 'finance', 'work_review', 'content')),
  created_at timestamptz not null default now()
);

create table if not exists public.partner_brands (
  id uuid primary key default gen_random_uuid(),
  slug text not null unique,
  display_name_ko text not null,
  legal_name text not null,
  category text not null,
  verification_status public.verification_status not null default 'pending',
  verification_note text,
  logo_asset_path text,
  logo_usage_status text not null default 'not_submitted' check (logo_usage_status in ('not_submitted', 'submitted', 'approved', 'expired')),
  published boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists private.brand_verification_records (
  id uuid primary key default gen_random_uuid(),
  partner_brand_id uuid not null references public.partner_brands(id) on delete cascade,
  source_kind text not null,
  source_url text,
  evidence_path text,
  verified_by uuid references auth.users(id),
  verified_at timestamptz,
  expires_at timestamptz,
  notes text,
  created_at timestamptz not null default now()
);

create table if not exists public.nodes (
  id uuid primary key default gen_random_uuid(),
  public_id text not null unique,
  partner_brand_id uuid not null references public.partner_brands(id),
  title_ko text not null,
  description_ko text not null,
  node_family text not null,
  difficulty text not null default '일반 처리',
  estimated_seconds integer not null check (estimated_seconds between 30 and 5400),
  reward_min numeric(12,2) not null default 0 check (reward_min >= 0),
  reward_max numeric(12,2) not null default 0 check (reward_max >= reward_min),
  daily_capacity integer not null default 0 check (daily_capacity >= 0),
  enabled boolean not null default false,
  motion_profile text not null default 'default',
  motion_version text not null default '1.0.0',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.task_runs (
  id uuid primary key default gen_random_uuid(),
  public_id text not null unique,
  user_id uuid not null references public.profiles(id) on delete restrict,
  node_id uuid not null references public.nodes(id) on delete restrict,
  status public.task_run_status not null default 'reserved',
  started_at timestamptz,
  expected_completed_at timestamptz,
  completed_at timestamptz,
  progress numeric(5,4) not null default 0 check (progress between 0 and 1),
  motion_variant text not null default 'a',
  motion_seed text not null,
  reward_policy_version text not null default '1.0.0',
  reward_amount numeric(12,2) not null default 0 check (reward_amount >= 0),
  reward_status text not null default 'not_ready' check (reward_status in ('not_ready', 'held', 'pending', 'posted', 'reversed')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.task_events (
  id uuid primary key default gen_random_uuid(),
  task_run_id uuid not null references public.task_runs(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete restrict,
  event_type text not null,
  event_payload jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create table if not exists public.task_checkpoints (
  id uuid primary key default gen_random_uuid(),
  task_run_id uuid not null references public.task_runs(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete restrict,
  checkpoint_key text not null,
  checkpoint_payload jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  unique(task_run_id, checkpoint_key)
);

create table if not exists public.work_submissions (
  id uuid primary key default gen_random_uuid(),
  task_run_id uuid not null unique references public.task_runs(id) on delete restrict,
  user_id uuid not null references public.profiles(id) on delete restrict,
  answer_payload jsonb not null default '{}'::jsonb,
  auto_score numeric(5,4),
  submitted_at timestamptz not null default now()
);

create table if not exists private.review_decisions (
  id uuid primary key default gen_random_uuid(),
  task_run_id uuid not null references public.task_runs(id) on delete restrict,
  reviewer_id uuid not null references auth.users(id),
  decision text not null check (decision in ('approved', 'rework', 'rejected')),
  reason text,
  score numeric(5,4),
  created_at timestamptz not null default now()
);

create table if not exists public.wallet_accounts (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete restrict,
  bucket text not null check (bucket in ('support_grant', 'task_reward', 'referral_reward', 'available', 'held')),
  currency text not null default 'KRW' check (currency in ('KRW', 'USDT')),
  available_amount numeric(18,2) not null default 0 check (available_amount >= 0),
  held_amount numeric(18,2) not null default 0 check (held_amount >= 0),
  updated_at timestamptz not null default now(),
  unique(user_id, bucket, currency)
);

create table if not exists private.ledger_entries (
  id uuid primary key default gen_random_uuid(),
  public_id text not null unique,
  user_id uuid not null references public.profiles(id) on delete restrict,
  bucket text not null,
  currency text not null,
  amount numeric(18,2) not null,
  entry_type text not null,
  reference_type text,
  reference_id uuid,
  idempotency_key text not null unique,
  created_by uuid references auth.users(id),
  created_at timestamptz not null default now()
);

create table if not exists public.deposit_requests (
  id uuid primary key default gen_random_uuid(),
  public_id text not null unique,
  user_id uuid not null references public.profiles(id) on delete restrict,
  currency text not null default 'KRW' check (currency in ('KRW', 'USDT')),
  amount numeric(18,2) not null check (amount > 0),
  status text not null default 'submitted' check (status in ('submitted', 'checking', 'approved', 'rejected', 'cancelled')),
  proof_path text,
  note text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.withdrawal_requests (
  id uuid primary key default gen_random_uuid(),
  public_id text not null unique,
  user_id uuid not null references public.profiles(id) on delete restrict,
  currency text not null default 'KRW' check (currency in ('KRW', 'USDT')),
  amount numeric(18,2) not null check (amount > 0),
  destination_type text not null check (destination_type in ('bank', 'usdt')),
  status text not null default 'submitted' check (status in ('submitted', 'checking', 'approved', 'sent', 'rejected', 'cancelled')),
  transaction_reference text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists private.payout_destinations (
  id uuid primary key default gen_random_uuid(),
  destination_type text not null check (destination_type in ('bank', 'usdt')),
  label text not null,
  masked_value text not null,
  encrypted_value text,
  qr_asset_path text,
  enabled boolean not null default false,
  created_by uuid references auth.users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists private.kyc_documents (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete restrict,
  document_kind text not null check (document_kind in ('identity_front', 'identity_back', 'selfie')),
  storage_path text not null,
  status public.verification_status not null default 'submitted',
  reviewed_by uuid references auth.users(id),
  reviewed_at timestamptz,
  rejection_reason text,
  created_at timestamptz not null default now()
);

create table if not exists public.referral_relations (
  id uuid primary key default gen_random_uuid(),
  referrer_id uuid not null references public.profiles(id) on delete restrict,
  invitee_id uuid not null unique references public.profiles(id) on delete restrict,
  status text not null default 'joined' check (status in ('joined', 'verified', 'funded', 'qualified', 'paid', 'held', 'rejected')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (referrer_id <> invitee_id)
);

create table if not exists private.referral_rewards (
  id uuid primary key default gen_random_uuid(),
  relation_id uuid not null unique references public.referral_relations(id) on delete restrict,
  referrer_id uuid not null references public.profiles(id) on delete restrict,
  amount numeric(18,2) not null default 5000 check (amount > 0),
  status text not null default 'held' check (status in ('held', 'approved', 'posted', 'reversed')),
  risk_signals jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create table if not exists public.support_grant_campaigns (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  amount numeric(18,2) not null default 10000 check (amount >= 0),
  enabled boolean not null default true,
  trigger_type text not null default 'signup' check (trigger_type in ('signup', 'email_verified', 'phone_verified', 'kyc_approved')),
  usage_scope text not null default 'work_only',
  expires_in_days integer,
  starts_at timestamptz not null default now(),
  ends_at timestamptz,
  created_by uuid references auth.users(id),
  created_at timestamptz not null default now()
);

create table if not exists public.support_grants (
  id uuid primary key default gen_random_uuid(),
  campaign_id uuid not null references public.support_grant_campaigns(id),
  user_id uuid not null references public.profiles(id) on delete restrict,
  amount numeric(18,2) not null check (amount >= 0),
  status text not null default 'available' check (status in ('available', 'held', 'used', 'expired', 'revoked')),
  expires_at timestamptz,
  created_at timestamptz not null default now(),
  unique(campaign_id, user_id)
);

create table if not exists public.notifications (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references public.profiles(id) on delete cascade,
  title text not null,
  body text not null,
  notification_type text not null default 'info',
  read_at timestamptz,
  created_at timestamptz not null default now()
);

create table if not exists private.admin_audit_logs (
  id uuid primary key default gen_random_uuid(),
  admin_id uuid not null references auth.users(id),
  action text not null,
  target_type text,
  target_id uuid,
  reason text,
  before_data jsonb,
  after_data jsonb,
  created_at timestamptz not null default now()
);

create index if not exists task_runs_user_created_idx on public.task_runs(user_id, created_at desc);
create index if not exists task_events_run_created_idx on public.task_events(task_run_id, created_at asc);
create index if not exists nodes_published_idx on public.nodes(enabled, partner_brand_id);
create index if not exists notifications_user_created_idx on public.notifications(user_id, created_at desc);

alter table public.profiles enable row level security;
alter table public.partner_brands enable row level security;
alter table public.nodes enable row level security;
alter table public.task_runs enable row level security;
alter table public.task_events enable row level security;
alter table public.task_checkpoints enable row level security;
alter table public.work_submissions enable row level security;
alter table public.wallet_accounts enable row level security;
alter table public.deposit_requests enable row level security;
alter table public.withdrawal_requests enable row level security;
alter table public.referral_relations enable row level security;
alter table public.support_grant_campaigns enable row level security;
alter table public.support_grants enable row level security;
alter table public.notifications enable row level security;

drop policy if exists profiles_select_own on public.profiles;
create policy profiles_select_own on public.profiles for select to authenticated using ((select auth.uid()) = id);

drop policy if exists brands_select_published on public.partner_brands;
create policy brands_select_published on public.partner_brands for select to authenticated using (published = true and verification_status = 'approved' and logo_usage_status = 'approved');

drop policy if exists nodes_select_enabled on public.nodes;
create policy nodes_select_enabled on public.nodes for select to authenticated using (enabled = true and exists (select 1 from public.partner_brands b where b.id = partner_brand_id and b.published = true and b.verification_status = 'approved'));

drop policy if exists task_runs_select_own on public.task_runs;
create policy task_runs_select_own on public.task_runs for select to authenticated using ((select auth.uid()) = user_id);

drop policy if exists task_events_select_own on public.task_events;
create policy task_events_select_own on public.task_events for select to authenticated using ((select auth.uid()) = user_id);

drop policy if exists task_checkpoints_select_own on public.task_checkpoints;
create policy task_checkpoints_select_own on public.task_checkpoints for select to authenticated using ((select auth.uid()) = user_id);

drop policy if exists submissions_select_own on public.work_submissions;
create policy submissions_select_own on public.work_submissions for select to authenticated using ((select auth.uid()) = user_id);

drop policy if exists wallet_select_own on public.wallet_accounts;
create policy wallet_select_own on public.wallet_accounts for select to authenticated using ((select auth.uid()) = user_id);

drop policy if exists deposits_select_own on public.deposit_requests;
create policy deposits_select_own on public.deposit_requests for select to authenticated using ((select auth.uid()) = user_id);
drop policy if exists deposits_insert_own on public.deposit_requests;
create policy deposits_insert_own on public.deposit_requests for insert to authenticated with check ((select auth.uid()) = user_id);

drop policy if exists withdrawals_select_own on public.withdrawal_requests;
create policy withdrawals_select_own on public.withdrawal_requests for select to authenticated using ((select auth.uid()) = user_id);
drop policy if exists withdrawals_insert_own on public.withdrawal_requests;
create policy withdrawals_insert_own on public.withdrawal_requests for insert to authenticated with check ((select auth.uid()) = user_id);

drop policy if exists referrals_select_involved on public.referral_relations;
create policy referrals_select_involved on public.referral_relations for select to authenticated using ((select auth.uid()) = referrer_id or (select auth.uid()) = invitee_id);

drop policy if exists campaigns_select_enabled on public.support_grant_campaigns;
create policy campaigns_select_enabled on public.support_grant_campaigns for select to authenticated using (enabled = true and starts_at <= now() and (ends_at is null or ends_at > now()));

drop policy if exists grants_select_own on public.support_grants;
create policy grants_select_own on public.support_grants for select to authenticated using ((select auth.uid()) = user_id);

drop policy if exists notifications_select_own on public.notifications;
create policy notifications_select_own on public.notifications for select to authenticated using (user_id is null or (select auth.uid()) = user_id);
drop policy if exists notifications_update_own on public.notifications;
create policy notifications_update_own on public.notifications for update to authenticated using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);

revoke all on schema private from anon, authenticated;
grant usage on schema private to service_role;

insert into public.partner_brands (slug, display_name_ko, legal_name, category, verification_status, logo_usage_status, published)
values
  ('dhl', 'DHL', 'DHL', '특송·택배', 'pending', 'not_submitted', false),
  ('ups', 'UPS', 'UPS', '특송·택배', 'pending', 'not_submitted', false),
  ('fedex', 'FedEx', 'FedEx', '항공·포워딩', 'pending', 'not_submitted', false),
  ('maersk', 'Maersk', 'Maersk', '해상 운송', 'pending', 'not_submitted', false),
  ('alibaba', '알리바바', 'Alibaba', '커머스 플랫폼', 'pending', 'not_submitted', false),
  ('ebay', '이베이', 'eBay', '커머스 플랫폼', 'pending', 'not_submitted', false),
  ('cj', 'CJ대한통운', 'CJ Logistics', '특송·택배', 'pending', 'not_submitted', false),
  ('gxo', 'GXO', 'GXO Logistics', '창고·3PL', 'pending', 'not_submitted', false)
on conflict (slug) do nothing;

insert into public.support_grant_campaigns (name, amount, enabled, trigger_type, usage_scope)
values ('신규 회원 업무 지원금', 10000, true, 'signup', 'work_only')
on conflict do nothing;
