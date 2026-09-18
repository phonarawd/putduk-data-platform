# 퍼뜩 데이터 노드 운영 아키텍처

## 현재 운영 기준

- Repository: `phonarawd/putduk-data-platform`
- Supabase: `gaugwamwceqdnqdqrxqg`
- Member: `https://app.hiptk.app`
- Admin: `https://ops.hiptk.app/admin/`
- Frontend deploy: Cloudflare Pages Git Integration (`main` → production)
- Backend deploy: Supabase MCP/CLI Path A

회원·운영자 화면은 하나의 저장소와 하나의 Supabase 프로젝트를 사용하되, 화면 origin과 권한 경계를 분리한다.

## 공개 상태와 카탈로그 경계

회원 노출과 수동 배정은 운영자 등록 카탈로그만 허용한다.

필수 조건:

```text
supply_source = operator
catalog_status = published
enabled = true
partner brand verification_status = approved
partner brand logo_usage_status = approved
```

legacy external writer/parser/repricing은 operator 행을 변경하지 못해야 한다.

## 회원 인증과 고유 번호

회원가입과 세션은 현재 운영 Supabase Auth에 연결한다. 가입 트리거가 공개 회원번호와 비공개 개인정보를 분리해 만들고 사용자별 기본 지갑·지원금·추천 관계를 준비한다.

브라우저에는 publishable key만 사용한다. service role/secret key는 정적 번들에 넣지 않는다.

## 작업 실행과 화면 복원

브라우저 애니메이션은 화면 표현만 담당하고 실제 기준은 서버 상태다.

1. 회원이 공개 업무 또는 본인에게 배정된 업무를 시작한다.
2. 서버가 회원·노드·배정·일일 한도·보상 범위를 검증한다.
3. 실행번호, 시작 시각, 완료 예정 시각, 연출 변형, 보상 금액을 서버가 확정한다.
4. 화면을 닫아도 실행 상태는 서버에 유지된다.
5. 재접속 시 서버 시각과 canonical state를 다시 읽어 진행률을 복원한다.
6. 완료 후 회원은 자신의 실행만 제출할 수 있다.

상태 전이는 다음 범위를 사용한다.

```text
reserved
→ in_progress
→ checkpointed
→ submitted
→ review_pending
→ approved / rework / rejected
```

## 검수와 보상

운영자 검수 성공 시 서버 트랜잭션 안에서 다음을 함께 처리한다.

- `task_runs` 상태 갱신
- reward 상태 갱신
- 작업 보상 지갑 반영
- 출금 가능 잔액 반영
- `private.ledger_entries` 기록
- `task_events` 기록
- 회원 알림 생성
- `review_decisions` 기록
- `admin_audit_logs` 기록

idempotency key와 행 잠금으로 이중 승인·이중 지급을 막는다.

## 관리자 권한 경계

운영자 화면 주소 자체는 권한이 아니다. 모든 민감 요청은 Edge Function에서 JWT와 운영자 역할을 다시 확인해야 한다.

- `admin-control`: 운영자/검수/회원/카탈로그 경계
- `member-finance`: 회원 금융 요청 경계

private 스키마는 브라우저에서 직접 민감 데이터를 조작하는 경로로 사용하지 않는다.

## 금융 아키텍처

금액 변경은 다음 순서만 허용한다.

```text
요청
→ 서버 검증
→ DB transaction
→ ledger/audit
→ canonical state
→ UI refresh
```

입금·출금은 운영자 수동 검수 모델을 유지한다. 프론트엔드에서 잔액을 직접 증가·감소시키지 않는다.

지급정보는 `enc.v1.` ciphertext와 `PUTDUK_PAYOUT_SECRET`을 사용하며 Secret 누락 시 fail-closed 한다.

## KYC

- private Storage
- public 원본 URL 금지
- 짧은 signed URL 미리보기
- 파일 검증
- review state
- 검수자/시간/사유
- audit log

## 추천과 지원금

추천 보상은 가입만으로 확정하지 않는다. 실제 입금·업무 등 운영 정책의 조건을 충족한 뒤 서버 판정과 운영자 승인, 원장 기록을 거친다.

지원금은 출금 가능 현금성 잔액과 구분하고 지급·사용·만료·회수 이력을 관리한다.

## PWA와 테마

현재 정적 `dist/` 구조를 유지한다. 밝은 모드 기본, 다크 모드 선택, 서비스 워커, 매니페스트, 설치 아이콘을 함께 배포한다.

## 현재 기능 플래그 원칙

- 회원 업무 API는 이미 운영 경로가 있으므로 임의로 비활성화하지 않는다.
- 금융 API는 KYC/출금보안/원장 E2E 검증 전 전체 오픈하지 않는다.

## 배포 원칙

프론트:

```text
main push
→ Cloudflare Pages Git Integration
→ production
→ app/ops smoke test
```

백엔드:

```text
Supabase MCP/CLI Path A
→ migration/Edge/integrity/security 검증
→ main 반영
```

GitHub Actions와 Wrangler 직접 배포를 production 필수 경로로 만들지 않는다.

## FOMO 보호 범위

FOMO/live simulation 영역은 별도 명시 없이는 수정하지 않는다.

- `bot_enabled`
- `crowd_min`
- `crowd_max`
- `burn_per_minute`
- feed/counter/timer/slot logic

주변 변경 시에도 FOMO diff는 0이어야 한다.
