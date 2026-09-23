-- Harden auxiliary member RPCs against stale/deleted/banned/unconfirmed identities.
-- Existing implementations are retained under *_impl names; public entrypoints
-- enforce the same live-member invariant used by the other hardened member RPCs.

alter function public.putduk_member_daily_task_quota(uuid)
  rename to putduk_member_daily_task_quota_impl;

create or replace function public.putduk_member_daily_task_quota(p_user_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = pg_catalog, public, private, extensions
as $function$
begin
  perform private.putduk_assert_live_member(p_user_id);
  return public.putduk_member_daily_task_quota_impl(p_user_id);
end;
$function$;

alter function public.putduk_member_record_session(uuid, text)
  rename to putduk_member_record_session_impl;

create or replace function public.putduk_member_record_session(p_user_id uuid, p_ip text default null)
returns void
language plpgsql
security definer
set search_path = pg_catalog, public, private
as $function$
begin
  perform private.putduk_assert_live_member(p_user_id);
  perform public.putduk_member_record_session_impl(p_user_id, p_ip);
end;
$function$;

alter function public.putduk_member_experience_snapshot(uuid)
  rename to putduk_member_experience_snapshot_impl;

create or replace function public.putduk_member_experience_snapshot(p_user_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public, private, pg_temp
as $function$
begin
  perform private.putduk_assert_live_member(p_user_id);
  return public.putduk_member_experience_snapshot_impl(p_user_id);
end;
$function$;

revoke all on function public.putduk_member_daily_task_quota(uuid) from public, anon, authenticated;
grant execute on function public.putduk_member_daily_task_quota(uuid) to service_role;

revoke all on function public.putduk_member_daily_task_quota_impl(uuid) from public, anon, authenticated;
grant execute on function public.putduk_member_daily_task_quota_impl(uuid) to service_role;

revoke all on function public.putduk_member_record_session(uuid, text) from public, anon, authenticated;
grant execute on function public.putduk_member_record_session(uuid, text) to service_role;

revoke all on function public.putduk_member_record_session_impl(uuid, text) from public, anon, authenticated;
grant execute on function public.putduk_member_record_session_impl(uuid, text) to service_role;

revoke all on function public.putduk_member_experience_snapshot(uuid) from public, anon, authenticated;
grant execute on function public.putduk_member_experience_snapshot(uuid) to service_role;

revoke all on function public.putduk_member_experience_snapshot_impl(uuid) from public, anon, authenticated;
grant execute on function public.putduk_member_experience_snapshot_impl(uuid) to service_role;
