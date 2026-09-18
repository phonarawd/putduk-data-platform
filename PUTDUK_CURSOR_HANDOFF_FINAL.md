# 퍼뜩(PUTDUK) 최종 운영 인계문

> 이 문서는 현재 운영 구조의 기준 문서다. 과거 Direct Upload, GitHub Actions 기반 Cloudflare 배포, Next.js/Turborepo 이관 계획은 운영 기본 경로가 아니다.

## 1. 운영 기준선

- Repository: `phonarawd/putduk-data-platform`
- Production branch: `main`
- Supabase project ref: `gaugwamwceqdnqdqrxqg`
- Cloudflare Pages production project: `putduk-git-preview`
- Member: `https://app.hiptk.app`
- Admin: `https://ops.hiptk.app/admin/`
- Build output: `dist`

현재 프론트는 정적 Cloudflare Pages 구조를 유지한다. Next.js/Turborepo 이관은 최종 패치 범위에서 수행하지 않는다.

## 2. 배포 기준

### 프론트

```text
작업 브랜치 검증
→ main 반영
→ Cloudflare Pages Git Integration
→ production 자동 배포
→ 운영 URL smoke test
```

Cloudflare production 배포를 GitHub Actions나 `wrangler pages deploy`에 의존시키지 않는다.

### Supabase

```text
코드/DB 변경
→ Supabase MCP/CLI Path A
→ migration/Edge/integrity/security 검증
→ main 반영
→ 필요한 프론트 변경은 Cloudflare Git Integration 자동 배포
```

GitHub Actions의 Supabase workflow는 billing/spending 제한 때문에 운영 필수 경로가 아니며 수동 보조 경로로만 유지한다.

## 3. 현재 서버 상태

- `admin-control`: ACTIVE, JWT 검증 ON
- `member-finance`: ACTIVE, JWT 검증 ON
- 협력사: 운영 DB에 실제 데이터 존재
- 업무 노드: 운영 DB에 실제 데이터 존재
- 특정 회원 배정, 입금/출금 요청, 지원금, 감사로그: 실제 운영 테이블 사용

Supabase Security Advisor의 `Leaked Password Protection Disabled` WARN은 현재 Free 플랜 제한으로 분류한다. 이를 우회하지 않는다.

## 4. 서버 불변조건

### 카탈로그

회원 노출/배정은 운영자 등록 카탈로그만 허용한다.

```text
supply_source = operator
catalog_status = published
enabled = true
partner brand approved
logo usage approved
```

외부 writer/parser/repricing은 operator 행의 가격·이미지·버전을 변경하지 못해야 한다.

### 업무

```text
reserved
→ in_progress
→ checkpointed
→ submitted
→ review_pending
→ approved / rework / rejected
```

보상액, 완료예정시간, 상태 전이는 서버가 기준이다. 브라우저 입력으로 승인 상태나 보상액을 확정하지 않는다.

### 금액

```text
사용자/운영자 요청
→ Edge/RPC
→ DB transaction
→ ledger/audit
→ canonical state
→ UI refresh
→ 성공 토스트
```

프론트엔드에서 지갑 잔액을 직접 증가·감소시키지 않는다.

### 지급정보

- 암호문 prefix: `enc.v1.`
- AES-GCM
- `PUTDUK_PAYOUT_SECRET`
- Secret 누락 시 fail-closed
- 평문 fallback 금지
- DB ciphertext guard 유지

## 5. 현재 최종 패치 순서

1. 운영 기준선/문서 정렬
2. operator catalog + manual assignment 백엔드 재검증
3. 운영자 회원/업무 실제 DB 연결 마감
4. 입금/출금 E2E
5. KYC private Storage E2E
6. 추천/지원금 조건·원장 E2E
7. 회원 UI와 canonical state 1:1 정렬
8. 토스트/UX 정리
9. motion 성능 보완
10. RLS/DB performance 보완
11. 전수 QA
12. release freeze

각 단계는 한 번에 하나만 수행하고 검증 후 다음 단계로 이동한다.

## 6. 운영자 최종 범위

- 회원 목록/검색/상세
- 상태/등급/차단 관리
- 실제 지갑/업무/입금/출금/KYC/추천 내역
- 협력사 등록·승인·공개
- 업무 카드 등록·수정·공개·중지·보관·복구
- 특정 회원 업무 배정
- 업무 검수
- 입금/출금 수동 검수
- KYC 검수
- 추천 보상/지원금 관리
- 회원 알림
- 감사로그

정적 샘플 성공값이나 가짜 잔액으로 운영 상태를 대신하지 않는다.

## 7. 회원 최종 범위

- Auth/세션/비밀번호 재설정
- 회원정보/등급
- 공개 업무 및 본인 배정 업무
- 업무 시작/복원/제출/검수 결과
- 지갑 및 원장 기반 금액 표시
- 입금/출금 요청
- KYC
- 추천/지원금
- 알림
- PWA

## 8. 금융 오픈 원칙

금융 기능은 KYC, 지급정보 암호화, 출금 PIN, hold/rollback, ledger, idempotency, 운영자 검수 E2E가 통과되기 전 전체 오픈하지 않는다.

출금 상태 예시:

```text
request
→ balance/KYC/PIN validation
→ hold
→ admin review
→ approved/rejected
→ completed or hold release
→ ledger
→ notification
```

## 9. KYC

- private Storage만 사용
- 원본 공개 URL 금지
- 짧은 signed URL 미리보기
- 파일 검증
- review_pending/approved/rejected
- reviewer/reviewed_at/reason
- 감사로그

## 10. 추천/지원금

추천 보상은 실제 조건 충족 후에만 지급한다. 가입만으로 보상을 확정하지 않는다.

지원금은 현금성 출금가능잔액과 분리하고 지급·사용·만료·회수 이력을 원장에 남긴다.

## 11. 성능/DB

현재 Performance Advisor의 unused index는 서비스 사용량이 충분하지 않은 상태에서 즉시 삭제하지 않는다. 먼저 `nodes`, `partner_brands`의 중복 permissive SELECT RLS를 의미 보존 방식으로 검토한다.

## 12. FOMO 보호 범위

다음 영역은 별도 명시 없이는 수정하지 않는다.

- FOMO feed/counter/timer/slot
- `bot_enabled`
- `crowd_min`
- `crowd_max`
- `burn_per_minute`
- 관련 live simulation UI/logic

주변 파일을 수정하더라도 FOMO diff는 0이어야 한다.

## 13. 금지 사항

- 운영 DB reset
- migration history rewrite
- service role/secret key 브라우저 노출
- AI 자동 지급 승인
- AI 자동 KYC 승인
- 자동 출금 승인
- 신규 Supabase 프로젝트로 임의 이전
- 신규 Cloudflare production 프로젝트로 임의 이전
- GitHub Actions 결제 우회
- Next.js/Turborepo 대규모 이관
- 운영 MX/SPF/DKIM/Resend TXT 임의 수정

## 14. 검증 기준

최종 완료는 화면 표시가 아니라 실제 서버 상태와 일치해야 한다.

```text
UI = canonical DB state
운영자 승인 = transaction + audit
지갑 = ledger
업무 보상 = review 결과
입출금 = 실제 request 상태
KYC = private Storage + review state
배포 = main → Cloudflare Git Integration production
```

## 15. 단계별 보고 형식

```text
작업 상태:
변경 파일:
브랜치:
커밋 SHA:
Supabase 변경:
Edge Function 변경:
Cloudflare 영향:
검증/테스트:
운영 영향:
FOMO 변경:
다음 한 단계:
```

구현하지 않은 기능을 완료라고 보고하지 않는다.
