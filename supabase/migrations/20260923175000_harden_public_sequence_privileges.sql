-- Client roles do not need direct access to public sequences.
revoke all privileges
on all sequences in schema public
from anon, authenticated;

alter default privileges for role postgres in schema public
revoke all privileges
on sequences
from anon, authenticated;
