-- Least-privilege hardening for the public API roles.
-- Keep only privileges backed by an actual client-facing policy.
revoke select, insert, update
on all tables in schema public
from anon;

grant select
on public.crew_pulse
to anon;

revoke insert, update
on all tables in schema public
from authenticated;

grant insert, update
on public.task_runs
to authenticated;

grant update (read_at)
on public.notifications
to authenticated;

-- Prevent future public tables from inheriting broad client write access.
alter default privileges for role postgres in schema public
revoke insert, update
on tables
from anon, authenticated;

-- Anonymous access must be granted explicitly per table when a public policy exists.
alter default privileges for role postgres in schema public
revoke select
on tables
from anon;
