-- Prevent future public functions from inheriting client EXECUTE privileges.
-- Individual client-facing functions must opt in explicitly when needed.
alter default privileges for role postgres in schema public
revoke execute on functions
from anon, authenticated;
