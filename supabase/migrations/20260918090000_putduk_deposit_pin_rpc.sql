-- 입금 PIN·공개 토큰은 private 테이블이 진실이다. Data API에 private가 없어
-- service_role RPC로만 읽고 쓴다. PIN 원문은 함수 인자로도 받지 않는다.

begin;

create or replace function public.putduk_deposit_catalog_version()
returns integer
language sql
stable
security definer
set search_path = pg_catalog, public, private
as $$
  select coalesce(
    (select catalog_version from private.deposit_info_catalog where id = 1),
    1
  );
$$;

revoke all on function public.putduk_deposit_catalog_version() from public, anon, authenticated;
grant execute on function public.putduk_deposit_catalog_version() to service_role;

create or replace function public.putduk_security_pin_get(p_user_id uuid)
returns jsonb
language sql
stable
security definer
set search_path = pg_catalog, public, private
as $$
  select to_jsonb(x)
  from (
    select user_id, pin_hash, failed_attempts, locked_until
    from private.security_pins
    where user_id = p_user_id
  ) x;
$$;

revoke all on function public.putduk_security_pin_get(uuid) from public, anon, authenticated;
grant execute on function public.putduk_security_pin_get(uuid) to service_role;

create or replace function public.putduk_security_pin_upsert(
  p_user_id uuid,
  p_pin_hash text,
  p_failed_attempts integer default 0,
  p_locked_until timestamptz default null
)
returns void
language plpgsql
volatile
security definer
set search_path = pg_catalog, public, private
as $$
begin
  insert into private.security_pins (user_id, pin_hash, kdf, failed_attempts, locked_until, updated_at)
  values (p_user_id, p_pin_hash, 'scrypt', coalesce(p_failed_attempts, 0), p_locked_until, now())
  on conflict (user_id) do update
    set pin_hash = excluded.pin_hash,
        kdf = 'scrypt',
        failed_attempts = excluded.failed_attempts,
        locked_until = excluded.locked_until,
        updated_at = now();
end;
$$;

revoke all on function public.putduk_security_pin_upsert(uuid, text, integer, timestamptz) from public, anon, authenticated;
grant execute on function public.putduk_security_pin_upsert(uuid, text, integer, timestamptz) to service_role;

create or replace function public.putduk_security_pin_set_failures(
  p_user_id uuid,
  p_failed_attempts integer,
  p_locked_until timestamptz
)
returns void
language plpgsql
volatile
security definer
set search_path = pg_catalog, public, private
as $$
begin
  update private.security_pins
  set failed_attempts = coalesce(p_failed_attempts, 0),
      locked_until = p_locked_until,
      updated_at = now()
  where user_id = p_user_id;
end;
$$;

revoke all on function public.putduk_security_pin_set_failures(uuid, integer, timestamptz) from public, anon, authenticated;
grant execute on function public.putduk_security_pin_set_failures(uuid, integer, timestamptz) to service_role;

create or replace function public.putduk_security_pin_delete(p_user_id uuid)
returns void
language sql
volatile
security definer
set search_path = pg_catalog, public, private
as $$
  delete from private.security_pins where user_id = p_user_id;
$$;

revoke all on function public.putduk_security_pin_delete(uuid) from public, anon, authenticated;
grant execute on function public.putduk_security_pin_delete(uuid) to service_role;

create or replace function public.putduk_security_pin_ip_get(p_ip_hash text)
returns jsonb
language sql
stable
security definer
set search_path = pg_catalog, public, private
as $$
  select to_jsonb(x)
  from (
    select ip_hash, failed_attempts, locked_until
    from private.security_pin_ip_locks
    where ip_hash = p_ip_hash
  ) x;
$$;

revoke all on function public.putduk_security_pin_ip_get(text) from public, anon, authenticated;
grant execute on function public.putduk_security_pin_ip_get(text) to service_role;

create or replace function public.putduk_security_pin_ip_upsert(
  p_ip_hash text,
  p_failed_attempts integer,
  p_locked_until timestamptz
)
returns void
language plpgsql
volatile
security definer
set search_path = pg_catalog, public, private
as $$
begin
  if p_ip_hash is null or length(trim(p_ip_hash)) = 0 then
    return;
  end if;
  insert into private.security_pin_ip_locks (ip_hash, failed_attempts, locked_until, updated_at)
  values (p_ip_hash, coalesce(p_failed_attempts, 0), p_locked_until, now())
  on conflict (ip_hash) do update
    set failed_attempts = excluded.failed_attempts,
        locked_until = excluded.locked_until,
        updated_at = now();
end;
$$;

revoke all on function public.putduk_security_pin_ip_upsert(text, integer, timestamptz) from public, anon, authenticated;
grant execute on function public.putduk_security_pin_ip_upsert(text, integer, timestamptz) to service_role;

create or replace function public.putduk_deposit_destinations_full()
returns jsonb
language sql
stable
security definer
set search_path = pg_catalog, public, private
as $$
  select coalesce(
    (
      select jsonb_agg(row_to_json(x)::jsonb order by x.created_at asc)
      from (
        select
          d.id,
          d.destination_type,
          d.label,
          d.masked_value,
          d.bank_name,
          d.account_holder,
          d.account_number,
          d.guidance_text,
          d.usdt_network,
          d.usdt_address,
          d.memo,
          d.qr_asset_path,
          d.info_version,
          d.enabled,
          d.encrypted_value,
          d.created_at
        from private.payout_destinations d
        where d.enabled = true
      ) x
    ),
    '[]'::jsonb
  );
$$;

revoke all on function public.putduk_deposit_destinations_full() from public, anon, authenticated;
grant execute on function public.putduk_deposit_destinations_full() to service_role;

comment on function public.putduk_deposit_destinations_full() is
  'PIN 공개 뒤에만 Edge가 호출. 원문 계좌·USDT. anon/authenticated 실행 금지.';

create or replace function public.putduk_deposit_reveal_tokens_lock(
  p_user_id uuid,
  p_scope text,
  p_token_hash text default null
)
returns integer
language plpgsql
volatile
security definer
set search_path = pg_catalog, public, private
as $$
declare
  v_count integer;
begin
  update private.deposit_info_reveal_tokens
  set revoked_at = now()
  where user_id = p_user_id
    and scope = p_scope
    and revoked_at is null
    and (p_token_hash is null or token_hash = p_token_hash);
  get diagnostics v_count = row_count;
  return v_count;
end;
$$;

revoke all on function public.putduk_deposit_reveal_tokens_lock(uuid, text, text) from public, anon, authenticated;
grant execute on function public.putduk_deposit_reveal_tokens_lock(uuid, text, text) to service_role;

create or replace function public.putduk_deposit_reveal_token_insert(
  p_user_id uuid,
  p_token_hash text,
  p_scope text,
  p_catalog_version integer,
  p_expires_at timestamptz
)
returns void
language sql
volatile
security definer
set search_path = pg_catalog, public, private
as $$
  insert into private.deposit_info_reveal_tokens (
    token_hash, user_id, scope, catalog_version, expires_at
  ) values (
    p_token_hash, p_user_id, p_scope, p_catalog_version, p_expires_at
  );
$$;

revoke all on function public.putduk_deposit_reveal_token_insert(uuid, text, text, integer, timestamptz) from public, anon, authenticated;
grant execute on function public.putduk_deposit_reveal_token_insert(uuid, text, text, integer, timestamptz) to service_role;

create or replace function public.putduk_deposit_reveal_token_consume(p_token_hash text)
returns void
language sql
volatile
security definer
set search_path = pg_catalog, public, private
as $$
  update private.deposit_info_reveal_tokens
  set used_at = now()
  where token_hash = p_token_hash
    and used_at is null;
$$;

revoke all on function public.putduk_deposit_reveal_token_consume(text) from public, anon, authenticated;
grant execute on function public.putduk_deposit_reveal_token_consume(text) to service_role;

create or replace function public.putduk_security_pin_audit_write(
  p_user_id uuid,
  p_actor_id uuid,
  p_event text,
  p_scope text,
  p_ip_hash text,
  p_meta jsonb default null
)
returns void
language sql
volatile
security definer
set search_path = pg_catalog, public, private
as $$
  insert into private.security_pin_audit (user_id, actor_id, event, scope, ip_hash, meta)
  values (p_user_id, p_actor_id, p_event, p_scope, p_ip_hash, p_meta);
$$;

revoke all on function public.putduk_security_pin_audit_write(uuid, uuid, text, text, text, jsonb) from public, anon, authenticated;
grant execute on function public.putduk_security_pin_audit_write(uuid, uuid, text, text, text, jsonb) to service_role;

create or replace function public.putduk_admin_security_pin_audit_list(p_admin_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = pg_catalog, public, private
as $$
begin
  perform private.putduk_assert_admin(p_admin_id, array['super_admin', 'finance']);
  return coalesce(
    (
      select jsonb_agg(row_to_json(x)::jsonb)
      from (
        select id, user_id, actor_id, event, scope, created_at
        from private.security_pin_audit
        order by created_at desc
        limit 40
      ) x
    ),
    '[]'::jsonb
  );
end;
$$;

revoke all on function public.putduk_admin_security_pin_audit_list(uuid) from public, anon, authenticated;
grant execute on function public.putduk_admin_security_pin_audit_list(uuid) to service_role;

commit;
