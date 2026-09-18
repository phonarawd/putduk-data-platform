-- 배포 후 읽기 전용 무결성 검사. 원문·식별자는 반환하지 않는다.

select
  (
    select count(*)::int
    from private.payout_destinations d
    where (
      (nullif(trim(coalesce(d.account_number, '')), '') is not null and d.account_number not like 'enc.v1.%')
      or (nullif(trim(coalesce(d.usdt_address, '')), '') is not null and d.usdt_address not like 'enc.v1.%')
      or (nullif(trim(coalesce(d.encrypted_value, '')), '') is not null and d.encrypted_value not like 'enc.v1.%')
    )
  ) as payout_plaintext,
  (
    select count(*)::int
    from private.payout_destinations d
    where d.account_number like 'enc.v1.%'
       or d.usdt_address like 'enc.v1.%'
       or d.encrypted_value like 'enc.v1.%'
  ) as payout_encrypted,
  (
    select count(*)::int from private.payout_destinations
  ) as payout_total,
  (
    select count(*)::int from public.wallet_accounts where available_amount < 0
  ) as negative_available,
  (
    select count(*)::int from public.wallet_accounts where held_amount < 0
  ) as negative_held,
  (
    select count(*)::int
    from (
      select user_id, bucket, currency
      from public.wallet_accounts
      group by user_id, bucket, currency
      having count(*) > 1
    ) dup
  ) as duplicate_wallet_bucket,
  (
    select count(*)::int
    from (
      select user_id
      from public.task_runs
      where status = 'in_progress'
      group by user_id
      having count(*) > 1
    ) runs
  ) as multiple_active_task_runs,
  (
    select count(*)::int
    from public.referral_relations
    where referrer_id = invitee_id
  ) as self_referral,
  (
    select count(*)::int
    from (
      select invitee_id
      from public.referral_relations
      group by invitee_id
      having count(*) > 1
    ) invites
  ) as duplicate_invitee,
  (
    select count(*)::int
    from public.task_assignments a
    join public.nodes n on n.id = a.node_id
    where a.status in ('active', 'started')
      and (
        n.supply_source is distinct from 'operator'
        or n.catalog_status is distinct from 'published'
        or coalesce(n.enabled, false) is not true
      )
  ) as invalid_node_assignment,
  (
    select count(*)::int
    from public.task_assignments a
    join public.nodes n on n.id = a.node_id
    left join public.partner_brands b on b.id = n.partner_brand_id
    where a.status in ('active', 'started')
      and (
        b.id is null
        or coalesce(b.published, false) is not true
        or b.verification_status::text is distinct from 'approved'
        or coalesce(b.logo_usage_status, '') is distinct from 'approved'
      )
  ) as invalid_brand_assignment;
