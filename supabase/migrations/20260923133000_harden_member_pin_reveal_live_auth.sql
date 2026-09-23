begin;

alter function public.putduk_security_pin_get(uuid) rename to putduk_security_pin_get_impl;
alter function public.putduk_security_pin_upsert(uuid,text,integer,timestamptz) rename to putduk_security_pin_upsert_impl;
alter function public.putduk_security_pin_set_failures(uuid,integer,timestamptz) rename to putduk_security_pin_set_failures_impl;
alter function public.putduk_deposit_reveal_tokens_lock(uuid,text,text) rename to putduk_deposit_reveal_tokens_lock_impl;
alter function public.putduk_deposit_reveal_token_insert(uuid,text,text,integer,timestamptz) rename to putduk_deposit_reveal_token_insert_impl;

create or replace function public.putduk_security_pin_get(p_user_id uuid)
returns jsonb language plpgsql stable security definer
set search_path = pg_catalog, public, private
as $function$
declare v_row jsonb;
begin
  perform private.putduk_assert_live_member(p_user_id);
  v_row := public.putduk_security_pin_get_impl(p_user_id);
  return v_row;
end;
$function$;

create or replace function public.putduk_security_pin_upsert(
  p_user_id uuid,p_pin_hash text,p_failed_attempts integer default 0,p_locked_until timestamptz default null
)
returns void language plpgsql security definer
set search_path = pg_catalog, public, private
as $function$
begin
  perform private.putduk_assert_live_member(p_user_id);
  perform public.putduk_security_pin_upsert_impl(p_user_id,p_pin_hash,p_failed_attempts,p_locked_until);
end;
$function$;

create or replace function public.putduk_security_pin_set_failures(
  p_user_id uuid,p_failed_attempts integer,p_locked_until timestamptz
)
returns void language plpgsql security definer
set search_path = pg_catalog, public, private
as $function$
begin
  perform private.putduk_assert_live_member(p_user_id);
  perform public.putduk_security_pin_set_failures_impl(p_user_id,p_failed_attempts,p_locked_until);
end;
$function$;

create or replace function public.putduk_deposit_reveal_tokens_lock(
  p_user_id uuid,p_scope text,p_token_hash text default null
)
returns integer language plpgsql security definer
set search_path = pg_catalog, public, private
as $function$
declare v_count integer;
begin
  perform private.putduk_assert_live_member(p_user_id);
  v_count := public.putduk_deposit_reveal_tokens_lock_impl(p_user_id,p_scope,p_token_hash);
  return v_count;
end;
$function$;

create or replace function public.putduk_deposit_reveal_token_insert(
  p_user_id uuid,p_token_hash text,p_scope text,p_catalog_version integer,p_expires_at timestamptz
)
returns void language plpgsql security definer
set search_path = pg_catalog, public, private
as $function$
begin
  perform private.putduk_assert_live_member(p_user_id);
  perform public.putduk_deposit_reveal_token_insert_impl(p_user_id,p_token_hash,p_scope,p_catalog_version,p_expires_at);
end;
$function$;

revoke all on function public.putduk_security_pin_get(uuid) from public,anon,authenticated;
revoke all on function public.putduk_security_pin_upsert(uuid,text,integer,timestamptz) from public,anon,authenticated;
revoke all on function public.putduk_security_pin_set_failures(uuid,integer,timestamptz) from public,anon,authenticated;
revoke all on function public.putduk_deposit_reveal_tokens_lock(uuid,text,text) from public,anon,authenticated;
revoke all on function public.putduk_deposit_reveal_token_insert(uuid,text,text,integer,timestamptz) from public,anon,authenticated;

grant execute on function public.putduk_security_pin_get(uuid) to service_role;
grant execute on function public.putduk_security_pin_upsert(uuid,text,integer,timestamptz) to service_role;
grant execute on function public.putduk_security_pin_set_failures(uuid,integer,timestamptz) to service_role;
grant execute on function public.putduk_deposit_reveal_tokens_lock(uuid,text,text) to service_role;
grant execute on function public.putduk_deposit_reveal_token_insert(uuid,text,text,integer,timestamptz) to service_role;

commit;