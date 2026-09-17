-- 외래키 조회 성능 인덱스
-- 회원·업무·검수·입출금이 늘어날 때 조인과 삭제 확인이 느려지지 않도록
-- 참조 키마다 커버링 인덱스를 만든다.

begin;

create index if not exists admin_audit_logs_admin_id_idx
  on private.admin_audit_logs (admin_id);
create index if not exists brand_verification_records_partner_brand_id_idx
  on private.brand_verification_records (partner_brand_id);
create index if not exists brand_verification_records_verified_by_idx
  on private.brand_verification_records (verified_by);
create index if not exists kyc_documents_reviewed_by_idx
  on private.kyc_documents (reviewed_by);
create index if not exists kyc_documents_user_id_idx
  on private.kyc_documents (user_id);
create index if not exists ledger_entries_created_by_idx
  on private.ledger_entries (created_by);
create index if not exists ledger_entries_user_id_idx
  on private.ledger_entries (user_id);
create index if not exists payout_destinations_created_by_idx
  on private.payout_destinations (created_by);
create index if not exists referral_rewards_referrer_id_idx
  on private.referral_rewards (referrer_id);
create index if not exists review_decisions_reviewer_id_idx
  on private.review_decisions (reviewer_id);
create index if not exists review_decisions_task_run_id_idx
  on private.review_decisions (task_run_id);

create index if not exists deposit_requests_user_id_idx
  on public.deposit_requests (user_id);
create index if not exists nodes_partner_brand_id_idx
  on public.nodes (partner_brand_id);
create index if not exists nodes_published_by_idx
  on public.nodes (published_by);
create index if not exists referral_relations_referrer_id_idx
  on public.referral_relations (referrer_id);
create index if not exists support_grant_campaigns_created_by_idx
  on public.support_grant_campaigns (created_by);
create index if not exists support_grants_user_id_idx
  on public.support_grants (user_id);
create index if not exists task_checkpoints_user_id_idx
  on public.task_checkpoints (user_id);
create index if not exists task_events_user_id_idx
  on public.task_events (user_id);
create index if not exists task_runs_node_id_idx
  on public.task_runs (node_id);
create index if not exists withdrawal_requests_user_id_idx
  on public.withdrawal_requests (user_id);
create index if not exists work_submissions_user_id_idx
  on public.work_submissions (user_id);

commit;
