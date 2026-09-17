-- 운영 회원관리·협력사 보강·업무 배정·입출금·KYC 스키마
-- 금액 변경은 원장 RPC를 통해서만 이뤄지며, 회원 직접 UPDATE는 허용하지 않는다.

begin;

-- 회원 KYC 요약. 문서 원본은 private.kyc_documents에만 둔다.
alter table public.profiles
  add column if not exists kyc_status text not null default 'pending';

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conrelid = 'public.profiles'::regclass
      and conname = 'profiles_kyc_status_check'
  ) then
    alter table public.profiles
      add constraint profiles_kyc_status_check
      check (kyc_status in ('pending', 'submitted', 'approved', 'rejected', 'expired'));
  end if;
end
$$;

-- 협력사 한국어 설명
alter table public.partner_brands
  add column if not exists description_ko text;

-- 업무 카드: 가능 등급·연출 메타
alter table public.nodes
  add column if not exists allowed_tiers text[] not null default '{}'::text[],
  add column if not exists scene_theme text,
  add column if not exists vehicle_type text,
  add column if not exists route_type text,
  add column if not exists particle_style text,
  add column if not exists completion_effect text;

comment on column public.nodes.allowed_tiers is
  '비어 있으면 모든 등급, 값이 있으면 해당 회원 등급만 시작 가능.';

-- 입금 검수 컬럼
alter table public.deposit_requests
  add column if not exists destination_id uuid references private.payout_destinations(id) on delete set null,
  add column if not exists rejection_reason text,
  add column if not exists reviewed_by uuid references auth.users(id) on delete set null,
  add column if not exists reviewed_at timestamptz;

-- 출금 검수·표시용 마스킹 정보. 계좌 원문은 public에 두지 않는다.
alter table public.withdrawal_requests
  add column if not exists destination_label text,
  add column if not exists destination_masked text,
  add column if not exists rejection_reason text,
  add column if not exists reviewed_by uuid references auth.users(id) on delete set null,
  add column if not exists reviewed_at timestamptz;

-- 운영자 입금 안내 계좌
alter table private.payout_destinations
  add column if not exists bank_name text,
  add column if not exists account_holder text,
  add column if not exists guidance_text text,
  add column if not exists usdt_network text;

-- 추천 보상 결정 기록
alter table private.referral_rewards
  add column if not exists decided_by uuid references auth.users(id) on delete set null,
  add column if not exists decided_at timestamptz,
  add column if not exists decision_reason text;

-- 지원금 회수 기록
alter table public.support_grants
  add column if not exists revoked_by uuid references auth.users(id) on delete set null,
  add column if not exists revoked_at timestamptz,
  add column if not exists revoke_reason text;

-- 출금 비밀번호: 해시·실패 횟수·잠금만 저장
create table if not exists private.withdrawal_pins (
  user_id uuid primary key references public.profiles(id) on delete cascade,
  pin_hash text not null,
  failed_attempts integer not null default 0 check (failed_attempts >= 0),
  locked_until timestamptz,
  updated_at timestamptz not null default now()
);

-- 회원 출금 목적지. 원문은 private에만 둔다.
create table if not exists private.member_payout_destinations (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  destination_type text not null check (destination_type in ('bank', 'usdt')),
  bank_name text,
  account_holder text,
  account_number text,
  usdt_network text,
  usdt_address text,
  masked_value text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- 특정 회원 업무 배정
create table if not exists public.task_assignments (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete restrict,
  node_id uuid not null references public.nodes(id) on delete restrict,
  partner_brand_id uuid not null references public.partner_brands(id) on delete restrict,
  reward_amount numeric(12,2) check (reward_amount is null or reward_amount >= 0),
  estimated_seconds integer check (estimated_seconds is null or (estimated_seconds >= 30 and estimated_seconds <= 5400)),
  reason text,
  visible_from timestamptz,
  visible_until timestamptz,
  notify_member boolean not null default true,
  status text not null default 'active' check (status in ('active', 'started', 'cancelled', 'expired')),
  created_by uuid not null references auth.users(id),
  started_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (visible_until is null or visible_from is null or visible_until >= visible_from)
);

create unique index if not exists kyc_documents_user_kind_uidx
  on private.kyc_documents (user_id, document_kind);

create index if not exists task_assignments_user_status_idx
  on public.task_assignments (user_id, status);
create index if not exists task_assignments_node_id_idx
  on public.task_assignments (node_id);
create index if not exists task_assignments_partner_brand_id_idx
  on public.task_assignments (partner_brand_id);
create index if not exists task_assignments_created_by_idx
  on public.task_assignments (created_by);
create index if not exists member_payout_destinations_user_id_idx
  on private.member_payout_destinations (user_id);
create index if not exists deposit_requests_destination_id_idx
  on public.deposit_requests (destination_id);
create index if not exists deposit_requests_reviewed_by_idx
  on public.deposit_requests (reviewed_by);
create index if not exists withdrawal_requests_reviewed_by_idx
  on public.withdrawal_requests (reviewed_by);
create index if not exists profiles_kyc_status_idx
  on public.profiles (kyc_status);
create index if not exists referral_rewards_decided_by_idx
  on private.referral_rewards (decided_by);
create index if not exists support_grants_revoked_by_idx
  on public.support_grants (revoked_by);

alter table private.withdrawal_pins enable row level security;
alter table private.member_payout_destinations enable row level security;
alter table public.task_assignments enable row level security;

drop policy if exists private_service_role_full_access on private.withdrawal_pins;
create policy private_service_role_full_access
  on private.withdrawal_pins for all to service_role
  using (true) with check (true);

drop policy if exists private_service_role_full_access on private.member_payout_destinations;
create policy private_service_role_full_access
  on private.member_payout_destinations for all to service_role
  using (true) with check (true);

drop policy if exists assignments_select_own on public.task_assignments;
create policy assignments_select_own
  on public.task_assignments
  for select
  to authenticated
  using (
    (select auth.uid()) = user_id
    and status = 'active'
    and (visible_from is null or visible_from <= now())
    and (visible_until is null or visible_until >= now())
  );

-- 입출금 상태·금액은 회원이 직접 바꿀 수 없다. 신청은 Edge Function·RPC만 허용한다.
drop policy if exists deposits_insert_own on public.deposit_requests;
drop policy if exists withdrawals_insert_own on public.withdrawal_requests;

grant select, insert, update, delete on private.withdrawal_pins to service_role;
grant select, insert, update, delete on private.member_payout_destinations to service_role;
grant select, insert, update, delete on public.task_assignments to service_role;

-- 증빙·KYC 전용 private 버킷. 원본 주소는 공개하지 않는다.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'putduk-private',
  'putduk-private',
  false,
  10485760,
  array['image/jpeg', 'image/png', 'image/webp', 'application/pdf']
)
on conflict (id) do update
set
  public = excluded.public,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists putduk_private_insert_own on storage.objects;
create policy putduk_private_insert_own
  on storage.objects
  for insert
  to authenticated
  with check (
    bucket_id = 'putduk-private'
    and split_part(name, '/', 1) = (select auth.uid())::text
  );

comment on table public.task_assignments is
  '운영자가 특정 회원에게 배정한 업무. 배정 행이 있는 경우에만 회원에게 노출한다.';
comment on table private.withdrawal_pins is
  '출금 비밀번호 해시와 잠금 정보. 평문은 저장하지 않는다.';
comment on table private.member_payout_destinations is
  '회원 출금 계좌·주소 원문. 회원 화면에는 마스킹 값만 내려보낸다.';

commit;
