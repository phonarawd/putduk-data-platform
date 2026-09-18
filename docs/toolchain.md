# 퍼뜩 기술 기준과 최종 패치 순서

## 현재 기술 기준

- Runtime: Node.js 24 LTS
- Package manager: pnpm 12.4.2
- Frontend: Vanilla ES6+ 정적 구조
- UI: Tailwind CSS CDN, Lucide Icons, Chart.js
- Data/Auth: Supabase
- Server boundary: Supabase Edge Functions + RPC/DB transaction
- Deploy: Cloudflare Pages Git Integration
- PWA: `dist/manifest.webmanifest`, `dist/sw.js`

현재 최종 패치 범위에서는 Next.js, Turborepo, SSR, Server Actions로 이관하지 않는다.

## 운영 구조

```text
putduk-data-platform/
├─ dist/                         # 회원/운영자 정적 production 산출물
│  ├─ index.html
│  ├─ admin/index.html
│  ├─ assets/
│  ├─ manifest.webmanifest
│  └─ sw.js
├─ src/                          # 보안/세션/UI/업무/지갑/모션 모듈
├─ supabase/
│  ├─ migrations/
│  └─ functions/
│     ├─ admin-control/
│     └─ member-finance/
├─ scripts/automation/
├─ tooling/supabase/
├─ tooling/cloudflare/
├─ tests/
├─ docs/
└─ wrangler.toml
```

## 운영 원칙

1. 브라우저에서 잔액·보상·등급·운영자 권한을 직접 확정하지 않는다.
2. 모든 민감 변경은 인증된 Edge/RPC와 DB transaction을 거친다.
3. 지갑 변경은 ledger와 idempotency를 남긴다.
4. 운영자 민감 작업은 audit log를 남긴다.
5. 작업 타이머는 서버의 `expected_completed_at`과 canonical state를 기준으로 복원한다.
6. 회원 노출/배정 업무는 operator catalog 조건을 통과해야 한다.
7. service role/secret key는 브라우저와 정적 번들에 넣지 않는다.
8. FOMO/live simulation 영역은 명시적 요청 없이는 수정하지 않는다.

## 최종 패치 순서

```text
1. 운영 기준선/문서 정렬
2. operator catalog + manual assignment 백엔드 재검증
3. Admin 회원/업무 실제 DB 연결
4. 입금/출금 E2E
5. KYC E2E
6. 추천/지원금 E2E
7. 회원 UI와 canonical state 정렬
8. 토스트/UX 정리
9. motion 성능 보완
10. RLS/DB performance 보완
11. 전수 QA
12. release freeze
```

한 번에 여러 Phase를 섞지 않는다.

## 테스트 기준

가능한 경우 다음을 순서대로 사용한다.

```text
pnpm typecheck
pnpm test
pnpm test:e2e
pnpm test:a11y
pnpm security:scan
pnpm verify
pnpm healthcheck
```

GitHub Actions billing 제한 때문에 Actions 성공 여부를 production 배포의 필수 조건으로 사용하지 않는다. 로컬/CLI/MCP 검증 결과와 실제 운영 smoke test를 기준으로 한다.

## Supabase 변경 절차

```text
작업 브랜치
→ migration/Edge 변경
→ drift 확인
→ MCP/CLI Path A 적용
→ Edge ACTIVE/JWT 확인
→ integrity 확인
→ security advisor 확인
→ main 반영
```

운영 DB reset과 migration history rewrite는 금지한다. rollback보다 forward-fix를 우선한다.

## Cloudflare 변경 절차

```text
프론트 검증
→ main push
→ putduk-git-preview Git Integration
→ production 자동배포
→ app.hiptk.app / ops.hiptk.app smoke test
```

`wrangler pages deploy` 또는 GitHub Actions를 Cloudflare production 필수 경로로 사용하지 않는다.

## 향후 프레임워크 이관

정적 구조가 기능·금융·운영자 E2E까지 완성된 뒤에만 별도 프로젝트로 검토한다. 프레임워크 이관은 현재 출시 차단 이슈가 아니다.

## AI 기능

AI는 참고·보조 기능으로만 둔다.

- 자동 지급 승인 금지
- 자동 출금 승인 금지
- 자동 KYC 승인 금지
- 운영자 최종 승인 유지
- 모델/프롬프트 버전과 감사 근거를 남길 수 있을 때만 운영 기능에 연결
