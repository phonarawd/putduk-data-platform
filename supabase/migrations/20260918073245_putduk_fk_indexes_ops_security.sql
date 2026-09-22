-- 외래키 조회 인덱스. 쓰이지 않는 기존 인덱스는 지우지 않는다.
--
-- 이 migration의 타임스탬프(073245)보다 뒤에 정의되는 테이블이 있다.
-- 로컬 db reset에서 타임스탬프 순서로 실행할 때 테이블이 아직 없을 수 있으므로
-- 각 인덱스 생성 전에 테이블 존재 여부를 검사한다.
-- 운영에서는 이미 적용된 버전이므로 db push가 skip한다.

begin;

-- private.ops_motion_settings (정의: 20260917150103, 이 시점에 이미 존재)
create index if not exists ops_motion_settings_updated_by_idx
  on private.ops_motion_settings (updated_by);

-- private.security_pin_audit (정의: 20260918080000, 아직 없을 수 있음)
do $$
begin
  if exists (
    select 1 from information_schema.tables
    where table_schema = 'private' and table_name = 'security_pin_audit'
  ) then
    create index if not exists security_pin_audit_actor_id_idx
      on private.security_pin_audit (actor_id);
    create index if not exists security_pin_audit_user_id_idx
      on private.security_pin_audit (user_id);
  end if;
end $$;

-- public.member_tier_daily_limits (정의: 20260918110000, 아직 없을 수 있음)
do $$
begin
  if exists (
    select 1 from information_schema.tables
    where table_schema = 'public' and table_name = 'member_tier_daily_limits'
  ) then
    create index if not exists member_tier_daily_limits_updated_by_idx
      on public.member_tier_daily_limits (updated_by);
  end if;
end $$;

commit;
