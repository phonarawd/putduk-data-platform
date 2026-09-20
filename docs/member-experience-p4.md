# Stage 6 — P4 회원경험

MASTER `P4 — 회원경험`을 실제 수치 기반으로 연결한다.

## 적용 범위

- 체험-first 온보딩의 첫 수당 가치 순간 강화
- 업무잔액 설명을 필요한 업무 선택 시점까지 지연
- MAX BALANCE FIT 정렬
- 회원 업무 카드에 검증된 지급예산만 표시
- 실제 오늘 남은 자리와 실제 오늘 승인 건수 표시
- 실제 잔액 증가에만 정산 이동 연출
- 실제 업무잔액 증가로 고액 업무가 새로 가능해진 경우만 해금 장면 표시

## 데이터 원칙

`putduk_member_experience_snapshot`은 회원 본인의 잔액과 현재 공개 업무를 기준으로 DB 내부에서 집계한다. 하루 자리와 완료 건수는 `task_runs`, 지급예산은 `partner_funding_pools` + `partner_budget_allocations`의 검증·공개 상태만 사용한다.

회원 브라우저는 private 예산 테이블을 직접 읽지 않는다. JWT 검증이 켜진 `member-experience` Edge가 service-role-only snapshot 함수만 호출한다.

## FOMO 경계

기존 상단 FOMO의 가명·가상 인원·가상 자리 소진 엔진은 이 Stage에서 수정하지 않는다. 다만 **업무 카드의 남은 자리**는 더 이상 가상 타이머 값이 덮어쓰지 못하도록 카드의 synthetic slot hook을 제거하고 실제 snapshot 값으로 표시한다.

## 시작 가능 여부

- 금액 부족만으로 공개 업무를 목록에서 숨기지 않는다.
- `requires_assign=true`인 업무만 지정회원에게 노출한다.
- 실제 남은 자리가 0이면 시작하지 못한다.
- 진행/제출/검수대기/재작업 중인 업무가 있으면 새 업무 시작을 막는다.
- 체험 업무는 지원금과 체험 사용 여부를 실제 값으로 판정한다.
