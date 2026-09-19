-- Web Push 구독·발송 대기열·알림 INSERT 훅

begin;

create extension if not exists pg_net with schema extensions;

create table if not exists private.putduk_system_config (
  key text primary key,
  value text not null,
  updated_at timestamptz not null default now()
);

revoke all on table private.putduk_system_config from public, anon, authenticated;
grant select, insert, update, delete on table private.putduk_system_config to service_role;

insert into private.putduk_system_config (key, value)
values (
  'push_dispatch_url',
  'https://gaugwamwceqdnqdqrxqg.supabase.co/functions/v1/push-dispatch'
)
on conflict (key) do nothing;

create table if not exists private.push_subscriptions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  endpoint text not null,
  p256dh text not null,
  auth_key text not null,
  user_agent text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, endpoint)
);

create index if not exists push_subscriptions_user_idx on private.push_subscriptions (user_id);

revoke all on table private.push_subscriptions from public, anon, authenticated;
grant select, insert, update, delete on table private.push_subscriptions to service_role;

create table if not exists private.push_outbox (
  id uuid primary key default gen_random_uuid(),
  notification_id uuid not null references public.notifications(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  title text not null,
  body text not null,
  notification_type text not null default 'info',
  created_at timestamptz not null default now(),
  dispatched_at timestamptz,
  last_error text
);

create index if not exists push_outbox_pending_idx
  on private.push_outbox (created_at)
  where dispatched_at is null;

revoke all on table private.push_outbox from public, anon, authenticated;
grant select, insert, update, delete on table private.push_outbox to service_role;

create or replace function public.putduk_push_upsert_subscription(
  p_user_id uuid,
  p_endpoint text,
  p_p256dh text,
  p_auth_key text,
  p_user_agent text default null
)
returns uuid
language plpgsql
volatile
set search_path = pg_catalog, public, private
as $$
declare
  v_id uuid;
begin
  if p_user_id is null
     or nullif(trim(coalesce(p_endpoint, '')), '') is null
     or nullif(trim(coalesce(p_p256dh, '')), '') is null
     or nullif(trim(coalesce(p_auth_key, '')), '') is null
  then
    raise exception using errcode = '22023', message = '푸시 구독 정보가 올바르지 않습니다.';
  end if;

  insert into private.push_subscriptions (user_id, endpoint, p256dh, auth_key, user_agent, updated_at)
  values (
    p_user_id,
    trim(p_endpoint),
    trim(p_p256dh),
    trim(p_auth_key),
    nullif(trim(coalesce(p_user_agent, '')), ''),
    now()
  )
  on conflict (user_id, endpoint) do update
    set p256dh = excluded.p256dh,
        auth_key = excluded.auth_key,
        user_agent = excluded.user_agent,
        updated_at = now()
  returning id into v_id;

  return v_id;
end;
$$;

revoke all on function public.putduk_push_upsert_subscription(uuid, text, text, text, text) from public, anon, authenticated;
grant execute on function public.putduk_push_upsert_subscription(uuid, text, text, text, text) to service_role;

create or replace function public.putduk_push_remove_subscription(
  p_user_id uuid,
  p_endpoint text default null
)
returns integer
language plpgsql
volatile
set search_path = pg_catalog, public, private
as $$
declare
  v_count integer;
begin
  if p_user_id is null then
    raise exception using errcode = '22023', message = '회원 정보가 필요합니다.';
  end if;

  if nullif(trim(coalesce(p_endpoint, '')), '') is null then
    delete from private.push_subscriptions where user_id = p_user_id;
  else
    delete from private.push_subscriptions
    where user_id = p_user_id and endpoint = trim(p_endpoint);
  end if;

  get diagnostics v_count = row_count;
  return v_count;
end;
$$;

revoke all on function public.putduk_push_remove_subscription(uuid, text) from public, anon, authenticated;
grant execute on function public.putduk_push_remove_subscription(uuid, text) to service_role;

create or replace function public.putduk_push_list_subscriptions(p_user_id uuid)
returns table (
  id uuid,
  endpoint text,
  p256dh text,
  auth_key text,
  user_agent text
)
language sql
stable
set search_path = pg_catalog, public, private
as $$
  select s.id, s.endpoint, s.p256dh, s.auth_key, s.user_agent
  from private.push_subscriptions s
  where s.user_id = p_user_id
  order by s.updated_at desc;
$$;

revoke all on function public.putduk_push_list_subscriptions(uuid) from public, anon, authenticated;
grant execute on function public.putduk_push_list_subscriptions(uuid) to service_role;

create or replace function public.putduk_push_mark_outbox_dispatched(
  p_notification_id uuid,
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
      last_error = nullif(trim(coalesce(p_last_error, '')), '')
  where notification_id = p_notification_id
    and dispatched_at is null;
end;
$$;

revoke all on function public.putduk_push_mark_outbox_dispatched(uuid, text) from public, anon, authenticated;
grant execute on function public.putduk_push_mark_outbox_dispatched(uuid, text) to service_role;

create or replace function private.putduk_enqueue_push_notification()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, public, private, extensions
as $$
declare
  v_url text;
  v_secret text;
  v_request_id bigint;
begin
  if new.user_id is null then
    return new;
  end if;

  insert into private.push_outbox (notification_id, user_id, title, body, notification_type)
  values (new.id, new.user_id, new.title, new.body, coalesce(new.notification_type, 'info'));

  select value into v_url from private.putduk_system_config where key = 'push_dispatch_url' limit 1;
  select value into v_secret from private.putduk_system_config where key = 'push_dispatch_secret' limit 1;

  if v_url is null or v_secret is null then
    return new;
  end if;

  select net.http_post(
    url := v_url,
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'x-push-dispatch-secret', v_secret
    ),
    body := jsonb_build_object(
      'notification_id', new.id,
      'user_id', new.user_id,
      'title', new.title,
      'body', new.body,
      'notification_type', coalesce(new.notification_type, 'info')
    )
  ) into v_request_id;

  return new;
exception
  when others then
    return new;
end;
$$;

revoke all on function private.putduk_enqueue_push_notification() from public, anon, authenticated;
grant execute on function private.putduk_enqueue_push_notification() to service_role;

drop trigger if exists putduk_notifications_push_enqueue on public.notifications;
create trigger putduk_notifications_push_enqueue
  after insert on public.notifications
  for each row
  execute function private.putduk_enqueue_push_notification();

comment on table private.push_subscriptions is '회원 Web Push 구독(endpoint·키). service_role 전용.';
comment on table private.push_outbox is '알림 INSERT 후 푸시 발송 대기열. service_role 전용.';

commit;
