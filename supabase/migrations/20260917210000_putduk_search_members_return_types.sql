-- search_members RETURN QUERY 컬럼 타입을 선언과 맞춘다.
-- auth.users.email(varchar)이 text 반환과 어긋나 42804가 났다.

create or replace function public.putduk_admin_search_members(
  p_admin_id uuid,
  p_query text default null,
  p_limit integer default 50,
  p_offset integer default 0
)
returns table (
  user_id uuid,
  public_id text,
  display_name text,
  legal_name text,
  email text,
  phone_e164 text,
  member_tier text,
  status public.member_status,
  kyc_status text,
  created_at timestamptz,
  last_login_at timestamptz,
  last_login_ip inet,
  last_sign_in_at timestamptz,
  available_krw numeric,
  referral_count bigint
)
language plpgsql
security definer
stable
set search_path = pg_catalog, public, private, auth
as $$
declare
  v_query text := nullif(lower(trim(coalesce(p_query, ''))), '');
  v_limit integer := least(greatest(coalesce(p_limit, 50), 1), 100);
  v_offset integer := greatest(coalesce(p_offset, 0), 0);
begin
  perform private.putduk_assert_admin(p_admin_id, array['super_admin', 'member_support']);

  return query
  select
    p.id,
    p.public_id,
    p.display_name,
    pp.legal_name,
    coalesce(u.email::text, pp.email_snapshot),
    pp.phone_e164,
    p.member_tier,
    p.status,
    p.kyc_status,
    p.created_at,
    pp.last_login_at,
    pp.last_login_ip,
    u.last_sign_in_at,
    coalesce((
      select w.available_amount
      from public.wallet_accounts w
      where w.user_id = p.id and w.bucket = 'available' and w.currency = 'KRW'
    ), 0::numeric),
    (
      select count(*)::bigint
      from public.referral_relations r
      where r.referrer_id = p.id
    )
  from public.profiles p
  left join private.profile_private pp on pp.user_id = p.id
  left join auth.users u on u.id = p.id
  where v_query is null
     or p.public_id ilike '%' || v_query || '%'
     or p.display_name ilike '%' || v_query || '%'
     or coalesce(pp.legal_name, '') ilike '%' || v_query || '%'
     or coalesce(u.email::text, pp.email_snapshot, '') ilike '%' || v_query || '%'
     or coalesce(pp.phone_e164, '') ilike '%' || v_query || '%'
  order by p.created_at desc
  limit v_limit
  offset v_offset;
end;
$$;

revoke all on function public.putduk_admin_search_members(uuid, text, integer, integer)
  from public, anon, authenticated;
grant execute on function public.putduk_admin_search_members(uuid, text, integer, integer)
  to service_role;
