-- Defense-in-depth for the SECURITY DEFINER helper invoked by a client-visible RLS policy.
-- Preserve the existing authorization semantics; only place pg_temp last.
alter function private.putduk_has_active_assignment(uuid, uuid, uuid)
  set search_path to pg_catalog, public, private, pg_temp;