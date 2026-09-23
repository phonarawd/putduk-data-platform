-- dispatch claim을 원자적으로 소유해 동시 발송과 stale worker의 결과 덮어쓰기를 방지한다.

begin;

alter table private.push_outbox
  add column if not exists dispatch_claimed_at timestamptz,
  add column if not exists dispatch_token uuid;

create or replace function public.putduk_push_authorize_dispatch(
  p_notification_id uuid,
  p_user_id uuid,
  p_title text,
  p_body text,
  p_notification_type text default 'info'
)
returns table (
  user_id uuid,
  title text,
  body text,
  notification_type text,
  dispatch_token uuid
)
language plpgsql
volatile
set search_path = pg_catalog, public, private
as $$
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
$$;

revoke all on function public.putduk_push_authorize_dispatch(uuid, uuid, text, text, text)
  from public, anon, authenticated;
grant execute on function public.putduk_push_authorize_dispatch(uuid, uuid, text, text, text)
  to service_role;

create or replace function public.putduk_push_mark_outbox_dispatched(
  p_notification_id uuid,
  p_dispatch_token uuid,
  p_last_error text default null
)
returns void
language plpgsql
volatile
set search_path = pg_catalog, public, private
as $$
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
$$;

revoke all on function public.putduk_push_mark_outbox_dispatched(uuid, uuid, text)
  from public, anon, authenticated;
grant execute on function public.putduk_push_mark_outbox_dispatched(uuid, uuid, text)
  to service_role;

create or replace function public.putduk_push_mark_outbox_failed(
  p_notification_id uuid,
  p_dispatch_token uuid,
  p_last_error text
)
returns void
language plpgsql
volatile
set search_path = pg_catalog, public, private
as $$
begin
  update private.push_outbox
  set dispatch_claimed_at = null,
      dispatch_token = null,
      last_error = nullif(trim(coalesce(p_last_error, '')), '')
  where notification_id = p_notification_id
    and dispatched_at is null
    and dispatch_token = p_dispatch_token;
end;
$$;

revoke all on function public.putduk_push_mark_outbox_failed(uuid, uuid, text)
  from public, anon, authenticated;
grant execute on function public.putduk_push_mark_outbox_failed(uuid, uuid, text)
  to service_role;

commit;
