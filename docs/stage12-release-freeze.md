# Stage 12 — Release Freeze / Final Launch Gate

기준일: 2026-09-21 KST  
Repository: `phonarawd/putduk-data-platform`  
Production base SHA: `29a2fbd73685c2e5e5de453ebf0498932a3aa95a`  
Production Supabase: `gaugwamwceqdnqdqrxqg` (`PUTDUK-DATA-PRODUCTION`)

## 1. 출시 범위 고정

퍼뜩은 회원이 온라인 업무를 선택하고 수행·제출한 뒤 운영자 검수와 정산 상태를 확인하는 **온라인 업무 플랫폼**이다. 채굴/마이닝 서비스가 아니다.

Stage 12에서는 기능 추가, 카탈로그 공개, 금융 오픈, 도메인 재설계를 하지 않는다. Stage 1~11에서 검증된 현재 구조를 동결하고 최종 출시 근거만 기록한다.

## 2. 운영 도메인 — 변경 금지

현재 `hiptk.app` 계열은 이미 운영 배포가 완료된 상태이며 Stage 12에서 **어떠한 DNS/custom domain/origin/Auth/CORS/canonical 변경도 하지 않는다.**

현재 코드와 운영 문서의 고정 경계:

- 회원 canonical/origin: `https://app.hiptk.app/`
- 운영자 origin: `https://ops.hiptk.app/admin/`
- 기존 `hiptk.app`, `www.hiptk.app`, `go.hiptk.app` 라우팅: 현 상태 유지
- 사용자 확인 기준 `https://hiptk.com` 연결도 현 상태 유지하며 이 PR에서 재매핑하지 않는다.

`putduk.com` 또는 다른 신규 도메인 전환은 이 Stage 12의 범위가 아니며, 별도 명시적 승인 없이는 기존 운영 도메인을 대체하지 않는다.

관련 파일은 현 상태를 유지한다.

- `dist/index.html`: member canonical/OG/runtime origin = `app.hiptk.app`
- `dist/admin/index.html`: member origin = `app.hiptk.app`, ops origin = `ops.hiptk.app`
- `dist/assets/origin-split.js`: member/admin origin 분리 유지
- `dist/sitemap.xml`: `app.hiptk.app` canonical URL 유지
- `dist/manifest.webmanifest`: 상대 `start_url`/`scope` 유지
- `dist/sw.js`: 네트워크 통과 + push 동작 유지

## 3. 배포 기준선

- Cloudflare Pages project: `putduk-git-preview`
- production branch: `main`
- output directory: `dist`
- production path: `main` → Cloudflare Pages Git Integration
- 구 Direct Upload project `putduk-data-platform`: 변경 금지
- GitHub Actions: 운영 gate로 사용하지 않으며 Stage 12에서 실행/재실행 금지

Stage 12 PR은 `[skip ci]` 단일 커밋으로 생성하고 같은 요청에서 병합하지 않는다.

## 4. Git 기준선

Stage 12 시작 시 원격 `main`은 Stage 11 병합 SHA와 동일하다.

```text
29a2fbd73685c2e5e5de453ebf0498932a3aa95a
```

Stage 11 이후 runtime/database code 변경은 없는 상태에서 Release Freeze 문서만 추가한다.

Rollback 기준도 이 SHA다. Stage 12 병합 후 문제가 확인되면 DNS를 변경하지 않고 명시적 revert 또는 forward-fix로 복구한다.

## 5. Local release preflight

동일 base SHA에서 Stage 12 진입 전에 `pnpm release:deploy`가 PASS했다.

- static release files: 32
- JavaScript syntax: 144 files PASS
- unit: 292 pass / 0 fail
- backend guards: PASS
- E2E static shell: 4 pass
- accessibility: 3 pass
- security scan: 403 files PASS
- performance configuration/fallback: PASS
- local health: PASS

이 preflight는 Cloudflare API 직접 배포나 Production mutation을 수행하지 않았다.

## 6. Production Supabase read-only gate

2026-09-21 Stage 12 재확인 시 Production project는 `ACTIVE_HEALTHY`다.

### Edge Functions

모두 ACTIVE:

- `admin-control` v54 — `verify_jwt=true`
- `member-finance` v35 — `verify_jwt=true`
- `admin-phase5` v6 — `verify_jwt=true`
- `member-push` v1 — `verify_jwt=true`
- `push-dispatch` v1 — `verify_jwt=false` (기존 의도된 dispatch 구조, 변경 금지)
- `admin-master` v1 — `verify_jwt=true`
- `member-experience` v4 — `verify_jwt=true`

### Integrity

`tooling/supabase/verify-integrity.sql`과 동일한 read-only 조건으로 재검증:

- payout plaintext: 0
- payout encrypted: 3
- payout total: 3
- negative available: 0
- negative held: 0
- duplicate wallet bucket: 0
- multiple active task runs: 0
- self referral: 0
- duplicate invitee: 0
- invalid node assignment: 0
- invalid brand assignment: 0

### Stage 4 MASTER 120 invariant

Stage 4 seed invariant과 동일한 조건으로 read-only 재검증:

- catalog templates: 120
- version 1 published definitions: 120
- draft + disabled nodes: 120
- accidentally live: 0
- active internal work orders: 120
- distinct semantic fingerprints: 120

120개 업무는 출시 준비와 별개로 계속 `draft + disabled` 상태를 유지한다.

## 7. Migration state

Production에는 Stage 1~10/Stage 11 기준에 필요한 migration이 적용되어 있다. 최신 확인에는 다음이 포함된다.

- `putduk_generic_work_engine`
- `putduk_generic_work_engine_rpc_security`
- `putduk_work_catalog_fingerprint`
- `putduk_120_work_catalog_seed`
- `putduk_admin_master_21`
- `putduk_member_experience_snapshot`
- `stage10_task_runs_real_activity_index`

Historical compatibility 항목 `putduk_money_ops_pin_copy_fix`는 삭제하거나 재적용하지 않는다. Stage 12는 migration을 추가하지 않는다.

## 8. Advisor gate

### Security Advisor

신규 Stage 12 보안 경고 없음.

Known WARN:

- `Leaked Password Protection Disabled` — 기존 운영 warning

Accepted INFO:

- `rls_enabled_no_policy` 5개
  - `private.admin_content_items`
  - `private.admin_money_operations`
  - `private.partner_budget_allocations`
  - `private.partner_budget_ledger`
  - `private.partner_funding_pools`

위 5개는 private service-role-only deny-by-default 경계이므로 Stage 12에서 authenticated policy를 임의 추가하지 않는다.

### Performance Advisor

- `unused_index`: INFO 59개
- Stage 10 `task_runs_real_activity_updated_idx` 포함

서비스 사용량이 충분하지 않은 상태의 unused INFO만을 이유로 index를 삭제하지 않는다.

## 9. 실제 배포 / smoke 근거

Stage 12 이전 read-only smoke에서 기존 운영 주소가 HTTP 200 및 회원/운영자 shell을 반환한 기록이 있다. 당시에는 신규 도메인 전환 결정 때문에 출시 판정에서 제외했지만, 해당 전환 결정은 사용자에 의해 철회되었다.

현재 사용자 확인 기준으로 `hiptk.app` 계열은 정상 배포 상태이며 변경 금지다. 따라서 Stage 12에서는 도메인/DNS/Auth/CORS를 재설정하지 않고 현재 운영 배포를 release baseline으로 동결한다.

Stage 12 PR은 runtime 파일을 변경하지 않으므로 PR 생성 시 운영 origin에 변경을 발생시키지 않는다. PR 병합은 별도 사용자 지시에서만 수행하며, 병합 이후 동일 `dist`가 Cloudflare Pages에 재배포되면 그때 운영 URL smoke를 다시 확인한다.

## 10. 보안/금융 금지선

Stage 12에서 다음을 절대 수행하지 않는다.

- GitHub Actions 실행 또는 재실행
- Production wallet/ledger 잔액 조작
- 가짜 입금·출금·정산·지급 생성
- safety/auth/RLS/trigger 우회
- service-role/secret 브라우저 노출
- raw KYC/계좌번호/USDT 주소/지급정보 원문 출력
- 이미 적용된 migration 재적용
- Stage 4 120개 업무 임시 publish
- unrelated DNS/MX/SPF/DKIM/Resend TXT 변경
- `hiptk.app` 계열 custom domain/origin 변경
- 구 Direct Upload Cloudflare project 변경

Production money mutation이 필요한 E2E는 release gate에서 제외하고, boundary/static/read-only evidence로 판정한다.

## 11. Release Gate 판정

현재 Stage 12 PR 생성 조건은 충족한다.

- Stage 1~11 완료 및 `main` 병합: PASS
- base SHA 고정: PASS
- local release preflight: PASS
- Production project health: PASS
- Edge ACTIVE/JWT contract: PASS
- Production integrity: PASS
- Stage 4 120 draft/disabled, accidentally live 0: PASS
- Security Advisor: known WARN/accepted INFO only
- Performance Advisor: accepted INFO only
- Synthetic FOMO: Stage 9에서 실제 activity 기반으로 교체된 현재 구조 유지
- hiptk.app production domains: current deployment frozen, no Stage 12 changes
- GitHub Actions: not used
- Production money mutation: not used

## 12. PR / Merge / Launch 절차

이 문서를 Stage 12의 단일 변경으로 커밋하고 PR을 생성한 뒤 STOP한다.

다음 사용자 지시에서만:

1. PR state/head/base/ahead/behind/mergeable 재확인
2. 변경 파일이 `docs/stage12-release-freeze.md` 한 개뿐인지 확인
3. squash merge
4. 새 `main` SHA 확인
5. Cloudflare Pages Git Integration 배포 확인
6. 회원/운영자 production smoke 확인
7. 이후 release tag/final launch 선언 여부 결정

Stage 12 PR 생성과 merge를 같은 요청에서 수행하지 않는다.
