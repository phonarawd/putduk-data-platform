begin;

create or replace function private.putduk_work_actor_ok(p_user_id uuid)
returns boolean
language sql
stable
security definer
set search_path = pg_catalog, auth
as $function$
  select
    p_user_id is not null
    and exists (
      select 1
      from auth.users u
      where u.id = p_user_id
        and u.email_confirmed_at is not null
        and u.deleted_at is null
        and (u.banned_until is null or u.banned_until <= now())
    )
    and (
      auth.uid() = p_user_id
      or coalesce(auth.role(), '') = 'service_role'
      or (auth.uid() is null and coalesce(auth.role(), '') = '')
    );
$function$;

revoke all on function private.putduk_work_actor_ok(uuid)
  from public, anon, authenticated;
grant execute on function private.putduk_work_actor_ok(uuid)
  to service_role;

alter function public.putduk_member_submit_work(uuid,uuid,text,text,jsonb)
  rename to putduk_member_submit_work_impl;

alter function public.putduk_member_checkpoint_work(uuid,uuid,jsonb)
  rename to putduk_member_checkpoint_work_impl;

create or replace function public.putduk_member_submit_work(
  p_user_id uuid,
  p_task_run_id uuid,
  p_choice_id text,
  p_choice_label text default null,
  p_inspect jsonb default null
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public, private
as $function$
declare
  v_row jsonb;
begin
  perform private.putduk_assert_live_member(p_user_id);
  v_row := public.putduk_member_submit_work_impl(
    p_user_id, p_task_run_id, p_choice_id, p_choice_label, p_inspect
  );
  return v_row;
end;
$function$;

create or replace function public.putduk_member_checkpoint_work(
  p_user_id uuid,
  p_task_run_id uuid,
  p_payload jsonb default '{}'::jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public, private
as $function$
declare
  v_row jsonb;
begin
  perform private.putduk_assert_live_member(p_user_id);
  v_row := public.putduk_member_checkpoint_work_impl(
    p_user_id, p_task_run_id, p_payload
  );
  return v_row;
end;
$function$;

revoke all on function public.putduk_member_submit_work(uuid,uuid,text,text,jsonb)
  from public, anon, authenticated;
revoke all on function public.putduk_member_checkpoint_work(uuid,uuid,jsonb)
  from public, anon, authenticated;

grant execute on function public.putduk_member_submit_work(uuid,uuid,text,text,jsonb)
  to service_role;
grant execute on function public.putduk_member_checkpoint_work(uuid,uuid,jsonb)
  to service_role;

commit;