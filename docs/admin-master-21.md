# Admin MASTER 21 영역 — Stage 5

이 Stage는 `docs/PUTDUK_MASTER_FINAL_ARCHITECTURE.md`의 최종 관리자 IA를 실제 운영 메뉴로 연결한다.

## 21개 운영 메뉴

1. 운영 현황
2. 회원
3. 협력사
4. 지급예산
5. 업무 만들기
6. 공개 업무
7. 회원 업무 배정
8. 업무 검수
9. 입출금
10. 가입 지원금
11. 회원 등급
12. 첫 이용 안내
13. 자주 묻는 질문
14. 회원 알림
15. 실시간 현황 표시
16. 공지
17. 본인확인
18. 변경 기록
19. 화면 미리보기
20. 랜딩 이용 현황
21. 랜딩 회원 후기

## 구현 원칙

- 회원/운영자 화면에는 내부 기술용어 대신 업무 용어를 사용한다.
- 협력사 내부 식별값은 자동 생성하며 운영자가 직접 입력하지 않는다.
- 업무 만들기는 협력사 → 업무 종류 → 회원이 실제로 할 일 → 보증금·수당·시간·자리 → 미리보기의 5단계 흐름을 사용한다.
- 협력 확인 자료는 파일 선택으로 받고 private storage에 저장한다.
- 협력사 로고와 대표 사진은 verified admin Edge를 통해 공개 이미지 bucket에 업로드한다.
- 지급예산은 `private.partner_funding_pools`, `private.partner_budget_allocations`, `private.partner_budget_ledger`로 관리하며 회원 wallet/ledger 정산과 분리한다.
- 첫 이용 안내, FAQ, 회원 알림 문구는 `private.admin_content_items`에서 관리한다.
- 변경 기록 화면은 `private.admin_audit_logs`의 민감 payload를 제외한 요약만 조회한다.
- 화면 미리보기는 브라우저 로컬 표현만 바꾸며 Production wallet/ledger를 수정하지 않는다.
- Stage 5에서는 기존 synthetic live-status/FOMO 저장값을 수정하지 않는다. 실제값 전환은 Stage 9 범위다.
- 기존 finance/KYC/회원/검수/알림/랜딩 계약은 `admin-master`가 `admin-phase5`로 proxy하여 기존 보안 경계를 유지한다.

## Stage 5에서 의도적으로 하지 않는 것

- Admin server pagination — Stage 6
- Member catalog incremental rendering / generic runtime cutover — Stage 7
- Frontend patch-stack consolidation — Stage 8
- Synthetic FOMO → real data — Stage 9
- Wallet/ledger settlement 변경 — 범위 밖
