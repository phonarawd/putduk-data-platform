create or replace function private.putduk_guard_deposit_approval_proof()
returns trigger
language plpgsql
security definer
set search_path to 'pg_catalog','public','private'
as $$
declare
  v_path text := btrim(coalesce(new.proof_path, ''));
  v_entering_approved boolean := false;
begin
  if new.status::text = 'approved' then
    if tg_op = 'INSERT' then
      v_entering_approved := true;
    else
      v_entering_approved := old.status is distinct from new.status;
    end if;
  end if;

  if v_entering_approved then
    if v_path = '' then
      raise exception using errcode = '23514', message = '입금 증빙을 먼저 확인해 주세요.';
    end if;

    if not (
      v_path like 'deposit-proof/' || new.user_id::text || '/%'
      or v_path like 'deposit_proof/' || new.user_id::text || '/%'
      or v_path like new.user_id::text || '/deposit-proof/%'
      or v_path like new.user_id::text || '/deposit_proof/%'
    ) then
      raise exception using errcode = '23514', message = '회원 본인의 입금 증빙 경로만 승인할 수 있어요.';
    end if;
  end if;

  return new;
end;
$$;

revoke all on function private.putduk_guard_deposit_approval_proof() from public;

drop trigger if exists trg_putduk_deposit_approval_proof on public.deposit_requests;
create trigger trg_putduk_deposit_approval_proof
before insert or update of status, proof_path on public.deposit_requests
for each row execute function private.putduk_guard_deposit_approval_proof();

create or replace function public.putduk_admin_review_kyc(
  p_admin_id uuid,
  p_user_id uuid,
  p_decision text,
  p_reason text default null::text
)
returns text
language plpgsql
security definer
set search_path to 'pg_catalog','public','private'
as $$
declare
  v_decision text := lower(trim(coalesce(p_decision, '')));
  v_reason text := nullif(left(trim(coalesce(p_reason, '')), 500), '');
  v_now timestamptz := now();
  v_count integer;
  v_current_kyc text;
begin
  perform private.putduk_assert_admin(p_admin_id, array['super_admin', 'kyc_review']);

  if v_decision not in ('approved', 'rejected') then
    raise exception using errcode = '22023', message = '본인확인 결과를 선택해 주세요.';
  end if;
  if v_decision = 'rejected' and v_reason is null then
    raise exception using errcode = '22023', message = '반려 사유를 입력해 주세요.';
  end if;

  select kyc_status::text into v_current_kyc
  from public.profiles
  where id = p_user_id
  for update;
  if not found then
    raise exception using errcode = 'P0002', message = '회원을 찾을 수 없습니다.';
  end if;

  if coalesce(v_current_kyc, '') not in ('submitted', 'review_pending') then
    raise exception using errcode = '23514', message = '이미 처리되었거나 검수 대기 상태가 아닌 본인확인입니다.';
  end if;

  select count(distinct document_kind) into v_count
  from private.kyc_documents
  where user_id = p_user_id
    and document_kind in ('identity_front', 'identity_back', 'selfie');
  if v_count < 3 then
    raise exception using errcode = 'P0002', message = '본인확인 서류가 모두 제출되지 않았습니다.';
  end if;

  if v_decision = 'approved' then
    update private.kyc_documents
    set status = 'approved', reviewed_by = p_admin_id, reviewed_at = v_now, rejection_reason = null
    where user_id = p_user_id
      and document_kind in ('identity_front', 'identity_back', 'selfie');

    update public.profiles
    set kyc_status = 'approved',
        status = case when status = 'pending' then 'active' else status end,
        updated_at = v_now
    where id = p_user_id;

    update public.referral_relations
    set status = case when status = 'joined' then 'verified' else status end,
        updated_at = v_now
    where invitee_id = p_user_id and status = 'joined';

    insert into public.notifications (user_id, title, body, notification_type)
    values (p_user_id, '본인확인이 완료됐어요', '출금 전 본인확인이 승인되었습니다.', 'kyc');
  else
    update private.kyc_documents
    set status = 'rejected', reviewed_by = p_admin_id, reviewed_at = v_now, rejection_reason = v_reason
    where user_id = p_user_id
      and document_kind in ('identity_front', 'identity_back', 'selfie');

    update public.profiles
    set kyc_status = 'rejected', updated_at = v_now
    where id = p_user_id;

    insert into public.notifications (user_id, title, body, notification_type)
    values (p_user_id, '본인확인이 반려됐어요', '운영자 안내: ' || v_reason, 'kyc');
  end if;

  return v_decision;
end;
$$;
