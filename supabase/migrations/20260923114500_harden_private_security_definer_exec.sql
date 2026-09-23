-- Defense-in-depth for private SECURITY DEFINER functions.
-- Trigger-only functions never need direct client EXECUTE.
revoke execute on function private.guard_putduk_task_assignment_catalog() from anon, authenticated;
revoke execute on function private.guard_putduk_task_run_catalog() from anon, authenticated;
revoke execute on function private.putduk_bind_work_contract() from anon, authenticated;
revoke execute on function private.putduk_materialize_work_items() from anon, authenticated;
revoke execute on function private.putduk_guard_trial_withdraw_used_at() from anon, authenticated;

-- Future private functions created by postgres should not inherit client EXECUTE.
alter default privileges for role postgres in schema private
revoke execute on functions
from anon, authenticated;

-- This helper is referenced directly by an RLS policy, so authenticated EXECUTE must remain.
-- But authenticated callers may only query their own assignment state.
create or replace function private.putduk_has_active_assignment(
  p_user_id uuid,
  p_node_id uuid,
  p_partner_brand_id uuid
)
returns boolean
language sql
stable
security definer
set search_path = 'pg_catalog', 'public', 'private'
set row_security = off
as $function$
  select exists (
    select 1
    from public.task_assignments a
    where a.user_id = p_user_id
      and a.node_id = p_node_id
      and a.partner_brand_id = p_partner_brand_id
      and a.status = 'active'
      and (a.visible_from is null or a.visible_from <= now())
      and (a.visible_until is null or a.visible_until >= now())
      and (auth.uid() is null or p_user_id = auth.uid())
  );
$function$;
