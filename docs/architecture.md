# 퍼뜩 데이터 노드 운영 아키텍처

## 공개 상태

협력사와 업무 카드는 `자료 등록 → 운영자 확인 → 공개 승인` 순서로 관리합니다. 회원 화면에는 `verification_status=approved`, `logo_usage_status=approved`, `published=true`인 협력사와 연결된 공개 업무만 노출합니다. 승인 자료가 없는 기업은 회원 화면에서 공식 협력사로 표시하지 않습니다.

## 회원 인증과 고유 번호

회원가입은 신규 Supabase Auth 프로젝트에만 연결합니다. 가입 트리거가 공개 회원번호(`PDK-연도-식별값-일련번호`)와 비공개 개인정보를 분리해 만들고, 사용자별 기본 지갑·지원금·추천 관계를 준비합니다. 브라우저에는 publishable key만 두며 service role/secret key는 노출하지 않습니다.

## 작업 실행과 화면 복원

브라우저 애니메이션은 화면 표현을 담당하고, 실제 기준은 `task_runs`의 서버 시각입니다.

1. 회원이 공개 업무 카드를 시작하면 DB 트리거가 회원·노드·일일 한도·보상 범위를 검증합니다.
2. 실행번호, 시작 시각, 완료 예정 시각, 연출 변형, 보상 금액을 서버가 생성합니다.
3. 회원이 화면을 닫거나 다른 화면으로 이동해도 실행 행은 남습니다. 재접속·화면 복귀 시 서버 시각을 다시 읽어 진행률을 복원합니다.
4. 완료 시 회원은 자신의 실행을 `submitted`로만 제출할 수 있고, 예상 완료 시각·노드·보상은 DB가 보존합니다.

## 검수 완료와 보상 반영

운영자 관리센터의 **업무 검수** 메뉴는 실제 `task_runs` 기록을 읽습니다. 제출 완료 또는 검수 대기 항목에서 운영자가 **검수 완료**, **재확인**, **반려** 중 하나를 선택합니다.

검수 완료를 선택하면 `admin-control` Edge Function이 다음 서버 트랜잭션을 호출합니다.

- `task_runs.status: submitted/review_pending → approved`
- `reward_status: pending/held → posted`
- 작업 보상 지갑과 출금 가능 잔액 갱신
- 중복 방지 원장(`private.ledger_entries`) 기록
- `task_events`에 검수 결과 기록
- 회원 알림(`public.notifications`) 발송
- 운영자 감사 로그 기록

원장 idempotency 키와 행 잠금으로 같은 업무를 두 번 승인해도 보상이 중복 지급되지 않습니다. 회원 화면은 세션 동기화·화면 복귀·주기 새로고침으로 상태, 잔액, 알림을 다시 읽어 **검수 완료**를 표시합니다.

## 관리자 권한 경계

`/admin/`은 주소만으로 열리지 않습니다. 로그인한 계정이 `private.admin_roles`의 `super_admin` 또는 메뉴별 역할을 가져야 하며, `admin-control` Edge Function이 매 요청 JWT와 역할을 다시 확인합니다. 업무 검수는 `work_review` 또는 `super_admin`만 사용할 수 있습니다. private 스키마와 서비스 전용 함수는 anon/authenticated 권한을 회수했습니다.

## PWA와 테마

회원·관리자 셸은 동일한 정적 산출물을 사용하고 경로만 분리합니다. 기본은 밝은 모드이며 회원이 어두운 모드로 전환할 수 있습니다. 서비스 워커, 매니페스트, 파비콘, 설치 아이콘을 함께 배포하고 iPhone·iPad에는 Safari 공유 메뉴의 홈 화면 추가 안내를 제공합니다.

## 아직 운영자 설정이 필요한 항목

- 운영자 Auth 계정 생성 후 해당 UUID를 `private.admin_roles`에 등록
- 협력 확인 자료와 로고 사용 자료 승인 후 기업 공개
- 공개 업무 카드 등록·보상·처리 시간·일일 한도 설정
- 신규 회원 지원금 캠페인과 회원 활성화 정책 확인
- 입금·출금·KYC·추천 보상용 운영 API 연결 및 실제 수동 처리 정책 등록
- Cloudflare Pages 도메인을 Supabase Auth Site URL/Redirect URL에 등록

이 항목이 끝나기 전에는 회원 작업 API 플래그를 켜지 않습니다.
