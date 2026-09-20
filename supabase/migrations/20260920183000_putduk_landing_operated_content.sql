begin;

create table public.landing_metric_settings (
  id uuid primary key default gen_random_uuid(),
  metric_key text not null unique,
  label_ko text not null,
  metric_value bigint not null check (metric_value >= 0),
  value_type text not null check (value_type in ('actual_automatic', 'operator_confirmed', 'goal')),
  source_note text not null,
  measured_at timestamptz not null,
  is_public boolean not null default false,
  sort_order integer not null default 0 check (sort_order >= 0),
  updated_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint landing_metric_key_format check (metric_key ~ '^[a-z0-9_]{2,64}$'),
  constraint landing_metric_label_length check (char_length(label_ko) between 1 and 60),
  constraint landing_metric_source_length check (char_length(source_note) between 2 and 500)
);

comment on table public.landing_metric_settings is
  '랜딩에 공개할 검증 가능한 이용 현황. 기존 crew_pulse/FOMO와 분리한다.';

create table public.landing_metric_snapshots (
  id bigint generated always as identity primary key,
  metric_id uuid not null references public.landing_metric_settings(id) on delete cascade,
  metric_value bigint not null check (metric_value >= 0),
  value_type text not null check (value_type in ('actual_automatic', 'operator_confirmed', 'goal')),
  source_note text not null,
  measured_at timestamptz not null,
  is_public boolean not null,
  changed_by uuid references auth.users(id) on delete set null,
  captured_at timestamptz not null default now()
);

create index landing_metric_settings_public_order_idx
  on public.landing_metric_settings (is_public, sort_order, measured_at desc);
create index landing_metric_snapshots_metric_time_idx
  on public.landing_metric_snapshots (metric_id, captured_at desc);

create table public.landing_review_consents (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  work_submission_id uuid references public.work_submissions(id) on delete restrict,
  consent_version text not null,
  consented_at timestamptz not null default now(),
  revoked_at timestamptz,
  evidence_note text not null default '',
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  constraint landing_review_consent_version_length check (char_length(consent_version) between 1 and 40),
  constraint landing_review_consent_state check (revoked_at is null or revoked_at >= consented_at)
);

create unique index landing_review_active_consent_unique
  on public.landing_review_consents (user_id, work_submission_id)
  where revoked_at is null;

create table public.landing_reviews (
  id uuid primary key default gen_random_uuid(),
  author_display text not null,
  body_ko text not null,
  completed_work_label text,
  review_type text not null check (review_type in ('verified_member', 'usage_example')),
  is_work_verified boolean not null default false,
  consent_id uuid references public.landing_review_consents(id) on delete restrict,
  is_public boolean not null default false,
  sort_order integer not null default 0 check (sort_order >= 0),
  public_starts_at timestamptz,
  public_ends_at timestamptz,
  updated_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint landing_review_author_length check (char_length(author_display) between 1 and 40),
  constraint landing_review_body_length check (char_length(body_ko) between 10 and 500),
  constraint landing_review_window check (public_ends_at is null or public_starts_at is null or public_ends_at > public_starts_at),
  constraint landing_review_verified_contract check (
    (review_type = 'verified_member' and is_work_verified = true and consent_id is not null)
    or
    (review_type = 'usage_example' and is_work_verified = false and consent_id is null)
  )
);

comment on table public.landing_reviews is
  '검증된 회원 후기 또는 명시된 이용 예시. 실제 후기에는 유효한 동의 기록이 필요하다.';

create index landing_reviews_public_order_idx
  on public.landing_reviews (is_public, sort_order, public_starts_at, public_ends_at);

create table public.landing_content_audit_logs (
  id bigint generated always as identity primary key,
  content_type text not null check (content_type in ('metric', 'review', 'consent')),
  record_id uuid not null,
  action text not null check (action in ('insert', 'update', 'delete')),
  before_data jsonb,
  after_data jsonb,
  actor_id uuid references auth.users(id) on delete set null,
  occurred_at timestamptz not null default now()
);

create index landing_content_audit_record_idx
  on public.landing_content_audit_logs (content_type, record_id, occurred_at desc);

create or replace function private.putduk_touch_landing_updated_at()
returns trigger
language plpgsql
set search_path = pg_catalog, public
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

create or replace function private.putduk_snapshot_landing_metric()
returns trigger
language plpgsql
set search_path = pg_catalog, public
as $$
begin
  insert into public.landing_metric_snapshots (
    metric_id, metric_value, value_type, source_note, measured_at, is_public, changed_by
  ) values (
    new.id, new.metric_value, new.value_type, new.source_note, new.measured_at, new.is_public, new.updated_by
  );
  return new;
end;
$$;

create or replace function private.putduk_audit_landing_content()
returns trigger
language plpgsql
set search_path = pg_catalog, public
as $$
declare
  v_type text := tg_argv[0];
  v_record uuid;
  v_actor uuid;
begin
  if tg_op = 'DELETE' then
    v_record := old.id;
    v_actor := case
      when v_type = 'consent' then old.created_by
      else old.updated_by
    end;
    insert into public.landing_content_audit_logs(content_type, record_id, action, before_data, actor_id)
    values (v_type, v_record, 'delete', to_jsonb(old), v_actor);
    return old;
  end if;

  v_record := new.id;
  v_actor := case
    when v_type = 'consent' then new.created_by
    else new.updated_by
  end;

  insert into public.landing_content_audit_logs(content_type, record_id, action, before_data, after_data, actor_id)
  values (
    v_type,
    v_record,
    lower(tg_op),
    case when tg_op = 'UPDATE' then to_jsonb(old) else null end,
    to_jsonb(new),
    v_actor
  );
  return new;
end;
$$;

revoke all on function private.putduk_touch_landing_updated_at() from public, anon, authenticated;
revoke all on function private.putduk_snapshot_landing_metric() from public, anon, authenticated;
revoke all on function private.putduk_audit_landing_content() from public, anon, authenticated;

create trigger landing_metric_touch_updated_at
before update on public.landing_metric_settings
for each row execute function private.putduk_touch_landing_updated_at();

create trigger landing_review_touch_updated_at
before update on public.landing_reviews
for each row execute function private.putduk_touch_landing_updated_at();

create trigger landing_metric_snapshot_after_write
after insert or update on public.landing_metric_settings
for each row execute function private.putduk_snapshot_landing_metric();

create trigger landing_metric_audit_after_write
after insert or update or delete on public.landing_metric_settings
for each row execute function private.putduk_audit_landing_content('metric');

create trigger landing_review_audit_after_write
after insert or update or delete on public.landing_reviews
for each row execute function private.putduk_audit_landing_content('review');

create trigger landing_consent_audit_after_write
after insert or update or delete on public.landing_review_consents
for each row execute function private.putduk_audit_landing_content('consent');

alter table public.landing_metric_settings enable row level security;
alter table public.landing_metric_snapshots enable row level security;
alter table public.landing_review_consents enable row level security;
alter table public.landing_reviews enable row level security;
alter table public.landing_content_audit_logs enable row level security;

revoke all on public.landing_metric_settings from anon, authenticated;
revoke all on public.landing_metric_snapshots from anon, authenticated;
revoke all on public.landing_review_consents from anon, authenticated;
revoke all on public.landing_reviews from anon, authenticated;
revoke all on public.landing_content_audit_logs from anon, authenticated;

grant select (
  id, metric_key, label_ko, metric_value, value_type, source_note,
  measured_at, sort_order, updated_at
) on public.landing_metric_settings to anon, authenticated;

grant select (
  id, author_display, body_ko, completed_work_label, review_type,
  is_work_verified, sort_order, public_starts_at, public_ends_at, updated_at
) on public.landing_reviews to anon, authenticated;

grant all on public.landing_metric_settings to service_role;
grant all on public.landing_metric_snapshots to service_role;
grant all on public.landing_review_consents to service_role;
grant all on public.landing_reviews to service_role;
grant all on public.landing_content_audit_logs to service_role;
grant usage, select on sequence public.landing_metric_snapshots_id_seq to service_role;
grant usage, select on sequence public.landing_content_audit_logs_id_seq to service_role;

create policy landing_metric_settings_public_select
on public.landing_metric_settings
for select
to anon, authenticated
using (is_public = true);

create policy landing_reviews_public_select
on public.landing_reviews
for select
to anon, authenticated
using (
  is_public = true
  and (public_starts_at is null or public_starts_at <= now())
  and (public_ends_at is null or public_ends_at > now())
);

commit;
