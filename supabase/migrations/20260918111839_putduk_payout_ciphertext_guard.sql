-- 지급정보 원문 INSERT/UPDATE 차단. 값이 있으면 enc.v1. 만 허용한다.
-- 기존 legacy 행은 UPDATE 전까지 유지되며, 새 값만 암호문이어야 한다.

begin;

create or replace function private.putduk_payout_ciphertext_guard()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, private
as $$
begin
  if tg_op = 'INSERT' then
    if nullif(trim(coalesce(new.account_number, '')), '') is not null
       and new.account_number not like 'enc.v1.%' then
      raise exception using errcode = '22023', message = '지급정보는 암호화된 값만 저장할 수 있습니다.';
    end if;
    if nullif(trim(coalesce(new.usdt_address, '')), '') is not null
       and new.usdt_address not like 'enc.v1.%' then
      raise exception using errcode = '22023', message = '지급정보는 암호화된 값만 저장할 수 있습니다.';
    end if;
    if nullif(trim(coalesce(new.encrypted_value, '')), '') is not null
       and new.encrypted_value not like 'enc.v1.%' then
      raise exception using errcode = '22023', message = '지급정보는 암호화된 값만 저장할 수 있습니다.';
    end if;
  else
    if new.account_number is distinct from old.account_number
       and nullif(trim(coalesce(new.account_number, '')), '') is not null
       and new.account_number not like 'enc.v1.%' then
      raise exception using errcode = '22023', message = '지급정보는 암호화된 값만 저장할 수 있습니다.';
    end if;
    if new.usdt_address is distinct from old.usdt_address
       and nullif(trim(coalesce(new.usdt_address, '')), '') is not null
       and new.usdt_address not like 'enc.v1.%' then
      raise exception using errcode = '22023', message = '지급정보는 암호화된 값만 저장할 수 있습니다.';
    end if;
    if new.encrypted_value is distinct from old.encrypted_value
       and nullif(trim(coalesce(new.encrypted_value, '')), '') is not null
       and new.encrypted_value not like 'enc.v1.%' then
      raise exception using errcode = '22023', message = '지급정보는 암호화된 값만 저장할 수 있습니다.';
    end if;
  end if;
  return new;
end;
$$;

drop trigger if exists trg_putduk_payout_ciphertext_guard on private.payout_destinations;
create trigger trg_putduk_payout_ciphertext_guard
before insert or update of account_number, usdt_address, encrypted_value
on private.payout_destinations
for each row
execute function private.putduk_payout_ciphertext_guard();

commit;
