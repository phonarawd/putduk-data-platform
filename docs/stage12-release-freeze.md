# Stage 12 — Release Freeze / Final Launch Gate (SUPERSEDED)

기준일: 2026-09-21 KST  
상태: **SUPERSEDED — v0.2.0 최종 출시 판정에 사용 금지**

이 문서는 과거 Stage 12 시점의 release-freeze 기록이었다. 이후 v0.2.0 PR #59에서 runtime/Edge/release gate가 추가로 변경되었고, member/ops 도메인 mapping도 다시 미확정 상태가 되었다.

따라서 이 파일의 과거 `hiptk.app 변경 금지`, 과거 base SHA, 과거 local preflight PASS, 과거 Edge inventory, 과거 final launch 조건을 **현재 출시 승인 근거로 사용하지 않는다.** 과거 상세 내용은 Git history에 보존되어 있다.

## 현재 SSOT

v0.2.0 최종 출시에는 아래 문서를 사용한다.

- `docs/v0.2.0-domain-cutover.md` — member/ops domain, Auth, CORS, Edge, static cutover 순서와 fail-closed gate
- `docs/v0.2.0-phase6-release-gates.md` — auth/logout/PII browser release gate
- PR #59 — 현재 branch 변경 및 검증 상태

## 현재 release freeze

새 member/ops mapping이 명시되기 전에는 다음을 확정하거나 변경하지 않는다.

- DNS/custom domain 최종 cutover
- Supabase Auth Site URL / Redirect URL 최종값
- `PUTDUK_ALLOWED_ORIGINS` 최종값
- `dist/index.html` canonical/OG/JSON-LD/runtime origin
- `dist/admin/index.html` member/ops origin
- `dist/assets/origin-split.js` routing host
- `functions/_middleware.js` official member/ops routing host
- `dist/robots.txt` / `dist/sitemap.xml` canonical host
- final release PR merge/tag/launch 선언

## 현재 Production 관련 주의

- Production DB/migration/금액/업무 데이터는 이 문서 정리 때문에 변경하지 않는다.
- `member-task-detail`, `admin-work-asset`은 v0.2.0 코드에 존재하지만 현재 Production Edge inventory에는 아직 없다.
- static v0.2.0을 먼저 공개하면 위 두 기능 호출이 실패할 수 있으므로 Edge/Auth/CORS 준비가 static cutover보다 선행되어야 한다.
- GitHub Actions quota/runner 상태는 최종 release 승인 근거로 사용하지 않는다. 가능한 로컬/브라우저/read-only gate를 별도로 기록한다.

## Release gate

`pnpm release:deploy`는 `tooling/cloudflare/domain-cutover-audit.mjs --require-target`를 가장 먼저 실행한다.

명시적 `MEMBER_URL`/`MEMBER_DOMAIN` 및 `OPS_URL`/`OPS_DOMAIN`이 없거나, 해당 target이 canonical/runtime/robots/sitemap/origin split/middleware와 일치하지 않으면 release preflight는 fail-closed한다.

현재 판정은 **PENDING / BLOCKED UNTIL DOMAIN MAPPING IS EXPLICIT**이다.
