-- Least-privilege Storage table grants for API roles.
-- Bucket metadata does not require client table privileges.
revoke all privileges on table storage.buckets
from anon, authenticated;

-- The application creates signed upload URLs server-side and the browser
-- uploads through the signed URL. Keep only the authenticated INSERT path
-- already protected by the putduk-private RLS policy; remove direct read,
-- update, and delete table access.
revoke all privileges on table storage.objects
from anon, authenticated;

grant insert on table storage.objects
to authenticated;

-- Do not alter the Storage schema structure or Supabase-managed defaults.
