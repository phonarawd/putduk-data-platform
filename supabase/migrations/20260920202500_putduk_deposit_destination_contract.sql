create or replace function private.putduk_guard_deposit_destination_contract()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, public, private
as $$
declare
  v_type text;
begin
  new.currency := upper(trim(coalesce(new.currency, '')));

  if new.destination_id is null then
    raise exception using
      errcode = '22023',
      message = '입금 안내 계좌 또는 USDT 지갑을 다시 선택해 주세요.';
  end if;

  select lower(trim(coalesce(d.destination_type, '')))
    into v_type
  from private.payout_destinations d
  where d.id = new.destination_id
    and d.enabled = true;

  if not found then
    raise exception using
      errcode = '22023',
      message = '현재 사용할 수 있는 입금 안내 목적지가 아닙니다.';
  end if;

  if (new.currency = 'KRW' and v_type <> 'bank')
     or (new.currency = 'USDT' and v_type <> 'usdt')
     or new.currency not in ('KRW', 'USDT') then
    raise exception using
      errcode = '22023',
      message = '입금 통화와 입금 안내 목적지가 맞지 않습니다.';
  end if;

  return new;
end;
$$;

revoke all on function private.putduk_guard_deposit_destination_contract() from public;

drop trigger if exists trg_putduk_deposit_destination_contract on public.deposit_requests;
create trigger trg_putduk_deposit_destination_contract
before insert or update of currency, destination_id
on public.deposit_requests
for each row
execute function private.putduk_guard_deposit_destination_contract();
