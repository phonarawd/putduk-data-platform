-- Historical financial-state reconciliation.
-- 1) Restore a missing support-grant posting ledger row when the grant is the
--    user's only live grant and the wallet already contains exactly that amount.
-- 2) Restore the one-time trial-withdraw usage marker for historical completed
--    pre-KYC trial withdrawals. No wallet balances are changed.

begin;

insert into private.ledger_entries (
  public_id,
  user_id,
  bucket,
  currency,
  amount,
  entry_type,
  reference_type,
  reference_id,
  idempotency_key,
  created_by
)
select
  'PDK-LEDGER-' || upper(substr(replace(gen_random_uuid()::text, '-', ''), 1, 16)),
  g.user_id,
  'support_grant',
  'KRW',
  round(g.amount, 2),
  'support_grant_posted',
  'support_grant',
  g.id,
  'support-grant-reconcile:' || g.id::text,
  g.user_id
from public.support_grants g
join public.wallet_accounts w
  on w.user_id = g.user_id
 and w.bucket = 'support_grant'
 and w.currency = 'KRW'
where g.status in ('available', 'held')
  and w.available_amount = round(g.amount, 2)
  and coalesce(w.held_amount, 0) = 0
  and not exists (
    select 1
    from public.support_grants g2
    where g2.user_id = g.user_id
      and g2.status in ('available', 'held')
      and g2.id <> g.id
  )
  and not exists (
    select 1
    from private.ledger_entries l
    where l.reference_type = 'support_grant'
      and l.reference_id = g.id
      and l.entry_type = 'support_grant_posted'
  )
on conflict (idempotency_key) do nothing;

update public.profiles p
set trial_withdraw_used_at = x.first_completed_at,
    updated_at = now()
from (
  select
    w.user_id,
    min(w.created_at) as first_completed_at
  from public.withdrawal_requests w
  where w.status = 'completed'
    and round(coalesce(w.amount, 0), 2) between 1000 and 3000
    and coalesce(w.include_principal, false) = false
    and coalesce(w.principal_included, false) = false
  group by w.user_id
) x
where p.id = x.user_id
  and p.trial_withdraw_used_at is null
  and p.kyc_status is distinct from 'approved'
  and exists (
    select 1
    from public.task_runs r
    where r.user_id = p.id
      and r.status = 'approved'
      and r.reward_status = 'posted'
      and (
        coalesce(r.is_trial, false)
        or exists (
          select 1
          from public.nodes n
          where n.id = r.node_id
            and (coalesce(n.is_trial, false) or n.tier_band = '체험')
        )
      )
      and round(coalesce(nullif(r.stipend_krw, 0), r.reward_amount, 0), 2) > 0
  );

commit;
