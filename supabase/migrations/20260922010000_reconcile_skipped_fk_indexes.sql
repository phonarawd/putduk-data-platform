-- Index reconciliation: migration 20260918073245에서 conditional skip된 인덱스 보강.
--
-- migration 20260918073245(putduk_fk_indexes_ops_security)는 로컬 db reset 시
-- 타임스탬프 순서로 실행되어 아직 정의되지 않은 테이블에 대해 인덱스 생성을 skip한다.
-- 그러나 이후 migration에서 이 인덱스들을 다시 생성하지 않으므로
-- fresh DB에서 영구적으로 누락된다.
--
-- 이 migration은 모든 테이블이 정의된 이후에 실행되므로
-- 누락된 3개 인덱스를 안전하게 생성한다.
--
-- duplicate-safe: create index if not exists
-- production-safe: 운영에 이미 인덱스가 있으면 no-op
-- no dev credentials, no destructive operations.

begin;

-- private.security_pin_audit (정의: 20260918080000)
-- migration 20260918073245에서 테이블이 아직 없어 skip 가능
create index if not exists security_pin_audit_actor_id_idx
  on private.security_pin_audit (actor_id);

create index if not exists security_pin_audit_user_id_idx
  on private.security_pin_audit (user_id);

-- public.member_tier_daily_limits (정의: 20260918110000)
-- migration 20260918073245에서 테이블이 아직 없어 skip 가능
create index if not exists member_tier_daily_limits_updated_by_idx
  on public.member_tier_daily_limits (updated_by);

commit;
