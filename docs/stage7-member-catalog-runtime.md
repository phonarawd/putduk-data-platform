# Stage 7 — Member catalog runtime / Generic Work cutover

## Scope
- 회원 업무목록을 한 화면에 모두 유지하지 않고 12개 단위로 렌더한다.
- 분류 변경 시 목록 영역만 새로 만든다.
- 카드에는 Stage 6의 실제 예산/자리/승인 수치를 계속 사용한다.
- canonical `task_run` 시작·검수·정산 흐름은 유지한다.
- 실행 화면과 제출만 Generic Work Engine contract로 전환한다.
- 브라우저는 service role을 보유하지 않는다.
- Generic RPC는 `browser JWT -> verify_jwt Edge -> service_role RPC`로만 호출한다.

## Catalog behavior
- 초기 12개
- `업무 더 보기` 12개씩 추가
- `#nodeGrid`는 Stage 7에서 `#stage7NodeGrid`로 인계하여 Stage 6 observer와 재삽입 경쟁을 막는다.
- 카드에 `content-visibility:auto`를 적용한다.
- 현재 Production 공개 업무 수는 변경하지 않는다.
- Stage 4의 120개 catalog는 계속 draft + disabled 상태다.

## Generic runtime
1. 기존 canonical start가 `task_run`을 생성한다.
2. DB trigger가 Generic Work item을 materialize한다.
3. 회원 runtime이 자기 active run을 찾는다.
4. JWT Edge의 `work_contract` action이 service-role-only `putduk_member_work_contract`를 호출한다.
5. member-safe payload와 definition만 브라우저에 전달한다.
6. 제출은 JWT Edge의 `submit_work` action이 `putduk_member_submit_work_v2`를 호출한다.
7. Generic submit은 run을 `submitted`로 바꾸고 제출/이벤트를 기록하지만 wallet/ledger 정산은 하지 않는다.
8. 이후 기존 review/settlement contract가 계속 담당한다.

## Fallback
Generic contract가 없거나 Edge read가 실패하면 기존 player를 그대로 유지한다.
