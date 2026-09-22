-- supabase/seed.sql — 로컬 개발 환경 전용 fixture.
--
-- supabase db reset 시 모든 migration 완료 후 자동 실행된다.
-- supabase db push (CI/CD)는 seed.sql을 실행하지 않는다.
-- 이 파일에는 로컬 개발용 dev admin fixture만 포함한다.
-- production 필수 catalog 데이터(13종 카드)는 migration으로 보장된다.
--
-- dev admin:
--   email:    dev-admin@local.putduk
--   password: putduk-dev-2026
--   UUID:     00000000-0000-0000-0000-000000000001 (local fixture 전용)

-- =====================================================
-- 1. 개발용 운영자 계정 (auth.users)
-- =====================================================
-- auth.users에 직접 INSERT한다.
-- on_auth_user_created_putduk 트리거가 자동으로 profiles, wallet_accounts 등을 생성한다.
-- bcrypt 해시로 비밀번호를 저장한다 (pgcrypto의 crypt 함수 사용).

insert into auth.users (
  id,
  aud,
  role,
  email,
  encrypted_password,
  email_confirmed_at,
  created_at,
  updated_at,
  raw_app_meta_data,
  raw_user_meta_data
)
values (
  '00000000-0000-0000-0000-000000000001'::uuid,
  'authenticated',
  'authenticated',
  'dev-admin@local.putduk',
  crypt('putduk-dev-2026', gen_salt('bf')),
  now(),
  now(),
  now(),
  '{"provider":"email","providers":["email"]}'::jsonb,
  '{}'::jsonb
)
on conflict (id) do nothing;

-- =====================================================
-- 2. 운영자 권한 (private.admin_roles)
-- =====================================================
-- auth.users 생성 트리거가 profiles 행을 만든 후 admin_roles를 연결한다.
-- FK: private.admin_roles.user_id → auth.users(id) on delete cascade

insert into private.admin_roles (user_id, role)
values (
  '00000000-0000-0000-0000-000000000001'::uuid,
  'super_admin'
)
on conflict (user_id) do nothing;
