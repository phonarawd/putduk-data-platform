-- 외래키 조회 인덱스. 쓰이지 않는 기존 인덱스는 지우지 않는다.

begin;

create index if not exists ops_motion_settings_updated_by_idx
  on private.ops_motion_settings (updated_by);

create index if not exists security_pin_audit_actor_id_idx
  on private.security_pin_audit (actor_id);

create index if not exists security_pin_audit_user_id_idx
  on private.security_pin_audit (user_id);

create index if not exists member_tier_daily_limits_updated_by_idx
  on public.member_tier_daily_limits (updated_by);

commit;
