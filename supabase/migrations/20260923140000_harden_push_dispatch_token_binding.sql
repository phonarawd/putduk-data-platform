drop function if exists public.putduk_push_mark_outbox_dispatched(uuid, text);
drop function if exists public.putduk_push_mark_outbox_failed(uuid, text);
drop function if exists public.putduk_push_authorize_dispatch(uuid, uuid, text, text, text);

create or replace function public.putduk_push_authorize_dispatch(
  p_notification_id uuid,
  p_user_id uuid,
  p_title text,
  p_body text,
  p_notification_type text default 'info'
)
returns table(
  user_id uuid,
  title text,
  body text,
  notification_type text,
  dispatch_token uuid
)
language plpgsql
set search_path = pg_catalog, public, private
as $function$
begin
  return query
  update private.push_outbox o
  set dispatch_claimed_at = now(),
      dispatch_token = gen_random_uuid()
  where o.notification_id = p_notification_id
    and o.dispatched_at is null
    and o.user_id = p_user_id
    and o.title = p_title
    and o.body = p_body
    and o.notification_type = coalesce(nullif(trim(p_notification_type), ''), 'info')
    and (
      o.dispatch_token is null
      or o.dispatch_claimed_at < now() - interval '15 minutes'
    )
  returning o.user_id, o.title, o.body, o.notification_type, o.dispatch_token;
end;
$function$;

create or replace function public.putduk_push_mark_outbox_dispatched(
  p_notification_id uuid,
  p_dispatch_token uuid,
  p_last_error text default null
)
returns void
language plpgsql
set search_path = pg_catalog, public, private
as $function$
begin
  update private.push_outbox
  set dispatched_at = now(),
      dispatch_claimed_at = null,
      dispatch_token = null,
      last_error = nullif(trim(coalesce(p_last_error, '')), '')
  where notification_id = p_notification_id
    and dispatched_at is null
    and dispatch_token = p_dispatch_token;
end;
$function$;

create or replace function public.putduk_push_mark_outbox_failed(
  p_notification_id uuid,
  p_dispatch_token uuid,
  p_last_error text
)
returns void
language plpgsql
set search_path = pg_catalog, public, private
as $function$
begin
  update private.push_outbox
  set dispatch_claimed_at = null,
      dispatch_token = null,
      last_error = nullif(trim(coalesce(p_last_error, '')), '')
  where notification_id = p_notification_id
    and dispatched_at is null
    and dispatch_token = p_dispatch_token;
end;
$function$;

revoke all on function public.putduk_push_authorize_dispatch(uuid, uuid, text, text, text) from public, anon, authenticated;
grant execute on function public.putduk_push_authorize_dispatch(uuid, uuid, text, text, text) to service_role;

revoke all on function public.putduk_push_mark_outbox_dispatched(uuid, uuid, text) from public, anon, authenticated;
grant execute on function public.putduk_push_mark_outbox_dispatched(uuid, uuid, text) to service_role;

revoke all on function public.putduk_push_mark_outbox_failed(uuid, uuid, text) from public, anon, authenticated;
grant execute on function public.putduk_push_mark_outbox_failed(uuid, uuid, text) to service_role;
