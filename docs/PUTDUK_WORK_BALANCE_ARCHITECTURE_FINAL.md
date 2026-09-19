# 퍼뜩 업무잔액·최대업무 추천 최종 아키텍처

> 기준일: 2026-09-20
> 기준 저장소: `phonarawd/putduk-data-platform`
> Production Supabase: `gaugwamwceqdnqdqrxqg`
> Member: `https://app.hiptk.app`
> Admin: `https://ops.hiptk.app/admin/`
>
> 이 문서는 현재 운영 중인 백엔드·회원 UI/UX·운영자 어드민을 다시 대조한 뒤, 퍼뜩의 업무잔액/보증금/수당/고액업무 노출/원금 유지 UX를 하나의 기준으로 고정한 최종 설계다. 기존 원장과 업무 정산 엔진을 폐기하지 않고, 현재 구조와 충돌하는 추천·출금·등급·초고액 노출 규칙을 교체한다.

## 1. 최종 사업 규칙

### 1.1 핵심 한 문장

퍼뜩의 회원은 일을 사는 것이 아니다. 일반 업무에서는 회원의 `work_balance` 일부를 업무 수행 중 일시 잠그고, 정상 정산 시 같은 원금을 `work_balance`로 되돌리며 수당은 별도의 `available` 칸에 지급한다.

### 1.2 절대 규칙

1. 신규 가입 지원금은 현재 운영값 **10,000원**을 유지한다.
2. 가입 지원금은 일반 원금이 아니라 첫 체험을 위한 `support_grant`다.
3. 일반 업무의 업무 가능 규모는 **현재 사용 가능한 업무잔액**으로 결정한다.
4. 5만원 업무를 하던 회원이 1,000만원을 입금해도 별도 대기기간·숙성기간·리스크 점수 때문에 1,000만원급 공개 업무를 막지 않는다.
5. 충분한 업무잔액이 있다면 회원에게 **잔액과 가장 가까운 최대 업무**를 먼저 보여준다.
6. 돈이 있다는 이유만으로 회원 등급이 자동 승급되지는 않지만, 회원 등급이 충분한 잔액을 가진 회원의 일반 공개 업무를 현금 장벽처럼 막아서도 안 된다.
7. `requires_assign=true`인 업무만 운영자 배정 전용이다. 금액·`tier_band` 자체가 자동으로 배정 전용을 뜻하지 않는다.
8. 원금 포함 출금은 허용한다. 단, 출금 후 남는 업무잔액 기준으로 가능한 최대 업무가 자연스럽게 낮아진다.
9. 원금 출금 자체를 불량행동으로 보고 등급 강등·우선권 박탈을 자동 적용하지 않는다.
10. 원금을 남겨둘 동기는 강제 잠금이나 숨겨진 불이익이 아니라 **더 큰 업무를 즉시 수행할 수 있는 효용**에서 만든다.
11. 업무 수당은 잔액 보유의 대가가 아니라 실제 업무 승인 결과로만 발생한다.
12. 프론트엔드 숫자는 표시일 뿐이며 모든 실제 금액 변경은 Edge/RPC/DB transaction/ledger를 통한다.

## 2. 현재 운영에서 확인된 사실

### 2.1 가입 지원금

Production `support_grant_campaigns`의 신규 회원 캠페인은 **10,000원**이다.

체험 업무는 현재 10,000원 지원금을 사용하고, 체험 지원금은 일반 원금처럼 반환하지 않는다. 체험 완료 수당은 현재 3,000원이며 `available`로 지급된다.

따라서 체험 UX는 일반 업무와 문구를 분리해야 한다.

- 체험: `퍼뜩이 제공한 지원금으로 첫 업무 체험`
- 일반: `회원 업무잔액을 잠금 → 정상 정산 시 전액 업무잔액 복귀 + 수당 지급`

### 2.2 운영 업무 사다리

현재 Production 공개 업무는 다음 stake/stipend 구조다.

| 업무 보증금 | 수당 | 구간 | 현재 배정 전용 |
|---:|---:|---|---|
| 10,000 | 3,000 | 체험 | 아니오 |
| 30,000 | 3,000 | 소액 | 아니오 |
| 50,000 | 5,000 | 소액 | 아니오 |
| 70,000 | 7,000 | 소액 | 아니오 |
| 100,000 | 10,000 | 소액 | 아니오 |
| 300,000 | 30,000 | 중간 | 아니오 |
| 500,000 | 50,000 | 중간 | 아니오 |
| 1,000,000 | 100,000 | 중간 | 아니오 |
| 3,000,000 | 300,000 | 고액 | 아니오 |
| 5,000,000 | 500,000 | 고액 | 아니오 |
| 10,000,000 | 1,000,000 | 고액 | 아니오 |
| 30,000,000 | 3,000,000 | 초고액 | 예 |
| 100,000,000 | 10,000,000 | 초고액 | 예 |

현재 모든 공개 node의 `allowed_tiers`는 빈 배열이다. 즉 Production DB에서는 회원 등급이 일반 공개 업무 금액을 직접 막고 있지 않다.

### 2.3 회원 하루 업무 횟수

현재 등급별 일일 한도는 다음과 같다.

- 라인: 3회
- 크루: 5회
- 선임: 10회
- 전담: 0 = 무제한

이 한도는 **업무 금액 접근권한**이 아니라 등급별 운영 혜택/처리량 차이로 유지한다.

## 3. 기존 백엔드에서 반드시 유지할 부분

현재 `20260917210000_putduk_three_bucket_ledger.sql`의 3칸 원장은 최종 구조에 매우 잘 맞는다.

### 3.1 3칸 진실

```text
support_grant = 체험 지원금
work_balance  = 일반 업무 보증 가능 잔액
available     = 실제 출금 가능한 수당/확정 지급액
```

이 세 칸은 합치지 않는다.

### 3.2 일반 업무 시작

현재 `private.putduk_lock_stake`는 정상적인 구조다.

```text
work_balance.available_amount >= node.stake_krw
→ work_balance.available -= stake
→ work_balance.held += stake
→ ledger stake_locked
```

동시에 advisory lock과 idempotency key를 사용하므로 이 구조는 그대로 유지한다.

### 3.3 정상 승인

현재 승인 흐름도 유지한다.

```text
잠긴 원금
→ work_balance로 반환

업무 수당
→ available로 지급
```

원금 반환과 수당 지급은 서로 다른 idempotency key를 유지한다.

### 3.4 재작업

현재 적용된 lifecycle patch를 유지한다.

```text
submitted/review_pending
→ rework 이벤트/검수 기록
→ 같은 run을 checkpointed로 복귀
→ 원금 잠금 유지
→ 회원 수정 후 재제출
```

### 3.5 입금 승인

현재 `putduk_admin_review_deposit`가 승인 금액을 즉시 `work_balance`에 올리는 구조를 유지한다.

따라서 50,000원 회원이 9,950,000원을 추가 입금하고 승인되면 업무잔액은 바로 10,000,000원이 되고, 추가적인 숙성/대기 없이 10,000,000원급 공개 업무를 시작할 수 있어야 한다.

## 4. 현재 구현과 최종 규칙의 충돌

### P0-1. 회원 업무 추천 순서가 반대다

현재 `memberCatalogNodes()`는 배정/체험 우선 후 일반 node를 `stake` 오름차순으로 정렬한다.

결과:

```text
업무잔액 10,000,000원
→ 30,000원/50,000원 같은 작은 업무가 먼저 노출될 수 있음
```

최종 규칙:

```text
즉시 수행 가능한 업무 중 stake가 가장 큰 업무를 1순위
→ 그 다음 큰 업무
→ 작은 업무 순
```

### P0-2. 30,000,000원 이상을 프론트가 금액만으로 숨긴다

현재 `isUltraNode()`와 `memberCatalogNodes()`는 다음을 초고액으로 본다.

```text
requiresAssign
OR tierBand === '초고액'
OR stake >= 30,000,000
```

최종 규칙은 다르다.

```text
운영자 배정 필요 여부 = requires_assign 하나만 진실
```

금액이 30,000,000원 또는 100,000,000원이어도 운영자가 `requires_assign=false`로 공개했다면 충분한 업무잔액을 가진 회원은 볼 수 있고 시작할 수 있어야 한다.

단, 현재 Production의 30M/100M node는 실제 `requires_assign=true`이므로 데이터 자체를 임의로 공개 전환하지 않는다. 코드만 금액 하드코딩을 제거하고 최종 공개 여부는 운영자 설정을 따른다.

### P0-3. 원금 출금이 벌점으로 처리된다

현재 `putduk_admin_withdraw_complete`는 원금이 포함되면 `private.putduk_apply_principal_penalties()`를 호출한다.

현재 효과:

- 등급 한 단계 강등
- `priority_pick=false`
- `dedicated_queue=false`
- `weekly_volume_boost=false`
- `high_value_notice=false`
- 업무잔액 0원이면 line close

이 중 **자동 등급 강등 및 혜택 박탈은 제거**한다.

최종 구조:

```text
원금 포함 출금 완료
→ 실제 principal만 work_balance에서 빠짐
→ principal_withdraw_count/audit는 기록
→ 남은 work_balance로 업무 가능 규모 재계산
→ 0원이면 일반 업무 시작 가능액 0
→ 등급/우선권은 출금 자체를 이유로 자동 박탈하지 않음
```

### P0-4. 등급 설명이 금액 사다리와 결합돼 있다

현재 회원 UI는 라인=소액, 크루=중간, 선임=고액, 전담=초고액 식으로 안내한다.

최종 구조에서는 이를 분리한다.

- 업무 금액 가능 여부: `work_balance`와 해당 node의 `requires_assign`
- 등급 혜택: 하루 업무 횟수, 우선 노출, 검수 우선도, 같은 협력사 연속 자리, 고액 알림, 전담/특수 배정 등

### P0-5. 어드민이 `초고액`을 자동으로 배정 전용으로 만든다

현재 `dist/admin/admin.js`에서:

- `parseWorkSpec`: `requires_assign || tier_band === '초고액'`
- 초고액 선택 시 checkbox 자동 체크
- 렌더 시 초고액이면 체크된 것으로 표시

최종 구조에서는 제거한다.

`requires_assign`은 운영자가 명시적으로 선택하는 독립 필드다.

## 5. 최종 업무 추천 엔진: MAX BALANCE FIT

### 5.1 핵심값

```text
work_available = work_balance.available_amount
work_locked    = work_balance.held_amount
withdrawable   = available.available_amount
```

`work_available`이 현재 새 업무를 맡을 수 있는 금액이다.

### 5.2 회원이 볼 수 있는 후보

후보 node는 기존 RLS/카탈로그 규칙을 그대로 따른다.

```text
supply_source = operator
enabled = true
catalog_status = published
partner brand approved/published
AND (
  requires_assign = false
  OR 현재 회원에게 유효한 assignment 존재
)
```

### 5.3 추천 우선순위

회원에게 보여주는 순서는 다음으로 고정한다.

1. 현재 진행 중/재작업 중인 같은 run 복원
2. 현재 회원에게 배정된 업무 중 즉시 수행 가능하고 stake가 가장 큰 업무
3. 일반 공개 업무 중 `stake <= work_available`인 node를 stake 내림차순
4. 그중 첫 번째를 **현재 잔액에 가장 잘 맞는 업무**로 강조
5. `stake > work_available`인 업무 중 가장 가까운 한 개를 **다음 업무**로 별도 표시
6. 나머지 잠긴 업무는 일반 목록 뒤쪽 또는 필터 화면에서 표시

체험 미사용 회원은 가입 직후 10,000원 지원금 체험 카드를 별도 onboarding 카드로 강조할 수 있지만, 일반 업무 추천 순서를 계속 왜곡해서는 안 된다.

### 5.4 예시: 업무잔액 10,000,000원

현재 10M node가 공개되어 있고 자리가 남았다면:

```text
추천 1: 10,000,000 / 수당 1,000,000 / 잔액 활용 100%
추천 2:  5,000,000 / 수당   500,000 / 잔액 활용 50%
추천 3:  3,000,000 / 수당   300,000 / 잔액 활용 30%
```

30M node가 `requires_assign=true`라면 일반 회원에게는 보이지 않는다.

### 5.5 예시: 업무잔액 9,000,000원

현재 ladder에서 즉시 가능한 최대 공개 업무가 5M이라면:

```text
현재 잔액에 가장 가까운 업무: 5,000,000원
다음 업무: 10,000,000원
다음 업무까지 필요한 금액: 1,000,000원
```

향후 운영자가 8M/9M node를 등록하면 알고리즘 수정 없이 해당 node가 자동으로 best-fit이 된다. 즉 정적 STAKE_LADDER보다 **실제 공개 node 데이터**를 우선한다.

## 6. 회원 UI/UX 최종안

### 6.1 대시보드 최상단

기존 `다음 상위 라인 해금 게이지` 중심에서 다음 구조로 바꾼다.

```text
업무잔액 10,000,000원
현재 바로 가능한 최대 업무 10,000,000원
예상 수당 1,000,000원
[이 업무 보기]

다음 단계가 존재하면:
다음 공개 업무 30,000,000원
추가 필요 20,000,000원
```

단, 다음 업무가 `requires_assign=true`이면 “입금하면 자동 해금”이라고 쓰지 않는다. 대신 `운영자 배정 전용`으로 명확히 표시한다.

### 6.2 업무 카드 금액 카피

기존:

```text
근무 보증 10,000,000원
수당 1,000,000원
```

최종:

```text
업무 보증금 10,000,000원
완료 수당 +1,000,000원

업무 중 잠시 잠기고
정상 정산 시 보증금 전액이 업무잔액으로 돌아옵니다.
```

짧은 카드에서는:

```text
🔒 업무 보증금 10,000,000원
💰 완료 수당 +1,000,000원
↩ 정상 정산 시 보증금 전액 복귀
```

### 6.3 업무 시작 확인창

반드시 네 숫자를 보여준다.

```text
현재 업무잔액      10,000,000원
이번 업무 보증금   10,000,000원
정상 정산 후 반환  10,000,000원
완료 수당          +1,000,000원
```

그리고:

`업무 보증금은 이용료가 아닙니다. 업무를 맡는 동안 잠시 잠기며 정상 정산 시 업무잔액으로 전액 돌아옵니다.`

일반 업무에는 `정상 완료 기준 별도 이용료 0원`을 보조 문구로 쓸 수 있다.

### 6.4 체험 카드

체험은 일반 원금 반환 카피를 쓰지 않는다.

```text
🎁 가입 지원금 10,000원으로 첫 업무를 시작합니다.
회원 본인의 업무잔액은 사용하지 않습니다.
체험 업무 완료 수당 +3,000원은 출금 가능 잔액에 반영됩니다.
```

### 6.5 지갑

현재 3칸 UI를 유지하되 의미를 더 명확하게 한다.

```text
지원금
퍼뜩이 제공한 체험용 잔액

업무잔액
새 업무 보증금으로 사용할 수 있는 잔액
현재 최대 업무: X원

출금가능
확정된 수당 등 실제 출금 가능한 잔액
```

진행 중 잠금이 있으면:

```text
업무잔액 사용 가능 0원
업무 중 잠금 10,000,000원
```

처럼 분리 표시한다.

## 7. 입금 직후 UX

입금 승인으로 work_balance가 변하면 회원 화면은 다음 wallet refresh/realtime 시 즉시 best-fit을 다시 계산한다.

예:

```text
기존 업무잔액 50,000원
추가 승인 9,950,000원
새 업무잔액 10,000,000원
```

회원에게:

```text
🎉 10,000,000원급 업무가 열렸어요

현재 업무잔액 10,000,000원
바로 가능한 최대 업무 10,000,000원
완료 수당 +1,000,000원
[최대 업무 확인]
```

입금액 자체를 이유로 위험 플래그/대기기간을 생성하지 않는다.

## 8. 원금 유지 UX와 원금 포함 출금

### 8.1 원칙

원금을 최대한 남겨두게 하는 핵심은 `출금 제한`이 아니라 `업무 효용 유지`다.

### 8.2 기본 CTA

지갑에서는:

- 주 CTA: `수당 출금`
- 보조 CTA: `업무잔액 포함 출금`

두 기능 모두 접근 가능해야 한다.

### 8.3 원금 포함 출금 사전 계산

현재 RPC는 원금 포함 출금 요청 시 먼저 `available`을 사용하고 부족분만 `work_balance`에서 가져간다. UI preview도 같은 공식을 사용해야 한다.

```text
stipend_part  = min(request_amount, available)
principal_part = request_amount - stipend_part
projected_work_balance = work_available - principal_part
```

### 8.4 기존 강등 모달을 다음으로 교체

기존:

```text
출금하면 등급 하락
우선 집기 박탈
전담 라인 박탈
```

최종:

```text
출금 전 업무잔액       10,000,000원
이번에 빠지는 업무잔액  9,000,000원
출금 후 업무잔액        1,000,000원

현재 최대 업무          10,000,000원
출금 후 최대 업무        1,000,000원

출금은 언제든 신청할 수 있습니다.
남은 업무잔액에 따라 이용 가능한 업무 규모가 다시 계산됩니다.
```

사용자가 스스로 원금을 유지할 이유가 보이도록 한다.

### 8.5 DB 변경

새 migration에서 `putduk_admin_withdraw_complete`의 원금 완료 후 로직을 수정한다.

제거:

```text
private.putduk_apply_principal_penalties()에 의한 자동 등급 강등
priority_pick=false
dedicated_queue=false
weekly_volume_boost=false
high_value_notice=false
```

유지:

```text
principal 실제 차감
ledger/idempotency/audit
principal_withdraw_count 기록
남은 work_balance 확인
0원 여부 기록/line 상태 정합성
```

기존 컬럼 `demotion_applied`, `previous_member_tier`, `new_member_tier`는 과거 데이터 호환을 위해 즉시 삭제하지 않는다. 신규 출금에서는 `demotion_applied=false`로 남긴다.

## 9. 등급 시스템 최종 역할

등급은 업무 금액을 사는 장벽이 아니다.

### 라인

- 기본 업무 큐
- 일일 3회

### 크루

- 일일 5회
- 같은 협력사 연속 자리 등 편의 혜택

### 선임

- 일일 10회
- 우선 노출/고액 사전 알림/운영 편의

### 전담

- 기본 일일 한도 무제한
- 전담 큐/특수 배정 가능

업무 금액 자체는:

```text
work_balance >= stake_krw
```

가 핵심이다.

`allowed_tiers`는 특정 기업/특수 계약 업무에서 운영자가 명시적으로 사용할 때만 적용한다. 현재 Production처럼 빈 배열이면 등급 금액 제한이 아니다.

## 10. 어드민 최종 UX

### 10.1 회원 상세에 추가할 운영 정보

현재 회원 상세의 지원금/근무잔액/출금가능/보류액에 다음을 추가한다.

```text
현재 업무 가능 잔액
현재 가능한 최대 공개 업무
현재 best-fit 업무/수당
다음 공개 업무 금액
다음 업무까지 부족액
진행 중 업무 잠금액
```

### 10.2 운영자 잔액 입금 완료

`work_balance`에 운영자가 직접 입금한 뒤 단순 `잔액 입금을 서버에 반영했어요`에서 끝내지 않는다.

예:

```text
✅ 업무잔액 9,950,000원을 반영했습니다.
현재 업무잔액 10,000,000원
현재 가능한 최대 공개 업무 10,000,000원
```

회원 상세를 즉시 재조회한다.

### 10.3 업무 편집기

유지:

- stake_krw
- stipend_krw
- daily_cap
- estimated_seconds
- tier_band
- requires_assign

변경:

- `초고액 선택 → requires_assign 자동 체크` 제거
- `tier_band==='초고액' → requires_assign=true` 해석 제거
- checkbox 문구를 `운영자 배정 전용`으로 단순화

도움말:

`체크하면 잔액이 충분해도 해당 회원에게 유효한 배정이 있어야 노출/시작됩니다.`

### 10.4 어드민 카탈로그 미리보기

업무 생성/수정 시:

```text
업무 보증금
완료 수당
회원 잔액만으로 공개 접근 가능 / 운영자 배정 전용
하루 자리
예상 수행시간
```

을 한눈에 보여준다.

## 11. Edge Function 변경

### member-finance

현재 `walletSnapshot()` 반환값에 다음 파생값을 추가한다.

```text
work_available
work_locked
withdrawable
```

가능하면 프론트 호환을 위해 기존 필드는 유지하고 alias만 추가한다.

회원 추천 자체는 이미 RLS로 받은 실시간 visible node 목록을 기준으로 계산해도 된다. 실제 업무 시작의 최종 권한/잔액 판단은 DB `private.putduk_lock_stake`가 계속 담당한다.

추후 여러 클라이언트가 생길 경우 별도 서버 helper `putduk_member_work_capacity`를 추가할 수 있으나, P0에서는 추천만을 위해 중복된 영구 상태 테이블을 만들지 않는다.

### admin-control/admin-phase5

- 기존 `adjust_balance` 원장 경로 유지
- 회원 상세 wallet summary 유지
- 프론트가 best-fit을 계산할 수 있도록 현재 catalog와 wallet 값을 함께 사용할 수 있게 한다.
- 필요 시 `get_member` response에 서버 계산형 capacity snapshot을 추가하되 기존 contract를 깨지 않는다.

## 12. DB/RLS 최종 규칙

현재 RLS의 핵심은 유지한다.

```text
requires_assign=false
→ 승인된 공개 partner의 published/enabled operator node면 회원에게 노출

requires_assign=true
→ 현재 회원에게 유효한 assignment가 있어야 노출
```

`stake_krw >= 30M` 같은 금액 조건을 RLS에 추가하지 않는다.

`private.putduk_has_active_assignment()`의 SECURITY DEFINER 방식은 RLS recursion 방지용으로 유지한다.

## 13. 정확한 패치 대상

### 회원

- `dist/assets/app.js`
  - `isUltraNode()`에서 금액/tierBand 하드코딩 제거
  - `memberCatalogNodes()`를 best-fit 중심으로 재작성
  - 즉시 가능 업무와 다음 업무를 분리
  - dashboard 추천 3개를 내림차순 eligible로 표시
  - `renderNextLadderHero()`를 실제 공개 node 기반으로 변경
  - 업무 보증금 설명/시작 confirmation 수정
  - 체험 지원금 카피 분리
  - 원금출금 강등 modal을 출금 후 업무한도 preview로 교체
  - MEMBER_BANDS의 금액 사다리 표현 제거

- `dist/assets/app.css`
  - best-fit hero
  - balance utilization
  - withdrawal before/after 비교
  - mobile 320~430px 레이아웃

### 어드민

- `dist/admin/admin.js`
  - 초고액=자동배정 전용 결합 제거
  - requires_assign 독립 toggle
  - node preview 카피 수정

- `dist/assets/app.js`의 admin member detail 영역
  - 회원 capacity/best-fit 정보 표시
  - 잔액 조정 후 최대 업무 안내

- 기존 `balance-adjust-safety.js`, `withdrawal-safety.js`
  - 현재 click/submit 안전 패치는 유지
  - 업무잔액 조정 후 새 member detail reload와 capacity 안내가 깨지지 않게 회귀 테스트

### Edge

- `supabase/functions/member-finance/index.ts`
  - wallet snapshot alias/파생값

- `supabase/functions/_shared/admin-ops.ts`
  - 필요 시 member detail capacity 계산 확장

### DB

새 migration 1개로 묶는다.

예시 이름:

`20260920xxxx_putduk_balance_capacity_and_principal_exit.sql`

내용:

1. 원금 출금 자동 강등/혜택 박탈 제거
2. principal withdrawal count/audit 유지
3. line_open/work balance 정합성 유지
4. 기존 historical columns 보존
5. 필요 시 읽기 전용 capacity helper 추가

## 14. 테스트 계약

### Backend rollback E2E

#### 50,000원 → 10,000,000원

1. 테스트 회원 work_balance 50,000
2. 9,950,000 credit
3. work_balance 10,000,000 확인
4. 10M public node 시작 가능
5. 10M lock 시 available=0, held=10M
6. 두 번째 업무 시작은 기존 active-run guard로 차단
7. 승인 시 10M 원금 반환 + 1M 수당 지급
8. 전체 test transaction rollback

#### 원금 포함 출금

1. work_balance=10M, available=1M
2. 10M 출금 요청
3. stipend 1M + principal 9M로 분리 확인
4. 완료 후 work_balance=1M
5. 등급 자동 강등 없음
6. priority/dedicated 혜택을 출금 자체가 false로 만들지 않음
7. 새 max-fit=1M
8. rollback

#### assignment

- requires_assign=false 30M node: 충분한 잔액 회원에게 보임/시작 가능
- requires_assign=true 30M node: 배정 없는 회원에게 숨김
- 유효 배정 생성 시 보임
- 금액 자체가 배정 조건으로 사용되지 않음

### Frontend unit tests

필수 assertion:

- `nodeStake(b) - nodeStake(a)` 또는 동등한 descending best-fit 정렬
- `stake >= 30000000` 하드 hide 금지
- `tierBand === '초고액'`로 requires_assign 강제 금지
- `requires_assign`만 배정 전용의 canonical flag
- 10M wallet + 10M node => 10M이 first recommendation
- 9M wallet + 5M/10M nodes => 5M best-fit + 10M next gap 1M
- 원금출금 preview가 실제 stipend-first RPC 산식과 일치
- 체험 지원금 카피가 일반 원금 반환 카피와 분리

### Admin tests

- 초고액을 선택해도 requires_assign가 자동 체크되지 않음
- 운영자가 명시적으로 체크하면 저장 후 true
- 명시 해제하면 false
- 잔액 입금 후 회원 상세 reload
- 안전 클릭 handler 회귀 없음

## 15. 성능 원칙

이번 패치는 추천 엔진 때문에 DOM observer를 늘리지 않는다.

- 기존 회원 observer guard 유지
- 기존 어드민 observer amplification fix 유지
- 추천 순서는 메모리 배열 1회 partition/sort로 계산
- render마다 전체 DB 재조회 금지
- wallet/catalog canonical refresh 시에만 추천 snapshot 갱신
- 320px 모바일부터 데스크톱까지 동일 business state 사용

## 16. 배포 순서

1. 계약 테스트 먼저 추가
2. DB migration 작성 및 로컬/rollback 검증
3. Production Supabase에 migration 적용
4. member-finance/admin response 호환 확장
5. 회원 app.js best-fit 추천/카피/출금 preview 적용
6. 어드민 requires_assign 분리/회원 capacity panel 적용
7. cache key bump
8. `main` 반영
9. Cloudflare Pages Git Integration 배포
10. `app.hiptk.app` 회원 smoke
11. `ops.hiptk.app` 어드민 smoke
12. Production DB rollback E2E
13. 회원 실제 계정 E2E가 가능하면 입금→고액업무→검수→정산까지 검증

## 17. 완료 판정 기준

아래를 전부 만족해야 완료다.

- 가입 지원금 10,000원 유지
- 체험 지원금과 회원 원금 의미 분리
- 10M 잔액 회원에게 10M 공개 업무가 있다면 최우선 추천
- 일반 공개 업무는 등급 때문에 금액 접근이 막히지 않음
- 초고액도 `requires_assign` 값만 따라 공개/배정 결정
- 업무 시작금은 DB에서 실제로 잠김
- 승인 시 원금 복귀 + 수당 available 지급
- 원금 출금 가능
- 원금 출금 자체로 자동 등급 강등/혜택 박탈 없음
- 출금 전/후 가능한 최대 업무를 정확히 보여줌
- admin 잔액 조정 후 새 업무 가능 규모 확인 가능
- ledger/idempotency/RLS/JWT/ciphertext guard 유지
- 회원/어드민 성능 회귀 없음
- 공식 도메인에서 실제 동작 검증

## 18. 최종 사용자 메시지 원칙

### 왜 돈이 필요한가요?

`업무 보증금은 일을 사는 비용이 아닙니다. 퍼뜩의 업무는 면접·출근 약속 없이 바로 배정되기 때문에, 한정된 업무를 맡는 동안 업무잔액 일부를 잠시 잠급니다. 일반 업무를 정상적으로 마치면 보증금은 전액 업무잔액으로 돌아오고 수당이 별도로 지급됩니다.`

### 왜 업무잔액을 유지하나요?

`업무잔액은 맡을 수 있는 업무 규모를 정합니다. 잔액을 유지하면 그 금액에 가까운 업무를 바로 선택할 수 있고, 출금하면 남은 잔액 기준으로 가능한 업무 규모가 다시 계산됩니다.`

### 1,000만원을 넣으면?

`1,000만원급 공개 업무가 있고 자리가 남아 있다면 즉시 그 업무를 가장 먼저 추천합니다. 1,000만원을 넣었다는 이유만으로 별도의 대기기간을 두지 않습니다.`

---

이 문서 이후의 구현은 이 규칙을 깨는 새로운 현금 게이트, 숙성기간, 자동 강등, 금액 기반 초고액 하드코딩을 추가하지 않는다. 업무 접근의 canonical 기준은 `work_balance`, `requires_assign`, 실제 공개상태, 기존 서버 업무 한도/동시진행/자리 제한이다.
