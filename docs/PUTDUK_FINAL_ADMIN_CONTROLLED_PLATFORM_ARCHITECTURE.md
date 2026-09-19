# 퍼뜩 최종 통합 아키텍처 — 회원경험·업무잔액·파트너예산·FOMO·어드민 완전제어

> 기준일: 2026-09-20
> Repository: `phonarawd/putduk-data-platform`
> Production branch: `main`
> Production Supabase: `gaugwamwceqdnqdqrxqg`
> Member: `https://app.hiptk.app`
> Admin: `https://ops.hiptk.app/admin/`
>
> 이 문서는 `PUTDUK_WORK_BALANCE_ARCHITECTURE_FINAL.md`와 `PUTDUK_MEMBER_EXPERIENCE_CATALOG_FOMO_FINAL.md`를 하나의 운영 기준으로 합친 최종 통합본이다. 핵심 원칙은 **회원에게 보이는 주요 운영값과 경험 요소를 어드민에서 제어하되, 금액·예산·업무상태·FOMO 숫자는 실제 canonical DB 상태와 감사로그를 기반으로만 노출**하는 것이다.

---

# 1. 퍼뜩의 최종 제품 정의

## 1.1 한 문장

**공고를 찾고 지원하고 기다리는 대신, 지금 가능한 데이터 업무를 골라 바로 수행하고 검수·정산받는 온라인 업무 플랫폼.**

## 1.2 회원이 처음 30초 안에 이해해야 할 네 가지

1. 퍼뜩은 일반적인 구인공고 게시판이 아니다.
2. 신규 회원은 퍼뜩이 제공하는 10,000원 체험 지원금으로 첫 업무를 경험한다.
3. 일반 업무는 업무잔액 일부가 업무 중 잠시 잠기고, 정상 정산되면 같은 금액이 업무잔액으로 돌아온다.
4. 수당은 잔액 보유가 아니라 실제 업무 수행과 검수 승인 결과로만 출금가능 잔액에 지급된다.

## 1.3 브랜드 메시지

대표 헤드라인:

`공고를 찾지 마세요. 오늘 할 일을 고르세요.`

보조 카피:

`지원하고 기다리는 구직에서, 확인하고 바로 시작하는 업무로.`

`AI가 일을 잘게 나누고, 퍼뜩이 지금 가능한 업무를 바로 보여줍니다.`

`면접을 기다리는 시간 대신, 오늘 끝낼 수 있는 업무.`

## 1.4 전 연령 UX 원칙

퍼뜩은 20대부터 70대까지 별도 설명 없이 핵심 플로우를 수행할 수 있도록 설계한다.

- 한 화면 한 개의 주 CTA
- 본문/금액/버튼 가독성 우선
- 주요 버튼 최소 약 48px 높이
- 터치 영역 충분히 확보
- 중요한 설명을 작은 회색 글씨에 숨기지 않음
- 숫자는 항상 천 단위 쉼표
- `지원금 / 업무잔액 / 출금가능` 명칭을 전 화면에서 동일하게 사용
- 입금·출금·업무시작은 결과 미리보기 후 최종 확인
- 애니메이션은 짧고 의미 중심, reduced-motion 지원
- 오류 시 `무슨 일인지 + 지금 무엇을 하면 되는지`를 한 화면에서 안내
- 320px 모바일부터 데스크톱까지 동일 business state 사용

---

# 2. 돈과 업무의 최종 불변조건

## 2.1 세 칸 원장 유지

```text
support_grant = 퍼뜩 체험 지원금
work_balance  = 일반 업무 보증 가능 잔액
available     = 실제 출금 가능한 확정 수당/지급액
```

이 세 칸을 합치지 않는다.

## 2.2 신규 가입 지원금

운영 기본값은 10,000원이다.

관리자는 어드민에서 캠페인 금액·활성여부·기간·대상·문구를 제어할 수 있어야 한다.

단, 변경은 즉시 감사로그에 남기며 기존 지급 이력을 소급변경하지 않는다.

## 2.3 일반 업무 시작

```text
work_balance.available >= node.stake_krw
→ 필요한 보증금만 available에서 held로 이동
→ 업무 수행
```

## 2.4 업무 승인

```text
held 원금 → work_balance.available로 복귀
업무 수당 → available로 지급
```

## 2.5 원금 포함 출금

원금 포함 출금을 허용한다.

출금 자체를 이유로 자동 등급 강등이나 혜택 박탈을 하지 않는다.

대신 출금 후 남은 `work_balance`를 기준으로 가능한 최대 업무가 다시 계산된다.

예:

```text
출금 전 업무잔액       10,000,000원
출금 후 업무잔액        1,000,000원
출금 전 최대 업무       10,000,000원
출금 후 최대 업무        1,000,000원
```

---

# 3. MAX BALANCE FIT 최종 추천 엔진

## 3.1 핵심

회원에게는 **현재 사용 가능한 업무잔액 이하에서 가장 큰 실제 공개 업무**를 가장 먼저 보여준다.

```text
eligible = published/enabled/operator nodes
           + partner approved
           + assignment 조건 충족
           + stake <= work_available

recommendation = eligible ORDER BY stake DESC
```

## 3.2 추천 우선순위

1. 현재 진행 중/재작업 run 복원
2. 본인 배정 업무 중 가능한 최대 stake
3. 일반 공개 업무 중 가능한 최대 stake
4. 차순위 업무들
5. 현재 잔액보다 큰 업무 중 가장 가까운 한 개를 `다음 업무`로 표시

## 3.3 배정 전용 여부

`requires_assign=true`만 canonical 기준이다.

다음 조건은 배정 전용을 자동 의미하지 않는다.

- 초고액 tier
- 30,000,000원 이상
- 특정 등급

어드민에서 `requires_assign`을 명시적으로 ON/OFF 한다.

---

# 4. 신규회원 온보딩 최종 루프

## 4.1 가입 완료

```text
🎉 퍼뜩 사원이 되었습니다

첫 업무는 퍼뜩이 지원합니다.
체험 지원금 10,000원이 준비됐어요.

[첫 업무 시작]
```

## 4.2 3장 설명

### 1장 — 퍼뜩이란?

`공고를 보고 지원하는 서비스가 아니라, 지금 가능한 데이터 업무를 직접 고르는 플랫폼입니다.`

### 2장 — 왜 업무잔액이 필요한가?

`일반 업무는 한정된 업무를 맡는 동안 업무 보증금이 잠시 잠깁니다. 정상 정산되면 보증금은 전액 업무잔액으로 돌아옵니다.`

### 3장 — 수당은 어떻게 생기나?

`잔액을 보유한다고 수당이 생기지 않습니다. 실제 업무를 수행하고 검수 승인을 받아야 발생합니다.`

## 4.3 체험 업무

```text
🎁 퍼뜩 지원 체험
회원 부담 0원
지원금 사용 10,000원
완료 수당 +3,000원
```

## 4.4 첫 승인

```text
✅ 첫 업무 승인
출금 가능 수당 +3,000원

이제 내 업무잔액에 맞는 일반 업무를 선택할 수 있어요.
```

## 4.5 입금 전 설명

입금계좌보다 먼저 `왜 입금하나요?`를 보여준다.

```text
업무잔액 300,000원 → 최대 300,000원급 업무
업무잔액 1,000,000원 → 최대 1,000,000원급 업무
```

`일반 업무의 보증금은 정상 정산 후 다시 업무잔액으로 돌아옵니다.`

---

# 5. 업무 난이도·수당·업무 경험

## 5.1 소액 업무

- 비교/입력/선택 작업이 상대적으로 많음
- 5~10개 항목 검수 가능
- 초보자가 퍼뜩 업무흐름을 익히는 구간
- 수행시간은 운영자가 어드민에서 설정

## 5.2 중액 업무

- 핵심 필드 3~5개 중심
- 입력량 감소
- 판단 정확도 비중 증가

## 5.3 고액 업무

- 1~3개 핵심 판단 중심
- 사전 정제된 데이터 최종 검수 성격
- 클릭 수는 적지만 정확성 기준은 높음
- 높은 수당의 근거는 입금액이 아니라 실제 파트너 업무 가치/SLA/정확성 요구

## 5.4 초고액/특수 업무

- 최종 QA
- 대형 데이터세트 샘플검증
- 파트너 전담 작업
- 필요하면 `requires_assign=true`

---

# 6. 120+ 업무 템플릿 카탈로그

플랫폼은 업무가 풍부해 보이기 위해 가짜 카드를 만드는 것이 아니라 **실제 발행 가능한 템플릿 라이브러리**를 120종 이상 보유한다.

대표 카테고리:

1. 상품 카탈로그 QA
2. 가격·프로모션 검수
3. 택배·배송 데이터
4. 창고·3PL 데이터
5. 해상·항공 포워딩
6. 이미지 라벨링
7. OCR·문서 검수
8. 커머스 운영 QA
9. 고객문의 데이터 분류
10. 번역·현지화 QA
11. AI 결과 평가
12. 고가치 최종 QA

각 카테고리 최소 10종 이상의 템플릿을 준비한다.

템플릿은 곧바로 회원에게 노출하지 않는다.

```text
업무 템플릿
→ 어드민에서 파트너 연결
→ stake/stipend/시간/자리/난이도 설정
→ 검토
→ published
→ 회원에게 실제 업무로 노출
```

회원에게 표시되는 `현재 업무 수`는 실제 published node 수만 사용한다.

---

# 7. 파트너 지급예산·업무예산 최종 구조

## 7.1 목표

회원에게 다음과 같은 신뢰 정보를 보여줄 수 있게 한다.

```text
파트너 지급예산 확보됨
이 업무 배정예산 120,000,000원
현재 예약 15,000,000원
지급 완료 58,000,000원
잔여 업무예산 47,000,000원
```

단, 이 숫자는 **실제 어드민에 등록되고 검증된 예산 원장**에서만 계산한다.

## 7.2 신규 테이블: `private.partner_funding_pools`

권장 필드:

```text
id uuid
partner_brand_id uuid
public_id text
currency KRW/USDT
committed_amount numeric
funded_amount numeric
allocated_amount numeric
reserved_amount numeric
spent_amount numeric
available_amount numeric (계산 또는 transaction 유지)
status draft/pending/verified/paused/exhausted/closed
display_enabled boolean
public_label text
source_type contract/deposit/manual_verified/other
evidence_reference text nullable
effective_from timestamptz
effective_until timestamptz
created_by uuid
verified_by uuid nullable
verified_at timestamptz nullable
updated_by uuid
created_at timestamptz
updated_at timestamptz
version bigint
```

## 7.3 신규 테이블: `private.partner_budget_allocations`

파트너 전체 예산을 특정 node/캠페인에 배정한다.

```text
id uuid
funding_pool_id uuid
node_id uuid nullable
campaign_key text nullable
allocated_amount numeric
reserved_amount numeric
spent_amount numeric
status active/paused/completed/cancelled
display_enabled boolean
created_by uuid
updated_by uuid
created_at timestamptz
updated_at timestamptz
```

## 7.4 어드민 제어

어드민 `파트너 > 지급예산`에서 다음을 모두 제어한다.

- 파트너 선택
- 통화
- 약정예산
- 실제 확보예산
- 업무별 배정예산
- 표시 여부
- 공개 라벨
- 효력기간
- 검증 상태
- 일시중지
- 종료
- 증빙 참조

## 7.5 공개 규칙

회원 화면에 `지급예산 확보` 뱃지를 노출하려면:

```text
status = verified
AND display_enabled = true
AND funded_amount > 0
AND effective 기간 유효
```

이어야 한다.

`draft`, `pending`, `manual 미검증` 상태에서는 회원에게 `확보됨`으로 표시하지 않는다.

## 7.6 감사로그

다음 변경은 모두 `admin_audit_logs`에 남긴다.

- committed_amount 변경
- funded_amount 변경
- allocation 변경
- verified 승인/해제
- display_enabled 변경
- 상태 변경
- public_label 변경

로그에는 before/after, admin_id, reason, timestamp를 저장한다.

---

# 8. 회원 업무 카드 최종 정보구조

업무 카드는 다음 순서를 기본으로 한다.

```text
[파트너 로고] CJ대한통운
배송 데이터 최종 확인

예상 시간 45초
업무 보증금 1,000,000원
완료 수당 +100,000원
정상 정산 시 보증금 전액 복귀

✅ 파트너 지급예산 확보됨
이 업무 잔여 배정예산 18,000,000원
오늘 남은 자리 3개

[업무 시작]
```

실제 funding ledger가 없거나 공개 OFF이면 예산 영역 자체를 숨긴다.

---

# 9. FOMO 최종 구조

## 9.1 허용되는 FOMO

실제 데이터만 사용한다.

- 오늘 남은 자리
- 실제 published 업무 수
- 해당 업무 실제 잔여 capacity
- 실제 승인 완료 건수
- 내 오늘 남은 업무 횟수
- 실제 검증된 파트너 잔여 업무예산
- 실제 새로 공개된 고액업무
- 실제 assignment 만료시간

## 9.2 금지되는 FOMO

- 가짜 사용자 수
- 가짜 신청자 수
- 실제와 무관한 카운트다운
- 허위 예산
- 허위 `마감 임박`
- 실제로 없는 대기업 업무/협력관계

## 9.3 회원 노출 예시

```text
🔥 오늘 남은 자리 2 / 12
✅ 오늘 승인 완료 7건
⏱ 내 오늘 남은 업무 2회
```

## 9.4 FOMO 어드민 제어

어드민에서 제어 가능한 항목:

- FOMO 영역 전체 ON/OFF
- 노출 위치
- 어떤 실데이터 메트릭을 보여줄지
- 최소 노출 조건
- 배지 문구
- 강조 강도
- motion ON/OFF
- 특정 node 제외
- 특정 파트너 제외

단, 숫자 자체는 서버 canonical 값에서 계산하며 관리자 임의 숫자를 실시간 숫자로 가장하지 않는다.

---

# 10. 도파민·성취 피드백

도파민은 무작위 보상이 아니라 **실제 성취 이벤트**에서 만든다.

주요 이벤트:

- 가입 완료
- 체험 지원금 지급
- 첫 업무 시작
- 제출 완료
- 첫 승인
- 수당 지급
- 업무잔액 증가
- 더 큰 업무 해금
- 고액업무 발견
- 업무 연속완료
- 등급 혜택 증가
- 파트너 전담 배정

예:

```text
🚀 1,000,000원급 업무가 열렸어요
현재 업무잔액 1,000,000원
완료 수당 +100,000원
[최대 업무 보기]
```

또는:

```text
✅ 업무 승인
보증금 1,000,000원 업무잔액 복귀
수당 +100,000원 출금가능에 추가
[다음 업무 시작]
```

---

# 11. FAQ 최종 CMS

FAQ는 하드코딩하지 않고 어드민 CMS로 관리한다.

권장 테이블 또는 설정 구조:

`public.member_faq_entries`

```text
id
category
question
answer
sort_order
published
featured
audience
created_by
updated_by
created_at
updated_at
```

필수 FAQ:

### 퍼뜩은 어떤 플랫폼인가요?

`공고에 지원하고 채용을 기다리는 서비스가 아니라, 기업 데이터 업무를 작은 단위로 나눠 회원이 지금 가능한 업무를 직접 선택하고 수행하는 플랫폼입니다.`

### 왜 입금해야 하나요?

`일반 업무는 한정된 업무를 맡는 동안 업무 보증금이 필요합니다. 입금한 금액은 업무잔액이 되고, 업무를 시작하면 필요한 금액만 잠시 잠깁니다. 정상 정산 후 보증금은 전액 업무잔액으로 돌아옵니다.`

### 입금하면 수익이 생기나요?

`아니요. 잔액 보유 자체로 수당이 생기지 않습니다. 실제 업무를 수행하고 검수 승인을 받은 경우에만 해당 업무의 수당이 지급됩니다.`

### 원금도 출금할 수 있나요?

`가능합니다. 출금 후 남은 업무잔액 기준으로 이용 가능한 업무 규모가 다시 계산됩니다.`

어드민에서 FAQ 생성/수정/순서/공개/중지/중요표시를 모두 제어한다.

---

# 12. 알림 최종 CMS

알림 템플릿도 어드민에서 제어한다.

권장 구조: `private.notification_templates`

이벤트 예시:

```text
signup_support_grant
trial_started
trial_submitted
trial_approved
deposit_submitted
deposit_approved
max_work_unlocked
assignment_created
slot_low
work_submitted
work_approved
work_rework
work_rejected
stipend_paid
withdrawal_submitted
withdrawal_completed
partner_budget_low
```

어드민 기능:

- 제목
- 본문
- deep-link CTA
- 활성여부
- 채널(in-app 기본)
- 대상조건
- 테스트 발송
- 미리보기
- 변경이력

금액/업무명/파트너명은 서버 데이터로 변수 치환한다.

---

# 13. 회원용 카피·온보딩 어드민 제어

## 13.1 신규 `Member Experience` 메뉴

어드민에서 다음을 제어한다.

### 홈 헤드라인
- 제목
- 보조문구
- CTA
- 공개여부

### 가입 Welcome
- 제목
- 설명
- 10,000원 지원금 카피
- CTA

### 온보딩 3장
- 순서
- 제목
- 본문
- 아이콘
- 활성여부

### 입금 전 설명
- `왜 입금하나요?`
- 금액 예시
- CTA

### 업무 시작 확인
- 보증금 안내
- 반환 안내
- 수당 안내

### 승인/해금 모달
- 문구
- 강조값
- CTA

중요: 금액 자체는 canonical 서버값을 사용하고, CMS는 설명문구와 표현만 제어한다.

---

# 14. 업무 템플릿·업무 노드 어드민

## 14.1 Work Template Library

운영자는 120+ 템플릿에서 새 업무를 만들 수 있다.

필드:

- 카테고리
- 템플릿명
- 기본 질문
- 입력형식
- 기본 예상시간
- 기본 난이도
- 권장 stake 범위
- 권장 stipend 범위
- 기본 motion profile
- 기본 설명
- 활성/보관

## 14.2 실제 Node 생성

운영자가 설정:

- 파트너
- 제목
- 설명
- 사진
- 질문
- 선택지
- 정답
- 업무 보증금
- 완료 수당
- 예상 수행시간
- 일일 자리
- 공개기간
- tier_band
- `requires_assign`
- 파트너 funding allocation 연결
- FOMO 표시여부
- 상태 draft/published/paused/archived

## 14.3 난이도 프리셋

어드민 프리셋:

```text
소액: 입력/비교 많음
중액: 핵심 검수
고액: 짧은 최종판단
초고액: 특수 최종QA
```

운영자가 업무별로 override 가능하다.

---

# 15. 어드민 최종 메뉴 구조

```text
1. 대시보드
2. 회원
3. 파트너
4. 파트너 지급예산
5. 업무 템플릿
6. 실제 업무
7. 업무 배정
8. 업무 검수
9. 입금
10. 출금
11. 지원금/캠페인
12. 등급/혜택
13. 회원경험/온보딩
14. FAQ
15. 알림 템플릿
16. FOMO/표시설정
17. 공지
18. KYC
19. 감사로그
20. 시스템/QA
```

---

# 16. 어드민 제어 매트릭스

| 회원에게 보이는 요소 | 어드민 제어 | canonical source |
|---|---|---|
| 가입 지원금 | 금액/활성/기간 | support_grant campaign + ledger |
| 업무 보증금 | 업무별 설정 | nodes.stake_krw |
| 완료 수당 | 업무별 설정 | nodes.stipend_krw |
| 업무시간 | 업무별 설정 | nodes.estimated_seconds |
| 업무난이도 | 업무별 설정 | node/template |
| 공개/중지 | 즉시 제어 | catalog_status/enabled |
| 배정 전용 | 체크박스 | requires_assign |
| 하루 자리 | 업무별 설정 | daily_cap |
| 파트너 예산 | 생성/수정/검증/중지 | partner_funding_pools |
| 업무 배정예산 | 생성/수정 | partner_budget_allocations |
| 예산 공개 | ON/OFF | display_enabled |
| FOMO 노출 | ON/OFF/위치/문구 | canonical metrics + display settings |
| 온보딩 | 전체 CMS | member experience content |
| FAQ | 전체 CMS | FAQ table |
| 알림 | 템플릿/활성/CTA | notification templates |
| 홈 헤드라인 | CMS | member experience content |
| 추천 업무 | 운영 업무 데이터로 자동 | MAX BALANCE FIT |
| 등급 혜택 | 정책 설정 | tier config |
| 회원 잔액 | 운영자 조정 가능 | RPC + ledger |
| 출금 | 검수/완료 | withdrawal RPC + ledger |

---

# 17. 어드민 권한

기존 역할을 우선 사용한다.

- `super_admin`: 전체
- `finance`: 입출금, 파트너 지급예산, 예산검증
- `content`: 파트너 표시, 템플릿, 업무, 온보딩, FAQ, FOMO 표현
- `work_review`: 업무검수
- `member_support`: 회원/배정/알림
- `kyc_review`: KYC

중요한 금액 변경은 role check 후 Edge/RPC로만 처리한다.

파트너 funding `verified` 전환은 `finance` 또는 `super_admin`만 허용한다.

---

# 18. 어드민 미리보기/시뮬레이터

`시스템/QA`에서 회원 시나리오를 DB 변경 없이 미리볼 수 있어야 한다.

프리셋:

- 신규회원 / 체험 전
- 체험 완료 / 3,000원 수당
- 업무잔액 50,000원
- 업무잔액 300,000원
- 업무잔액 1,000,000원
- 업무잔액 10,000,000원
- 30,000,000원 배정업무 보유
- 원금 출금 전/후

확인 항목:

- 어떤 업무가 첫 추천인지
- 다음 업무가 무엇인지
- FAQ/온보딩 문구
- funding 표시
- 실제 FOMO 표시
- 모바일 320/375/430px
- reduced-motion

---

# 19. 데이터 무결성과 성능

## 19.1 금액 변경

```text
Admin UI
→ JWT/role 확인
→ Edge Function
→ RPC transaction
→ ledger/audit
→ canonical state
→ UI refresh
```

브라우저에서 직접 금액을 계산해 DB 잔액을 수정하지 않는다.

## 19.2 파트너 예산

예산의 예약/사용/해제도 transaction으로 처리한다.

권장 이벤트:

```text
funding_created
funding_verified
budget_allocated
budget_reserved
budget_released
budget_spent
funding_paused
funding_closed
```

## 19.3 성능

- 회원 추천은 현재 메모리 catalog + wallet snapshot에서 1회 partition/sort
- render마다 DB 재조회 금지
- MutationObserver 확대 금지
- FOMO는 서버 snapshot 또는 기존 refresh 주기 재사용
- admin member list 10,000건 전체 fetch 방식은 pagination/cursor로 단계 교체
- 파트너 예산/업무 목록도 pagination

---

# 20. 최종 구현 패치 순서

## P0 — 돈/추천 정합성

1. 원금 출금 자동 강등/혜택박탈 제거 migration
2. MAX BALANCE FIT 회원 추천
3. `requires_assign`와 금액/tier 분리
4. 출금 전/후 최대업무 preview
5. 회원/어드민 capacity 표시

## P1 — 어드민 완전제어

6. 파트너 funding pool + allocation DB
7. funding Edge/RPC + audit
8. 어드민 `파트너 지급예산` 메뉴
9. 업무 편집기 funding 연결
10. 지원금 캠페인 어드민 제어 마감
11. 등급 혜택 정책 어드민화

## P2 — 회원경험 CMS

12. Member Experience 설정 저장구조
13. Welcome/온보딩 CMS
14. 입금 설명 CMS
15. 업무 시작/승인/해금 카피 CMS
16. FAQ CMS
17. 알림 템플릿 CMS

## P3 — 120+ 실제 업무 템플릿

18. template schema
19. 12개 카테고리 정의
20. 120+ 템플릿 seed
21. 어드민 템플릿 라이브러리
22. 템플릿→node 생성기
23. 파트너/예산/업무 연결

## P4 — 실데이터 FOMO/성취

24. 실제 capacity 기반 남은 자리
25. 실제 승인건수
26. 실제 funding 잔여예산
27. 최대업무 해금 이벤트
28. 승인/수당 애니메이션
29. FOMO admin control

## P5 — Universal UX

30. 320~430px 모바일 정리
31. 글자확대 테스트
32. 48px touch target
33. 한 화면 한 CTA
34. 입출금/업무 시작 실수방지
35. reduced-motion
36. 저사양 Android/iPhone 성능검증

## P6 — E2E/출시검증

37. 신규가입→체험→승인
38. 입금→MAX FIT 해금
39. 50,000원→10,000,000원 고액 전환
40. 10M 업무 lock→submit→approve→원금복귀+수당
41. 원금 일부 출금→새 max-fit
42. partner funding verified/hidden/paused 시나리오
43. requires_assign 공개/비공개
44. FAQ/온보딩/알림 변경 즉시 반영
45. admin audit 확인
46. 공식 member/admin domain smoke
47. 실제 연령대별 사용성 QA

---

# 21. 필수 E2E 시나리오

## 21.1 신규회원

```text
가입
→ 지원금 10,000
→ 체험 시작
→ 제출
→ 승인
→ available +3,000
→ 일반 업무 설명
```

## 21.2 고액전환

```text
work_balance 50,000
→ 운영 승인 입금 +9,950,000
→ work_balance 10,000,000
→ 10M 공개 node가 있으면 1순위 추천
→ 시작
→ 10M held
→ 승인
→ 10M 원금 복귀
→ available +1M
```

## 21.3 원금 출금

```text
work_balance 10M / available 1M
→ 10M 출금
→ stipend 1M + principal 9M
→ work_balance 1M
→ 자동등급강등 없음
→ max-fit 1M
```

## 21.4 파트너 funding

```text
draft pool
→ 회원 미노출
pending verification
→ 회원 미노출
verified + display ON
→ 회원 `지급예산 확보됨` 표시
allocation 감소
→ 잔여예산 실시간 갱신
paused
→ 확보 배지/해당 공개정책에 따라 숨김
```

---

# 22. 완료 판정

아래가 모두 만족되어야 최종 완료다.

- 회원이 퍼뜩 정체성을 첫 화면에서 이해
- 가입 지원금 10,000원 정상 지급
- 체험/일반업무 설명 분리
- 왜 입금하는지 입금 전 이해 가능
- 업무잔액에 가장 가까운 최대업무가 1순위
- 원금 출금 가능, 자동 패널티 없음
- 보증금 잠금/복귀와 수당 분리
- 120+ 업무 템플릿을 어드민에서 관리
- 실제 published 업무만 회원에게 노출
- 파트너 funding 값을 어드민에서 관리
- verified funding만 회원에게 `확보`로 표시
- funding/업무/지원금/문구/FAQ/알림/FOMO가 어드민에서 제어 가능
- 모든 금액 변경은 ledger/audit를 통과
- 모든 중요 설정 변경은 감사로그 기록
- FOMO는 실데이터만 사용
- 모바일·고령 사용자 UX 기준 충족
- 공식 도메인 E2E 통과

---

# 23. 최종 운영 철학

퍼뜩의 회원 화면은 단순해야 하고, 운영자 화면은 강력해야 한다.

회원은 다음 다섯 가지만 이해하면 된다.

```text
1. 지금 할 수 있는 업무
2. 업무 보증금
3. 완료 수당
4. 내 업무잔액
5. 내 출금가능 금액
```

반대로 운영자는 뒤에서 다음을 전부 제어한다.

```text
파트너
파트너 예산
업무 템플릿
실제 업무
보증금
수당
시간
난이도
자리
배정
공개상태
지원금
등급혜택
온보딩
FAQ
알림
FOMO
회원잔액
입출금
검수
감사로그
```

**회원에게는 간단하게, 운영자에게는 모든 핵심 운영값을 통제 가능하게.**

이것을 퍼뜩 최종 제품 아키텍처의 기준으로 고정한다.
