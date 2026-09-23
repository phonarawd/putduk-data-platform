-- Revoke PUBLIC EXECUTE from internal trigger helpers.
revoke execute on function private.guard_putduk_task_assignment_catalog() from public;
revoke execute on function private.guard_putduk_task_run_catalog() from public;
revoke execute on function private.putduk_bind_work_contract() from public;
revoke execute on function private.putduk_materialize_work_items() from public;
revoke execute on function private.putduk_guard_trial_withdraw_used_at() from public;

-- This helper is referenced by an authenticated RLS policy.
-- Keep authenticated/service_role execution, but never expose it through PUBLIC.
revoke execute on function private.putduk_has_active_assignment(uuid,uuid,uuid) from public;
grant execute on function private.putduk_has_active_assignment(uuid,uuid,uuid) to authenticated, service_role;

-- Internal private functions should not inherit PUBLIC EXECUTE going forward.
alter default privileges for role postgres in schema private
revoke execute on functions from public;
