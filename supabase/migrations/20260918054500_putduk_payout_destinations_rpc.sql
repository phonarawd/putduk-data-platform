-- 원격 PUTDUK-DATA-PRODUCTION에 PIN 게이트 이후 시그니처가 이미 있다.
-- TABLE(..., has_qr boolean, info_version integer)
-- CREATE OR REPLACE로는 반환 타입을 바꿀 수 없어 적용이 실패한다.
-- 구버전(qr_asset_path/account_holder/guidance_text 반환)으로 덮으면 입금 PIN 정책이 후퇴한다.
-- 최신 본문은 20260918080000_putduk_deposit_pin_gate.sql 을 따른다.

begin;
commit;
