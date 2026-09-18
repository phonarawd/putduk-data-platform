# Supabase 운영 자동화

## 운영 기본 경로

현재 PUTDUK의 Supabase 운영 배포 기본값은 **Path A(MCP/CLI 직접 실행)** 입니다.

GitHub Actions는 계정 billing/spending limit 때문에 job이 시작되지 않는 상태가 확인되어 있으며, 운영 필수 경로로 사용하지 않습니다. `.github/workflows/supabase-deploy.yml`은 향후 결제/한도 문제가 해소될 때 사용할 수 있는 **수동 보조 경로**로만 유지합니다. `main` push로 자동 실행되지 않습니다.

## 기준 프로젝트

- Repository: `phonarawd/putduk-data-platform`
- Supabase project ref: `gaugwamwceqdnqdqrxqg`
- Edge Functions: `admin-control`, `member-finance`

## Path A 순서

1. 로컬/작업 브랜치 검증
2. `ops:check-auth`
3. `ops:verify-migrations`
4. 필요한 migration을 Supabase CLI 또는 MCP로 적용
5. `PUTDUK_PAYOUT_SECRET` 등 필요한 Edge Secret 확인/동기화
6. `admin-control`, `member-finance` 배포
7. `ops:verify-edge`
8. `ops:verify-integrity`
9. `ops:verify-security`
10. 검증 후 GitHub `main` 반영

## 제공 도구

- `pnpm ops:check-env`
- `pnpm ops:check-auth`
- `pnpm ops:bootstrap`
- `pnpm ops:sync-secrets`
- `pnpm ops:verify-migrations`
- `pnpm ops:verify-integrity`
- `pnpm ops:verify-edge`
- `pnpm ops:verify-security`

Secret 원문은 코드, 문서, 로그에 기록하지 않습니다. `.env`, `.env.*`는 `.gitignore` 대상이며 `.env.example`만 추적합니다.

## Migration 원칙

- GitHub `supabase/migrations/` = schema change source of truth
- 운영 `supabase_migrations.schema_migrations` = 적용 이력
- history rewrite 금지
- 운영 DB reset 금지
- rollback 대신 forward-fix 우선
- drift가 발견되면 적용 전에 원인을 확인

## 지급정보 암호화

`PUTDUK_PAYOUT_SECRET`이 없으면 지급정보 저장은 fail-closed 되어야 합니다. 평문 fallback은 허용하지 않습니다. DB의 payout ciphertext guard도 유지합니다.

## GitHub Actions

`supabase-deploy.yml`은 `workflow_dispatch`만 허용합니다. 현재 billing/spending limit가 해결되기 전까지 운영 경로로 간주하지 않습니다.

## FOMO

이 자동화 영역은 FOMO/실시간 연출과 분리되어 있습니다. `bot_enabled`, `crowd_min`, `crowd_max`, `burn_per_minute` 및 관련 UI/로직을 변경하지 않습니다.
