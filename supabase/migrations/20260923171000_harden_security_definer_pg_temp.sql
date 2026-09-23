-- Defense-in-depth for SECURITY DEFINER trigger functions reachable from client writes
-- and Auth user lifecycle events.
-- Keep the existing trusted search_path unchanged; explicitly place pg_temp last
-- so temporary objects cannot shadow trusted unqualified names.
alter function private.handle_new_putduk_user()
  set search_path to public, private, extensions, pg_temp;

alter function private.putduk_activate_confirmed_user()
  set search_path to pg_catalog, public, private, pg_temp;

alter function private.putduk_guard_deposit_approval_proof()
  set search_path to pg_catalog, public, private, pg_temp;

alter function private.putduk_guard_deposit_destination_contract()
  set search_path to pg_catalog, public, private, pg_temp;

alter function private.sync_node_catalog_metadata()
  set search_path to pg_catalog, public, private, pg_temp;

alter function private.putduk_enqueue_push_notification()
  set search_path to pg_catalog, public, private, extensions, pg_temp;

alter function private.putduk_guard_trial_withdraw_used_at()
  set search_path to pg_catalog, public, private, pg_temp;

alter function private.guard_putduk_task_assignment_catalog()
  set search_path to pg_catalog, public, private, pg_temp;

alter function private.enforce_putduk_submit_minimum_duration()
  set search_path to pg_catalog, public, private, pg_temp;

alter function private.guard_putduk_task_run_catalog()
  set search_path to pg_catalog, public, private, pg_temp;

alter function private.guard_putduk_task_run_update()
  set search_path to pg_catalog, public, private, extensions, pg_temp;

alter function private.prepare_putduk_task_run()
  set search_path to pg_catalog, public, private, extensions, pg_temp;

alter function private.putduk_materialize_work_items()
  set search_path to pg_catalog, public, private, pg_temp;

alter function private.record_putduk_task_run_started()
  set search_path to pg_catalog, public, private, extensions, pg_temp;

alter function private.resume_putduk_rework_run()
  set search_path to pg_catalog, public, private, pg_temp;

alter function private.putduk_bind_work_contract()
  set search_path to pg_catalog, public, private, pg_temp;
