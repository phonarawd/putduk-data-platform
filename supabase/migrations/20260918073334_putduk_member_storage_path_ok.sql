-- 회원 비공개 파일 경로 소유 확인. kyc/{uuid}/… · deposit-proof/{uuid}/… 과
-- 예전 {uuid}/kyc/… · {uuid}/deposit_proof/… 를 모두 본인 경로로 본다.

begin;

create or replace function private.putduk_member_storage_path_ok(p_user_id uuid, p_path text)
returns boolean
language plpgsql
immutable
set search_path = pg_catalog
as $$
declare
  v_path text := trim(coalesce(p_path, ''));
  v_first text;
  v_second text;
begin
  if p_user_id is null or v_path = '' or length(v_path) > 500 then
    return false;
  end if;
  if position('..' in v_path) > 0 or left(v_path, 1) = '/' or position('\' in v_path) > 0 then
    return false;
  end if;
  v_first := split_part(v_path, '/', 1);
  v_second := split_part(v_path, '/', 2);
  if v_second is null or v_second = '' then
    return false;
  end if;
  if v_first = p_user_id::text then
    return true;
  end if;
  if v_first in ('kyc', 'deposit-proof', 'deposit_proof') then
    return v_second = p_user_id::text and split_part(v_path, '/', 3) <> '';
  end if;
  return false;
end;
$$;

revoke all on function private.putduk_member_storage_path_ok(uuid, text) from public, anon, authenticated;
grant execute on function private.putduk_member_storage_path_ok(uuid, text) to service_role;

comment on function private.putduk_member_storage_path_ok(uuid, text) is
  '본인확인·입금 증빙 경로가 그 회원 것인지 확인. .. 탈출 금지.';

create or replace function public.putduk_member_submit_deposit(
  p_user_id uuid,
  p_currency text,
  p_amount numeric,
  p_proof_path text,
  p_note text default null,
  p_destination_id uuid default null
)
returns public.deposit_requests
language plpgsql
security definer
set search_path = pg_catalog, public, private
as $$
declare
  v_row public.deposit_requests%rowtype;
  v_currency text := upper(trim(coalesce(p_currency, 'KRW')));
  v_note text := nullif(left(trim(coalesce(p_note, '')), 500), '');
  v_proof text := nullif(trim(coalesce(p_proof_path, '')), '');
begin
  if p_user_id is null then
    raise exception using errcode = '22023', message = '회원 정보가 필요합니다.';
  end if;

  if not exists (
    select 1 from public.profiles p
    where p.id = p_user_id and p.status in ('active', 'pending')
  ) then
    raise exception using errcode = '42501', message = '입금 요청을 할 수 없는 계정입니다.';
  end if;

  if v_currency not in ('KRW', 'USDT') then
    raise exception using errcode = '22023', message = '입금 통화를 확인해 주세요.';
  end if;

  if p_amount is null or p_amount < 1000 or p_amount > 100000000 then
    raise exception using errcode = '22023', message = '입금 금액은 1,000~100,000,000 범위여야 합니다.';
  end if;

  if v_proof is null or length(v_proof) > 500 then
    raise exception using errcode = '22023', message = '입금 증빙 파일을 등록해 주세요.';
  end if;

  if not private.putduk_member_storage_path_ok(p_user_id, v_proof) then
    raise exception using errcode = '22023', message = '본인 증빙 파일만 등록할 수 있습니다.';
  end if;

  if p_destination_id is not null and not exists (
    select 1 from private.payout_destinations d
    where d.id = p_destination_id and d.enabled = true
  ) then
    raise exception using errcode = '22023', message = '입금 안내 계좌가 올바르지 않습니다.';
  end if;

  insert into public.deposit_requests (
    public_id, user_id, currency, amount, status, proof_path, note, destination_id
  )
  values (
    'PDK-DEP-' || to_char(now(), 'YYMMDD') || '-' || upper(substr(replace(gen_random_uuid()::text, '-', ''), 1, 8)),
    p_user_id,
    v_currency,
    round(p_amount, 2),
    'submitted',
    v_proof,
    v_note,
    p_destination_id
  )
  returning * into v_row;

  insert into public.notifications (user_id, title, body, notification_type)
  values (
    p_user_id,
    '입금 확인 요청을 접수했어요',
    to_char(round(p_amount, 2), 'FM999G999G999G990D00') ||
      case when v_currency = 'USDT' then ' USDT' else '원' end ||
      ' 입금 확인을 운영자가 검토합니다.',
    'finance'
  );

  return v_row;
end;
$$;

revoke all on function public.putduk_member_submit_deposit(uuid, text, numeric, text, text, uuid)
  from public, anon, authenticated;
grant execute on function public.putduk_member_submit_deposit(uuid, text, numeric, text, text, uuid)
  to service_role;

create or replace function public.putduk_member_submit_kyc(
  p_user_id uuid,
  p_front_path text,
  p_back_path text,
  p_selfie_path text
)
returns text
language plpgsql
security definer
set search_path = pg_catalog, public, private
as $$
declare
  v_front text := nullif(trim(coalesce(p_front_path, '')), '');
  v_back text := nullif(trim(coalesce(p_back_path, '')), '');
  v_selfie text := nullif(trim(coalesce(p_selfie_path, '')), '');
begin
  if p_user_id is null then
    raise exception using errcode = '22023', message = '회원 정보가 필요합니다.';
  end if;

  if not exists (select 1 from public.profiles where id = p_user_id and status in ('active', 'pending')) then
    raise exception using errcode = '42501', message = '본인확인을 제출할 수 없는 계정입니다.';
  end if;

  if v_front is null or v_back is null or v_selfie is null
     or not private.putduk_member_storage_path_ok(p_user_id, v_front)
     or not private.putduk_member_storage_path_ok(p_user_id, v_back)
     or not private.putduk_member_storage_path_ok(p_user_id, v_selfie) then
    raise exception using errcode = '22023', message = '신분증 앞면·뒷면·셀카 파일을 모두 본인 경로로 등록해 주세요.';
  end if;

  insert into private.kyc_documents (user_id, document_kind, storage_path, status)
  values
    (p_user_id, 'identity_front', v_front, 'submitted'),
    (p_user_id, 'identity_back', v_back, 'submitted'),
    (p_user_id, 'selfie', v_selfie, 'submitted')
  on conflict (user_id, document_kind) do update
    set storage_path = excluded.storage_path,
        status = 'submitted',
        reviewed_by = null,
        reviewed_at = null,
        rejection_reason = null;

  update public.profiles
  set kyc_status = 'submitted',
      updated_at = now()
  where id = p_user_id;

  insert into public.notifications (user_id, title, body, notification_type)
  values (p_user_id, '본인확인 서류를 접수했어요', '운영자 검수를 기다리고 있어요.', 'kyc');

  return 'submitted';
end;
$$;

revoke all on function public.putduk_member_submit_kyc(uuid, text, text, text) from public, anon, authenticated;
grant execute on function public.putduk_member_submit_kyc(uuid, text, text, text) to service_role;

commit;
