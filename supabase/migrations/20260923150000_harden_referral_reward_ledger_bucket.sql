CREATE OR REPLACE FUNCTION public.putduk_admin_review_referral(p_admin_id uuid, p_relation_id uuid, p_decision text, p_reason text DEFAULT NULL::text, p_force boolean DEFAULT false)
 RETURNS private.referral_rewards
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public', 'private', 'extensions'
AS $function$
declare
  v_rel public.referral_relations%rowtype;
  v_reward private.referral_rewards%rowtype;
  v_decision text := lower(trim(coalesce(p_decision, '')));
  v_reason text := nullif(left(trim(coalesce(p_reason, '')), 500), '');
  v_now timestamptz := now();
  v_has_deposit boolean := false;
  v_has_work boolean := false;
  v_signals jsonb := '{}'::jsonb;
begin
  perform private.putduk_assert_admin(p_admin_id, array['super_admin', 'finance', 'member_support']);
  if v_decision not in ('approved', 'rejected', 'held') then
    raise exception using errcode = '22023', message = '추천 보상 결과를 선택해 주세요.';
  end if;
  select * into v_rel from public.referral_relations where id = p_relation_id for update;
  if not found then
    raise exception using errcode = 'P0002', message = '추천 관계를 찾을 수 없습니다.';
  end if;
  select exists (select 1 from public.deposit_requests d where d.user_id = v_rel.invitee_id and d.status = 'approved') into v_has_deposit;
  select exists (select 1 from public.task_runs t where t.user_id = v_rel.invitee_id and t.status = 'approved') into v_has_work;
  v_signals := jsonb_build_object(
    'invitee_active', exists (select 1 from public.profiles p where p.id = v_rel.invitee_id and p.status = 'active'),
    'has_deposit', v_has_deposit,
    'has_approved_work', v_has_work,
    'same_ip', exists (
      select 1 from private.profile_private a
      join private.profile_private b on b.last_login_ip = a.last_login_ip
      where a.user_id = v_rel.referrer_id and b.user_id = v_rel.invitee_id and a.last_login_ip is not null
    ),
    'same_phone', exists (
      select 1 from private.profile_private a
      join private.profile_private b on b.phone_e164 = a.phone_e164
      where a.user_id = v_rel.referrer_id and b.user_id = v_rel.invitee_id and a.phone_e164 is not null
    )
  );
  insert into private.referral_rewards (relation_id, referrer_id, amount, status, risk_signals)
  values (v_rel.id, v_rel.referrer_id, 5000, 'held', v_signals)
  on conflict (relation_id) do update set risk_signals = excluded.risk_signals
  returning * into v_reward;
  if v_reward.status = 'posted' and v_decision = 'approved' then return v_reward; end if;
  if v_decision = 'held' then
    update public.referral_relations set status = 'held', updated_at = v_now where id = v_rel.id;
    update private.referral_rewards set status = 'held', decided_by = p_admin_id, decided_at = v_now,
      decision_reason = v_reason, risk_signals = v_signals where id = v_reward.id returning * into v_reward;
    return v_reward;
  end if;
  if v_decision = 'rejected' then
    if v_reason is null then raise exception using errcode = '22023', message = '반려 사유를 입력해 주세요.'; end if;
    update public.referral_relations set status = 'rejected', updated_at = v_now where id = v_rel.id;
    update private.referral_rewards set status = 'reversed', decided_by = p_admin_id, decided_at = v_now,
      decision_reason = v_reason, risk_signals = v_signals where id = v_reward.id returning * into v_reward;
    insert into public.notifications (user_id, title, body, notification_type)
    values (v_rel.referrer_id, '추천 보상이 반려됐어요', '운영자 안내: ' || v_reason, 'referral');
    return v_reward;
  end if;
  if not coalesce(p_force, false) and (
    not (v_signals ->> 'invitee_active')::boolean or not v_has_deposit or not v_has_work
  ) then
    raise exception using errcode = '23514', message = '추천 회원 활성화·입금·업무 수행이 확인된 뒤에만 지급할 수 있습니다.';
  end if;
  update public.referral_relations set status = 'paid', updated_at = v_now where id = v_rel.id;
  update private.referral_rewards set status = 'posted', decided_by = p_admin_id, decided_at = v_now,
    decision_reason = v_reason, risk_signals = v_signals where id = v_reward.id returning * into v_reward;
  perform private.putduk_apply_bucket_delta(
    v_rel.referrer_id, 'available', 'KRW', 5000, 0,
    'referral_reward_posted', 'referral_relation', v_rel.id, 'referral-reward:' || v_rel.id::text, p_admin_id
  );
  insert into public.notifications (user_id, title, body, notification_type)
  values (v_rel.referrer_id, '추천 보상이 지급됐어요', '추천 조건이 충족되어 5,000원이 지갑에 반영됐어요.', 'referral');
  return v_reward;
end;
$function$
;

CREATE OR REPLACE FUNCTION private.putduk_apply_ledger(p_user_id uuid, p_buckets text[], p_currency text, p_amount numeric, p_entry_type text, p_reference_type text, p_reference_id uuid, p_idempotency_key text, p_created_by uuid)
 RETURNS boolean
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public', 'private', 'extensions'
AS $function$
declare
  v_inserted integer := 0;
  v_bucket text;
begin
  if p_user_id is null or p_amount is null or p_idempotency_key is null then
    raise exception using errcode = '22023', message = '원장 정보가 부족합니다.';
  end if;

  if p_buckets is null or cardinality(p_buckets) <> 1 or p_buckets[1] is null then
    raise exception using errcode = '22023', message = '원장 bucket은 하나만 지정할 수 있습니다.';
  end if;

  if p_buckets is null or cardinality(p_buckets) <> 1 or p_buckets[1] is null then
    raise exception using errcode = '22023', message = '원장 bucket은 하나만 지정할 수 있습니다.';
  end if;

  if p_currency not in ('KRW', 'USDT') then
    raise exception using errcode = '22023', message = '지원하지 않는 통화입니다.';
  end if;

  perform pg_advisory_xact_lock(
    hashtextextended('putduk-wallet:' || p_user_id::text || ':' || p_currency, 0)
  );

  foreach v_bucket in array p_buckets
  loop
    insert into public.wallet_accounts (user_id, bucket, currency, available_amount, held_amount)
    values (p_user_id, v_bucket, p_currency, 0, 0)
    on conflict (user_id, bucket, currency) do nothing;
  end loop;

  insert into private.ledger_entries (
    public_id, user_id, bucket, currency, amount, entry_type,
    reference_type, reference_id, idempotency_key, created_by
  )
  values (
    'PDK-LEDGER-' || upper(substr(replace(gen_random_uuid()::text, '-', ''), 1, 16)),
    p_user_id, p_buckets[1], p_currency, p_amount, p_entry_type,
    p_reference_type, p_reference_id, p_idempotency_key, p_created_by
  )
  on conflict (idempotency_key) do nothing;

  get diagnostics v_inserted = row_count;
  if v_inserted <> 1 then
    return false;
  end if;

  update public.wallet_accounts
  set available_amount = available_amount + p_amount,
      updated_at = now()
  where user_id = p_user_id
    and currency = p_currency
    and bucket = any (p_buckets);

  return true;
end;
$function$
;

revoke all on function private.putduk_apply_ledger(uuid,text[],text,numeric,text,text,uuid,text,uuid) from public, anon, authenticated;
grant execute on function private.putduk_apply_ledger(uuid,text[],text,numeric,text,text,uuid,text,uuid) to service_role;
