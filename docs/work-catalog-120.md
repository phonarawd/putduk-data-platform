# 120개 실질적 업무 카탈로그 — Stage 4

## 범위

MASTER의 12개 분야 × 10개, 총 120개 업무를 Stage 3 범용 Work Engine 위에 정의한다.

이번 Stage에서는 회원에게 즉시 공개하지 않는다. 현재 회원 카탈로그는 전체 node를 eager-render하고 기존 player가 legacy 경로를 사용하므로, 120개 node는 모두 `draft + enabled=false`로 유지한다. 실제 공개 전환은 이후 회원 카탈로그 incremental rendering/runtime cutover 단계에서 별도 검증한다.

## 데이터 출처 원칙

120개 업무는 외부 협력사의 실제 발주 업무라고 주장하지 않는다.

- 내부 source: `퍼뜩 내부 업무 카탈로그`
- `partner_brands.published = false`
- `verification_status = pending`
- 외부 협력사 로고/상호를 새 120개 업무에 연결하지 않는다.

각 업무의 fixture는 엔진 검증용 합성 데이터다. 회원 공개용 manifest에는 정답이나 server-only validation payload를 포함하지 않는다.

## 업무별 계약

각 업무는 다음 값을 가진다.

- MASTER 고유 제목과 목적
- 입력 schema signature
- 출력 형태
- 실제 판정 규칙 문구
- evidence policy
- review mode/policy
- workflow profile
- 예상 시간
- draft 보증금/수당
- versioned `putduk.work/1.0` definition
- static controlled fixture
- server-only expected answer

검증은 공통 서버 계약의 `equals_expected`를 사용하지만, expected answer는 업무별 계산/분류/정규화 규칙으로 미리 만든 controlled fixture에서 나온다. 따라서 UI나 `app.js`에 업무별 분기 코드를 추가하지 않는다.

## 중복 방지

MASTER 기준 semantic fingerprint:

```text
업무 목적
+ workflow profile
+ 실제 input schema signature
+ output shape
+ validation rule
```

`private.work_template_versions.semantic_fingerprint`에 저장하며, non-null fingerprint에 unique partial index를 둔다.

제목만 바꾼 복제 정의가 같은 의미 계약을 유지하면 unique index에서 거부된다.

## 공개 전 안전장치

- node: `catalog_status = draft`
- node: `enabled = false`
- internal source: `published = false`
- 모든 120개 template/version/order는 engine 테스트를 위해 존재하지만 일반 catalog start guard를 통과하지 않는다.
- 기존 published node, wallet/ledger, finance, FOMO 데이터는 변경하지 않는다.

## 후속 공개 조건

120개를 실제 회원 카탈로그에 공개하기 전에 최소 다음이 완료돼야 한다.

1. member runtime의 generic contract/submit v2 cutover
2. catalog pagination/load-more/windowing 중 하나
3. mobile/저사양 DOM·JS 성능 검증
4. Admin에서 draft → published 전 검토/중복검사
5. 실제 파트너/데이터 공급 근거가 있는 업무만 해당 파트너에 연결
