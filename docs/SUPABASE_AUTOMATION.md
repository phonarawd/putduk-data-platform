# 퍼뜩 Supabase 자동화

GitHub가 스키마·Edge 코드의 기준이고, 운영 Dashboard에서 직접 고친 내용은 drift 검사로 드러나게 합니다.

```text
GitHub
  → GitHub Actions
    → Supabase CLI 2.113.0
      → 운영 프로젝트 gaugwamwceqdnqdqrxqg
        ├─ migrations
        ├─ Edge Functions
        └─ Edge Secrets
```

Cursor/ChatGPT는 Actions가 막혀 있어도 같은 스크립트를 MCP·CLI로 실행할 수 있습니다.

## Source of truth

| 대상 | 기준 |
| --- | --- |
| 스키마 변경 | `supabase/migrations/` |
| 적용 이력 | 운영 `supabase_migrations.schema_migrations` |
| Edge 코드 | `supabase/functions/` |
| 런타임 비밀 | GitHub Secrets / Supabase Edge Secrets |

운영 데이터 hotfix SQL은 재실행하지 않습니다. 과거 이력만 있는 버전은 `tooling/supabase/migration-aliases.json`에 번호만 적습니다.

## 필요한 Secret 이름

GitHub Repository Secrets:

- `SUPABASE_ACCESS_TOKEN`
- `SUPABASE_PROJECT_REF` (값은 프로젝트 ref. 운영은 `gaugwamwceqdnqdqrxqg`)
- `PUTDUK_PAYOUT_SECRET`
- `SUPABASE_DB_PASSWORD` (있으면 사용, 이름 변경 금지)
- `PUTDUK_ALLOWED_ORIGINS` (선택)

Supabase Edge Secrets:

- `PUTDUK_PAYOUT_SECRET` (GitHub와 같은 값)
- `PUTDUK_ALLOWED_ORIGINS` (선택)

Secret 원문은 코드, README, 이슈, Actions 로그, artifact에 넣지 않습니다. 등록 위치는 GitHub Settings → Secrets and variables → Actions, 그리고 Supabase Project Settings → Edge Functions → Secrets 입니다. Cursor는 `tooling/supabase/sync-secrets.mjs`로 같은 작업을 CLI에서 합니다.

## 배포 순서

1. Secret preflight (존재 여부만, 값·길이 출력 없음)
2. Edge import graph
3. 프로젝트 연결 (`SUPABASE_PROJECT_REF`가 운영 ref와 다르면 중단)
4. migration drift 검사
5. `supabase db push --linked` (`db reset` / DROP DATABASE 금지)
6. `PUTDUK_PAYOUT_SECRET` 동기화
7. `admin-control`, `member-finance` 배포 (`verify_jwt=true`)
8. 무인증 스모크(401류)
9. 읽기 전용 무결성 SQL
10. Security Advisor (`--fail-on error`)

워크플로: `.github/workflows/supabase-deploy.yml`  
수동 실행: GitHub Actions → **Supabase 배포** → Run workflow

검증만: `.github/workflows/supabase-verify.yml`

## Migration drift

GitHub 파일 버전과 운영 ledger 버전이 다르면 실패합니다. 이미 기록된 이름 동등 버전·운영 전용 이력은 `migration-aliases.json`에만 적고 history rewrite는 하지 않습니다.

새 drift가 나오면 출력되는 버전 번호만 보고, 사람/ChatGPT가 SQL을 GitHub에 맞춘 뒤 앞으로만 고칩니다.

## Edge rollback

데이터베이스는 역방향 마이그레이션을 자동 실행하지 않습니다. Edge만 이전 커밋 SHA로 다시 배포하려면 **Supabase 롤백** 워크플로를 씁니다. 배포 실패 시 기존 ACTIVE 버전은 그대로 둡니다. Secret 동기화가 실패하면 Edge 배포 단계에 들어가지 않습니다.

## 지급정보 암호화

형식: `enc.v1.{iv}.{ciphertext}` (AES-256-GCM, 12 byte IV)

- Secret 이름만 코드에 둡니다: `PUTDUK_PAYOUT_SECRET`
- Secret이 없으면 저장을 중단합니다 (`PAYOUT_SECRET_MISSING`, 503). 평문 fallback 금지.
- DB 트리거 `private.putduk_payout_ciphertext_guard`가 `account_number` / `usdt_address` / `encrypted_value`의 신규·변경 값을 `enc.v1.`만 허용합니다.
- 이미 `enc.v1.`인 값은 재암호화하지 않습니다.
- 일회성 전환: `pnpm ops:reencrypt-payout` (건수만 출력)

키를 분실하면 기존 암호문을 복호화할 수 없습니다. 출금 안내를 다시 저장해야 합니다. 평문 원본은 로그에 남기지 않습니다.

키 rotation 개요:

1. 새 값을 GitHub Secret과 Edge Secret에 **동시에** 넣지 말고, 먼저 복호화가 가능한 현재 키로 모든 행을 읽습니다.
2. 새 키로 재암호화한 뒤 두 곳의 Secret을 같은 값으로 바꿉니다.
3. Edge를 재배포하고 무결성 검사에서 `payout_plaintext=0`을 확인합니다.

## Security Advisor

`Leaked Password Protection Disabled`는 Auth 대시보드 설정이라 배포 실패 조건에서 분리합니다. 새 RLS 누락, public 노출, unsafe search_path 등 error 급은 실패합니다.

## 장애 대응

1. GitHub Actions가 2~5초에 step 없이 실패하면 YAML이 아니라 계정 Billing/spending limit을 먼저 봅니다.
2. Actions가 막히면 로컬/Cursor에서 `pnpm ops:bootstrap -- --apply --deploy-edge` 경로를 씁니다.
3. drift FAIL이면 `migration-aliases.json`을 함부로 늘리지 말고 버전 번호를 비교합니다.
4. 지급정보 저장 503이면 Edge Secret 이름 `PUTDUK_PAYOUT_SECRET` 존재부터 확인합니다. 값은 출력하지 않습니다.
