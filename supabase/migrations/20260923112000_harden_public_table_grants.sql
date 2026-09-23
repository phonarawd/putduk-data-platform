-- Defense-in-depth: public API roles do not need structural/destructive table privileges.
-- Keep normal SELECT/INSERT/UPDATE grants and let RLS/policies control row access.

revoke delete, references, trigger, truncate
on all tables in schema public
from anon, authenticated;

alter default privileges for role postgres in schema public
revoke delete, references, trigger, truncate
on tables
from anon, authenticated;
