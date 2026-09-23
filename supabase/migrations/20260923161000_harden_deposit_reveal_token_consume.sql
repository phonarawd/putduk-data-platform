-- Deposit reveal token defense-in-depth.
-- A token can only transition to used_at while it is still valid and not revoked.
-- The function remains service_role-only and is not a client-facing token validator.

begin;

create or replace function public.putduk_deposit_reveal_token_consume(p_token_hash text)
returns void
language sql
volatile
security definer
set search_path = pg_catalog, public, private
as $$
  update private.deposit_info_reveal_tokens
  set used_at = now()
  where token_hash = nullif(trim(p_token_hash), '')
    and used_at is null
    and revoked_at is null
    and expires_at > now();
$$;

revoke all on function public.putduk_deposit_reveal_token_consume(text)
  from public, anon, authenticated;
grant execute on function public.putduk_deposit_reveal_token_consume(text)
  to service_role;

commit;
