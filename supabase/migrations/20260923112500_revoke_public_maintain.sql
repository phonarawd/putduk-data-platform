-- PostgreSQL 17+ exposes MAINTAIN separately from DML privileges.
-- Client roles do not need database maintenance capabilities.

revoke maintain
on all tables in schema public
from anon, authenticated;

alter default privileges for role postgres in schema public
revoke maintain
on tables
from anon, authenticated;
