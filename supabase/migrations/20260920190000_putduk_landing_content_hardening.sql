begin;

create index landing_metric_settings_updated_by_idx
  on public.landing_metric_settings (updated_by)
  where updated_by is not null;

create index landing_metric_snapshots_changed_by_idx
  on public.landing_metric_snapshots (changed_by)
  where changed_by is not null;

create index landing_review_consents_work_submission_idx
  on public.landing_review_consents (work_submission_id)
  where work_submission_id is not null;

create index landing_review_consents_created_by_idx
  on public.landing_review_consents (created_by)
  where created_by is not null;

create index landing_reviews_consent_idx
  on public.landing_reviews (consent_id)
  where consent_id is not null;

create index landing_reviews_updated_by_idx
  on public.landing_reviews (updated_by)
  where updated_by is not null;

create index landing_content_audit_actor_idx
  on public.landing_content_audit_logs (actor_id)
  where actor_id is not null;

create policy landing_metric_snapshots_deny_client
on public.landing_metric_snapshots
for all
to anon, authenticated
using (false)
with check (false);

create policy landing_review_consents_deny_client
on public.landing_review_consents
for all
to anon, authenticated
using (false)
with check (false);

create policy landing_content_audit_logs_deny_client
on public.landing_content_audit_logs
for all
to anon, authenticated
using (false)
with check (false);

commit;
