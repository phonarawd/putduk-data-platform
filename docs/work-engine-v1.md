# 퍼뜩 범용 Work Engine v1

## 목적

`dist/assets/app.js`에 업무별 분기를 계속 추가하지 않고, 운영 데이터와 versioned schema로 새로운 업무를 정의할 수 있는 기반이다. 기존 `nodes → task_runs → work_submissions → review → settlement` 흐름은 유지한다. 돈 이동은 이 엔진이 직접 처리하지 않는다.

## 내부 모델

MASTER 기준의 다섯 구조를 `private` schema에 둔다.

```text
private.work_templates
private.work_template_versions
private.work_orders
private.task_run_items
private.task_run_answers
```

`public.task_runs`에는 실행 시점에 고정한 `work_order_id`, `work_template_version_id`, `work_schema_version`만 추가한다. 이미 생성된 과거 run은 그대로 두고, migration 이후 새 run만 active work order가 있으면 범용 계약을 고정한다.

### template

업무의 안정된 식별자다. `template_key`는 화면에 직접 노출할 문구가 아니라 내부 키다.

### template version

한 번 시작한 run의 화면/검증 규칙이 나중에 운영자가 definition을 바꿔도 흔들리지 않도록 버전을 고정한다.

`definition`의 필수 축:

```json
{
  "schema_version": "putduk.work/1.0",
  "template_key": "quantity_check",
  "template_version": 1,
  "components": [],
  "workflow": { "steps": [] },
  "evidence": {},
  "submission": { "contract": "putduk.work_submission/1.0" },
  "review": { "contract": "putduk.review/1.0" },
  "settlement": { "contract": "putduk.stake_stipend/1.0" }
}
```

### work order

기존 `node`와 template version을 연결한다. `static` order는 `input_payload.items`와 `validation_payload.items`만 바꾸면 새 데이터 세트를 만들 수 있다.

회원에게 보여도 되는 값은 `input_payload`에서 `task_run_items.member_payload`로 복사한다. 정답이나 서버 판정값은 `validation_payload`에서 `task_run_items.validation_payload`로 복사하며 member contract에 포함하지 않는다.

### run item / answer

run 시작 시 item을 고정한다. 제출 후 item별 답변과 evidence, 서버 검증 상태를 `task_run_answers`에 기록한다. 기존 `work_submissions`도 계속 canonical 제출 기록으로 남는다.

## Client component registry

`src/work/engine.mjs`의 기본 registry는 다음 component를 제공한다.

- `text`
- `digits`
- `integer`
- `boolean`
- `choice`

새 UI primitive가 정말 필요할 때만 registry에 component adapter를 한 번 추가한다. 단순히 새로운 업무를 추가하는 경우에는 `app.js` 분기를 추가하지 않고 definition의 component/step 조합을 바꾼다.

Client validation은 필수값·형식·범위만 확인한다. 서버 expected 값은 브라우저 계약에 포함하지 않는다.

## Member contract

```text
public.putduk_member_work_contract(user_id, task_run_id)
```

반환값:

```text
putduk.work_contract/1.0
├─ schema_version
├─ template_key / template_version
├─ definition
└─ items[]
   ├─ item_key
   ├─ step_key
   ├─ ordinal
   └─ payload         # member-safe only
```

`validation_payload`은 반환하지 않는다. 이 RPC는 `service_role` backend 전용이며 브라우저가 `/rest/v1/rpc`로 직접 실행하지 않는다. Stage 4의 member runtime 전환 시 verified Edge action을 통해 호출한다.

## Submission contract

```text
public.putduk_member_submit_work_v2(user_id, task_run_id, submission)
```

입력 버전은 `putduk.work_submission/1.0`이다. 이 RPC도 `service_role` backend 전용이고, member JWT는 verified Edge 경계에서 user id를 확정한 뒤 전달한다.

```json
{
  "contract": "putduk.work_submission/1.0",
  "schema_version": "putduk.work/1.0",
  "template_key": "quantity_check",
  "template_version": 1,
  "task_run_id": "...",
  "answers": {
    "item-1": { "ordered": 10, "received": 9 }
  },
  "evidence": {
    "item-1": {}
  }
}
```

서버가 component 규칙과 `task_run_items.validation_payload`를 검증한다. 통과하면 `task_run_answers`, `work_submissions`, `task_events`, `task_runs.status=submitted`를 함께 기록한다. 이 함수는 wallet/ledger를 변경하지 않는다.

현재 v1 서버 validator는 `none`과 `equals_expected` mode를 지원한다. 새 업무가 단순 입력/분류/대조라면 이 두 규칙과 component constraints로 정의하고, 더 강한 공통 validator가 필요할 때는 업무별 if/else가 아니라 validator DSL 자체를 확장한다.

## Review contract

기존 `public.putduk_admin_review_task`를 canonical review 함수로 유지한다.

```text
approved / rework / rejected
```

새 work definition에는 review contract 이름과 허용 decision을 선언하지만, 실제 권한·상태전이는 기존 DB 함수가 최종 판정한다.

## Settlement contract

`putduk.stake_stipend/1.0`은 기존 불변조건을 그대로 사용한다.

```text
approved
→ locked stake release
→ principal returns to work_balance (일반 업무)
→ stipend posts to available
```

범용 Work Engine의 submit 함수는 정산을 직접 실행하지 않는다. review 승인 뒤 기존 `private.putduk_release_stake` / `private.putduk_grant_stipend` 흐름이 처리한다.

## Existing workflow compatibility

Stage 3 migration은 현재 production 업무를 두 template으로 매핑한다.

- `inspect_bundle` — 기존 비-catalog node
- `catalog_listing` — `motion_profile`에 catalog가 포함된 node

현재 UI와 `putduk_member_submit_work`는 그대로 둔다. 따라서 migration 자체는 기존 회원 수행 경로를 바꾸지 않는다. 새 run에는 generic contract/item도 함께 준비되어 이후 단계에서 점진적으로 v2로 전환할 수 있다.

## Stage 4에서의 사용 원칙

120개 업무를 추가할 때 다음 순서를 지킨다.

1. 서로 다른 목적/입력/행동/검증/완료조건을 template version으로 정의한다.
2. node에 active work order를 연결한다.
3. member contract만 renderer에 전달한다.
4. expected/검증 데이터는 server-only로 유지한다.
5. 제출은 generic v2 contract를 사용한다.
6. 검수/정산은 기존 review/settlement 불변조건을 유지한다.

업무 제목이나 회사명만 바꾸고 같은 definition을 복제해 120개로 세지 않는다.
