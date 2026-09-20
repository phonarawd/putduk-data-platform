create index if not exists task_runs_real_activity_updated_idx
on public.task_runs (updated_at desc)
where status in (
  'in_progress'::public.task_run_status,
  'checkpointed'::public.task_run_status,
  'submitted'::public.task_run_status,
  'review_pending'::public.task_run_status,
  'approved'::public.task_run_status
);
