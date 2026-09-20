-- 체험 수당의 본인확인 전 1회 출금 예외는 실제 체험 승인/수당 지급 후에만 연다.

create or replace function private.putduk_guard_trial_withdraw_used_at()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, public, private
as $$
begin
  if old.trial_withdraw_used_at is null and new.trial_withdraw_used_at is not null then
    if not exists (
      select 1
      from public.task_runs r
      where r.user_id = new.id
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
    ) then
      raise exception using
        errcode = '23514',
        message = '체험 업무가 승인된 뒤에만 첫 수당 출금을 사용할 수 있어요.';
    end if;
  end if;

  return new;
end;
$$;

drop trigger if exists trg_putduk_trial_withdraw_approval_guard on public.profiles;
create trigger trg_putduk_trial_withdraw_approval_guard
before update of trial_withdraw_used_at on public.profiles
for each row
execute function private.putduk_guard_trial_withdraw_used_at();

create or replace function private.putduk_withdraw_identity_ok(
  p_user_id uuid,
  p_amount numeric,
  p_include_principal boolean
)
returns void
language plpgsql
stable
set search_path = pg_catalog, public, private
as $$
declare
  v_status text;
  v_kyc text;
  v_trial_withdraw_used timestamptz;
  v_ops boolean := false;
begin
  select status, kyc_status, trial_withdraw_used_at
    into v_status, v_kyc, v_trial_withdraw_used
  from public.profiles
  where id = p_user_id;

  if v_status is null or v_status <> 'active' then
    raise exception using errcode = '42501', message = '활성화된 회원만 출금할 수 있어요.';
  end if;

  if v_kyc = 'approved' then
    return;
  end if;

  v_ops := coalesce(p_include_principal, false) = false
    and coalesce(p_amount, 0) > 0
    and coalesce(p_amount, 0) <= 3000
    and v_trial_withdraw_used is null
    and exists (
      select 1
      from public.task_runs r
      where r.user_id = p_user_id
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

  if v_ops then
    if exists (
      select 1
      from public.withdrawal_requests w
      where w.user_id = p_user_id
        and coalesce(w.include_principal, false) = false
        and w.status not in ('rejected', 'cancelled')
    ) then
      raise exception using errcode = '23514', message = '체험 수당 출금은 한 번만 할 수 있어요.';
    end if;
    return;
  end if;

  raise exception using errcode = '42501', message = '출금 전 본인확인이 필요해요.';
end;
$$;

comment on function private.putduk_guard_trial_withdraw_used_at() is
  'trial_withdraw_used_at 최초 사용을 승인 완료된 체험 업무와 수당 posted 이후로 제한';
