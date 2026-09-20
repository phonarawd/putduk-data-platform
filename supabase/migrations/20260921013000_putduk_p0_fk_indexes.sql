-- 1-F P0: 신규 finance/push 외래키의 covering index.
-- 조인과 부모 행 삭제 시 FK 확인이 느려지지 않도록 필요한 4개만 추가한다.
-- 기존 unused index는 이 단계에서 삭제하지 않는다.

begin;

create index if not exists admin_money_operations_admin_id_idx
  on private.admin_money_operations (admin_id);

create index if not exists admin_money_operations_user_id_idx
  on private.admin_money_operations (user_id);

create index if not exists push_outbox_notification_id_idx
  on private.push_outbox (notification_id);

create index if not exists push_outbox_user_id_idx
  on private.push_outbox (user_id);

commit;
