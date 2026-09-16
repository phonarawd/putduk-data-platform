-- 신규 PUTDUK 프로젝트 전용 회원 초기화 트리거
-- auth.users가 만들어질 때 공개 프로필·비공개 프로필·지갑 기본 행을 함께 준비한다.

alter table private.profile_private
  add column if not exists terms_version text,
  add column if not exists privacy_version text,
  add column if not exists marketing_opt_in boolean not null default false;

create or replace function private.handle_new_putduk_user()
returns trigger
language plpgsql
security definer
set search_path = public, private, extensions
as $$
declare
  v_public_id text;
  v_referral_code text;
  v_referrer_id uuid;
  v_campaign_id uuid;
  v_support_amount numeric(18,2) := 0;
  v_birth_date date;
  v_metadata jsonb := coalesce(new.raw_user_meta_data, '{}'::jsonb);
  v_suffix text;
begin
  v_suffix := upper(substr(replace(new.id::text, '-', ''), 1, 6));
  v_public_id := 'PDK-' || to_char(coalesce(new.created_at, now()), 'YY') || '-' || v_suffix || '-' || lpad((floor(random() * 100000))::int::text, 5, '0');
  while exists (select 1 from public.profiles where public_id = v_public_id) loop
    v_public_id := 'PDK-' || to_char(coalesce(new.created_at, now()), 'YY') || '-' || v_suffix || '-' || lpad((floor(random() * 100000))::int::text, 5, '0');
  end loop;

  v_referral_code := 'PDK' || upper(substr(replace(new.id::text, '-', ''), 1, 9));
  begin
    v_birth_date := nullif(v_metadata ->> 'birth_date', '')::date;
  exception when others then
    v_birth_date := null;
  end;

  insert into public.profiles (id, public_id, display_name, status, referral_code)
  values (
    new.id,
    v_public_id,
    coalesce(nullif(v_metadata ->> 'display_name', ''), '퍼뜩 회원'),
    'pending',
    v_referral_code
  )
  on conflict (id) do nothing;

  insert into private.profile_private (
    user_id, legal_name, birth_date, phone_e164, email_snapshot,
    terms_version, privacy_version, marketing_opt_in
  )
  values (
    new.id,
    nullif(v_metadata ->> 'legal_name', ''),
    v_birth_date,
    nullif(v_metadata ->> 'phone_e164', ''),
    new.email,
    nullif(v_metadata ->> 'terms_version', ''),
    nullif(v_metadata ->> 'privacy_version', ''),
    coalesce((v_metadata ->> 'marketing_opt_in')::boolean, false)
  )
  on conflict (user_id) do nothing;

  insert into public.wallet_accounts (user_id, bucket, currency, available_amount, held_amount)
  values
    (new.id, 'task_reward', 'KRW', 0, 0),
    (new.id, 'referral_reward', 'KRW', 0, 0),
    (new.id, 'available', 'KRW', 0, 0),
    (new.id, 'held', 'KRW', 0, 0)
  on conflict (user_id, bucket, currency) do nothing;

  select id, amount
    into v_campaign_id, v_support_amount
  from public.support_grant_campaigns
  where enabled = true
    and trigger_type = 'signup'
    and starts_at <= now()
    and (ends_at is null or ends_at > now())
  order by starts_at desc
  limit 1;

  if v_campaign_id is not null then
    insert into public.support_grants (campaign_id, user_id, amount, status, expires_at)
    values (
      v_campaign_id,
      new.id,
      coalesce(v_support_amount, 0),
      'available',
      (select case when expires_in_days is null then null else now() + make_interval(days => expires_in_days) end from public.support_grant_campaigns where id = v_campaign_id)
    )
    on conflict (campaign_id, user_id) do nothing;

    insert into public.wallet_accounts (user_id, bucket, currency, available_amount, held_amount)
    values (new.id, 'support_grant', 'KRW', coalesce(v_support_amount, 0), 0)
    on conflict (user_id, bucket, currency) do update
      set available_amount = excluded.available_amount,
          updated_at = now();
  else
    insert into public.wallet_accounts (user_id, bucket, currency, available_amount, held_amount)
    values (new.id, 'support_grant', 'KRW', 0, 0)
    on conflict (user_id, bucket, currency) do nothing;
  end if;

  select id into v_referrer_id
  from public.profiles
  where referral_code = upper(nullif(v_metadata ->> 'referral_code', ''))
    and id <> new.id
  limit 1;

  if v_referrer_id is not null then
    insert into public.referral_relations (referrer_id, invitee_id, status)
    values (v_referrer_id, new.id, 'joined')
    on conflict (invitee_id) do nothing;
  end if;

  return new;
end;
$$;

revoke all on function private.handle_new_putduk_user() from public, anon, authenticated;

do $$
begin
  if not exists (
    select 1 from pg_trigger
    where tgname = 'on_auth_user_created_putduk'
      and tgrelid = 'auth.users'::regclass
  ) then
    create trigger on_auth_user_created_putduk
      after insert on auth.users
      for each row execute function private.handle_new_putduk_user();
  end if;
end;
$$;
