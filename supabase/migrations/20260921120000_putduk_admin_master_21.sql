-- Stage 5: Admin MASTER 21-area no-code operations foundation.
-- This migration deliberately does not touch wallet/ledger settlement logic or synthetic FOMO tables.

create schema if not exists private;


create table if not exists private.partner_funding_pools (
  id uuid primary key default gen_random_uuid(),
  partner_brand_id uuid not null references public.partner_brands(id) on delete restrict,
  total_budget numeric(18,0) not null default 0 check (total_budget >= 0),
  secured_amount numeric(18,0) not null default 0 check (secured_amount >= 0),
  verification_status text not null default 'pending' check (verification_status in ('pending','verified','rejected')),
  public_visible boolean not null default false,
  starts_at timestamptz,
  ends_at timestamptz,
  operator_note text,
  created_by uuid references auth.users(id) on delete set null,
  updated_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (ends_at is null or starts_at is null or ends_at > starts_at)
);

create table if not exists private.partner_budget_allocations (
  id uuid primary key default gen_random_uuid(),
  funding_pool_id uuid not null references private.partner_funding_pools(id) on delete cascade,
  node_id uuid not null references public.nodes(id) on delete restrict,
  allocated_amount numeric(18,0) not null default 0 check (allocated_amount >= 0),
  spent_amount numeric(18,0) not null default 0 check (spent_amount >= 0),
  reserved_amount numeric(18,0) not null default 0 check (reserved_amount >= 0),
  remaining_amount numeric(18,0) generated always as (greatest(allocated_amount - spent_amount - reserved_amount, 0)) stored,
  updated_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (funding_pool_id, node_id),
  check (spent_amount + reserved_amount <= allocated_amount)
);

create table if not exists private.partner_budget_ledger (
  id uuid primary key default gen_random_uuid(),
  funding_pool_id uuid not null references private.partner_funding_pools(id) on delete cascade,
  allocation_id uuid references private.partner_budget_allocations(id) on delete set null,
  event_type text not null check (event_type in ('created','updated','allocation_updated','status_changed')),
  amount numeric(18,0),
  note text,
  actor_id uuid references auth.users(id) on delete set null,
  snapshot jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create table if not exists private.admin_content_items (
  id uuid primary key default gen_random_uuid(),
  content_type text not null check (content_type in ('onboarding','faq','notification_template')),
  title_ko text not null,
  body_ko text not null,
  audience text not null default 'member' check (audience in ('member','all')),
  sort_order integer not null default 0,
  enabled boolean not null default true,
  created_by uuid references auth.users(id) on delete set null,
  updated_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table private.partner_funding_pools enable row level security;
alter table private.partner_budget_allocations enable row level security;
alter table private.partner_budget_ledger enable row level security;
alter table private.admin_content_items enable row level security;

revoke all on private.partner_funding_pools from anon, authenticated;
revoke all on private.partner_budget_allocations from anon, authenticated;
revoke all on private.partner_budget_ledger from anon, authenticated;
revoke all on private.admin_content_items from anon, authenticated;
grant all on private.partner_funding_pools to service_role;
grant all on private.partner_budget_allocations to service_role;
grant all on private.partner_budget_ledger to service_role;
grant all on private.admin_content_items to service_role;

create index if not exists partner_funding_pools_partner_brand_id_idx on private.partner_funding_pools(partner_brand_id);
create index if not exists partner_budget_allocations_pool_id_idx on private.partner_budget_allocations(funding_pool_id);
create index if not exists partner_budget_allocations_node_id_idx on private.partner_budget_allocations(node_id);
create index if not exists partner_budget_ledger_pool_id_idx on private.partner_budget_ledger(funding_pool_id);
create index if not exists partner_budget_ledger_allocation_id_idx on private.partner_budget_ledger(allocation_id);
create index if not exists admin_content_items_type_order_idx on private.admin_content_items(content_type, sort_order, updated_at desc);

-- Public brand imagery is uploaded only by the verified admin Edge Function using service_role.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'putduk-public-assets',
  'putduk-public-assets',
  true,
  10485760,
  array['image/jpeg','image/png','image/webp']::text[]
)
on conflict (id) do update
set public = excluded.public,
    file_size_limit = excluded.file_size_limit,
    allowed_mime_types = excluded.allowed_mime_types;
