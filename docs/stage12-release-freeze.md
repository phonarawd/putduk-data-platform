# Stage 12 — Release Freeze / Final Launch Gate (SUPERSEDED)

기준일: 2026-09-21 KST  
상태: **SUPERSEDED — v0.2.0 최종 출시 판정에 사용 금지**

이 문서는 과거 Stage 12 시점의 release-freeze 기록이었다. 이후 v0.2.0 PR #59에서 runtime/DB migration/Edge/release gate가 추가로 변경되었고, member/ops 도메인 mapping도 다시 미확정 상태가 되었다.

따라서 이 파일의 과거 `hiptk.app 변경 금지`, 과거 base SHA, 과거 local preflight PASS, 과거 Edge inventory, 과거 final launch 조건을 **현재 출시 승인 근거로 사용하지 않는다.** 과거 상세 내용은 Git history에 보존되어 있다.

## 현재 SSOT

v0.2.0 최종 출시에는 아래 문서를 사용한다.

- `docs/v0.2.0-production-preflight.md` — DB migration부터 Edge/static/live smoke까지 Production 적용 순서와 현재 STOP 조건
- `docs/v0.2.0-domain-cutover.md` — member/ops domain, Auth, CORS, Edge, static cutover 순서와 fail-closed domain gate
- `docs/v0.2.0-phase6-release-gates.md` — auth/logout/PII browser release gate
- PR #59 — 현재 branch 변경 및 검증 상태

## 현재 release freeze

최종 Production preflight가 충족되기 전에는 다음을 확정하거나 변경하지 않는다.

- `20260921102905_phase1_kst_day_boundary.sql` Production 적용
- DNS/custom domain 최종 cutover
- Supabase Auth Site URL / Redirect URL 최종값
- `PUTDUK_ALLOWED_ORIGINS` 최종값
- `dist/index.html` canonical/OG/JSON-LD/runtime origin
- `dist/admin/index.html` member/ops origin
- `dist/assets/origin-split.js` routing host
- `functions/_middleware.js` official member/ops routing host
- `dist/robots.txt` / `dist/sitemap.xml` canonical host
- Edge Function Production 배포
- final release PR merge/tag/launch 선언

## 현재 Production 관련 주의

- Production DB/migration/금액/업무 데이터는 이 문서 정리 때문에 변경하지 않는다.
- `20260921102905_phase1_kst_day_boundary.sql`은 Production migration ledger에 아직 없으며, 현재 `private.prepare_putduk_task_run()`은 회원별 횟수만 KST 경계이고 노드 공급량은 기존 UTC/session-day 경계인 부분 적용 상태다.
- `member-task-detail`, `admin-work-asset`은 v0.2.0 코드에 존재하지만 현재 Production Edge inventory에는 아직 없다.
- 따라서 Production 순서는 **Phase 1 migration 적용·read-only 재검증 → Auth/CORS → Edge → static/domain → live smoke**여야 한다.
- GitHub Actions quota/runner 상태는 최종 release 승인 근거로 사용하지 않는다. 가능한 로컬/브라우저/read-only gate를 별도로 기록한다.

## Release gate

`pnpm release:deploy`는 `tooling/cloudflare/domain-cutover-audit.mjs --require-target`를 가장 먼저 실행한다.

명시적 `MEMBER_URL`/`MEMBER_DOMAIN` 및 `OPS_URL`/`OPS_DOMAIN`이 없거나, 해당 target이 canonical/runtime/robots/sitemap/origin split/middleware와 일치하지 않으면 release preflight는 fail-closed한다.

도메인 gate가 PASS하더라도 `docs/v0.2.0-production-preflight.md`의 migration/Edge/live 조건이 남아 있으면 최종 release는 PASS가 아니다.

현재 판정은 **PHASE 1 APPLIED — LIVE E2E / FINAL LAUNCH GATES REMAIN**이다.
과거 Stage 12 시점의 `BLOCKED — PRE-PRODUCTION GATES REMAIN` 문구는 이력 보존용으로만 남긴다.
