-- 회원 지급정보 평문 레거시 정리 + DB 영구 fail-closed
-- 출금 요청에 연결된 평문 행이 하나라도 있으면 중단한다.
-- 어떤 출금에도 연결되지 않은 고아 평문만 삭제한다.

begin;

-- 빈 문자열은 의미 없는 값이므로 NULL로 정규화한다.
update private.member_payout_destinations
set account_number = null
where account_number is not null and btrim(account_number) = '';

update private.member_payout_destinations
set account_holder = null
where account_holder is not null and btrim(account_holder) = '';

update private.member_payout_destinations
set usdt_address = null
where usdt_address is not null and btrim(usdt_address) = '';

-- 연결된 출금의 지급정보가 평문이면 자동 삭제하지 않고 배포 자체를 중단한다.
do $$
begin
  if exists (
    select 1
    from private.member_payout_destinations d
    where (
      (d.account_number is not null and d.account_number not like 'enc.v1.%')
      or (d.account_holder is not null and d.account_holder not like 'enc.v1.%')
      or (d.usdt_address is not null and d.usdt_address not like 'enc.v1.%')
    )
    and exists (
      select 1 from public.withdrawal_requests w where w.destination_id = d.id
    )
  ) then
    raise exception using
      errcode = '23514',
      message = '출금에 연결된 레거시 평문 지급정보가 있어 자동 정리를 중단합니다.';
  end if;
end;
$$;

-- 출금에 한 번도 연결되지 않은 레거시 평문 고아 행만 제거한다.
delete from private.member_payout_destinations d
where (
  (d.account_number is not null and d.account_number not like 'enc.v1.%')
  or (d.account_holder is not null and d.account_holder not like 'enc.v1.%')
  or (d.usdt_address is not null and d.usdt_address not like 'enc.v1.%')
)
and not exists (
  select 1 from public.withdrawal_requests w where w.destination_id = d.id
);

alter table private.member_payout_destinations
  drop constraint if exists member_payout_destinations_account_number_ciphertext_check,
  drop constraint if exists member_payout_destinations_account_holder_ciphertext_check,
  drop constraint if exists member_payout_destinations_usdt_address_ciphertext_check;

alter table private.member_payout_destinations
  add constraint member_payout_destinations_account_number_ciphertext_check
    check (account_number is null or account_number like 'enc.v1.%'),
  add constraint member_payout_destinations_account_holder_ciphertext_check
    check (account_holder is null or account_holder like 'enc.v1.%'),
  add constraint member_payout_destinations_usdt_address_ciphertext_check
    check (usdt_address is null or usdt_address like 'enc.v1.%');

commit;
