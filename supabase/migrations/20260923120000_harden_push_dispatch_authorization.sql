-- push-dispatch 요청을 실제 outbox 상태와 묶어 arbitrary dispatch/replay 경로를 닫는다.

begin;

create unique index if not exists push_outbox_notification_id_uidx
  on private.push_outbox (notification_id);

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
  notification_type text
)
language sql
stable
set search_path = pg_catalog, public, private
as $$
  select
    o.user_id,
    o.title,
    o.body,
    o.notification_type
  from private.push_outbox o
  where o.notification_id = p_notification_id
    and o.dispatched_at is null
    and o.user_id = p_user_id
    and o.title = p_title
    and o.body = p_body
    and o.notification_type = coalesce(nullif(trim(p_notification_type), ''), 'info')
  limit 1;
$$;

revoke all on function public.putduk_push_authorize_dispatch(uuid, uuid, text, text, text)
  from public, anon, authenticated;
grant execute on function public.putduk_push_authorize_dispatch(uuid, uuid, text, text, text)
  to service_role;

create or replace function public.putduk_push_mark_outbox_failed(
  p_notification_id uuid,
  p_last_error text
)
returns void
language plpgsql
volatile
set search_path = pg_catalog, public, private
as $$
begin
  update private.push_outbox
  set last_error = nullif(trim(coalesce(p_last_error, '')), '')
  where notification_id = p_notification_id
    and dispatched_at is null;
end;
$$;

revoke all on function public.putduk_push_mark_outbox_failed(uuid, text)
  from public, anon, authenticated;
grant execute on function public.putduk_push_mark_outbox_failed(uuid, text)
  to service_role;

commit;
