# 퍼뜩(PUTDUK) 플랫폼 Cursor AI 최종 통합 인계문

> 이 문서는 퍼뜩 플랫폼의 현재 구현 상태와 정식 출시 목표를 하나로 통합한 작업 지시서다. Cursor AI는 먼저 현재 저장소와 Supabase 상태를 점검하고, 완료·미완료를 구분한 뒤 단계별로 구현한다. 구현하지 않은 기능을 완료했다고 보고하지 않는다.

## 1. 프로젝트 정체성 및 보호 범위

프로젝트명은 퍼뜩(PUTDUK)이다. 기존 퍼뜩 리셀 플랫폼과 분리된 데이터 업무 플랫폼이다.

GitHub 저장소:

~~~text
https://github.com/phonarawd/putduk-data-platform
~~~

운영 브랜치:

~~~text
main
~~~

Supabase:

~~~text
Project ID: gaugwamwceqdnqdqrxqg
URL: https://gaugwamwceqdnqdqrxqg.supabase.co
Name: PUTDUK-DATA-PRODUCTION
Region: ap-northeast-2
~~~

화면:

~~~text
회원: /
운영자: /admin/
~~~

절대 수정하지 않는다.

- 기존 퍼뜩 GitHub 저장소
- 기존 퍼뜩 Supabase 프로젝트
- 기존 회원 데이터
- 기존 운영 코드
- 기존 입출금 데이터

회원용 화면과 운영자 화면은 하나의 저장소 안에서 경로로 분리한다. 별도 UI 레포와 관리자 레포를 만들지 않는다.

## 2. 기술 기준

현재 저장소는 Cloudflare Pages 정적 배포 구조다.

~~~text
Node.js 24 LTS
pnpm 12.4.2
Vanilla ES6+
Tailwind CSS CDN
Lucide Icons
Chart.js
Supabase JS
Supabase Edge Functions
Cloudflare Pages
PWA
~~~

현재 Next.js·Turborepo로 이관된 상태가 아니다. 정적 구조를 먼저 완성하고, 이후 필요할 때만 마이그레이션한다.

주요 파일:

~~~text
dist/index.html
dist/admin/index.html
dist/assets/app.js
dist/assets/app.css
dist/manifest.webmanifest
dist/sw.js
dist/favicon.svg
dist/icons/*
supabase/migrations/*
supabase/functions/admin-control/index.ts
tooling/scripts/verify-static.mjs
.github/workflows/ci.yml
wrangler.toml
~~~

최신 커밋:

~~~text
7b35b6885c597eb64c5ddbb900888f30f1658c9e
~~~

최신 CI:

~~~text
https://github.com/phonarawd/putduk-data-platform/actions/runs/35157352696
~~~

## 3. 현재 실제 DB·Edge 상태

원격 DB 확인 결과:

~~~text
협력사: 8개 (승인·회원 공개)
업무 노드: 14개 (공개·활성 13, 일시 중지 1)
운영자 역할: 1개
지원금 캠페인: 1개
업무 실행 기록: 3개
~~~

등록 협력사:

~~~text
DHL
UPS
FedEx
Maersk
알리바바
이베이
CJ대한통운
GXO
~~~

협력사 8곳은 승인·회원 공개 상태다. 회원 화면에는 승인·공개된 협력사와 연결된 공개 업무만 노출한다.

Edge Function:

~~~text
이름: admin-control
상태: ACTIVE
버전: 24
JWT 검증: 활성화
주소:
https://gaugwamwceqdnqdqrxqg.supabase.co/functions/v1/admin-control
~~~

Supabase Security Advisor 결과:

~~~text
유출 비밀번호 보호: 꺼짐 (Free 플랜, 활성화 시 402)
~~~

## 4. 현재 구현 완료 범위

### 회원 인증

- 회원가입
- 이름
- 생년월일 6자리
- 휴대폰번호
- 이메일
- 비밀번호
- 비밀번호 확인
- 추천인 코드
- 필수 약관 동의
- 선택 알림 동의
- 이메일 인증 구조
- 로그인
- 세션 복원
- 비밀번호 재설정
- 프로필 생성 트리거
- 공개 회원번호 생성 구조
- 기본 지갑 생성
- 신규 회원 지원금 캠페인 연결
- 추천 관계 생성 구조

현재 이름·생년월일·휴대폰은 입력값 수집 구조다. 실제 본인확인 서비스는 별도 구현이 필요하다.

### 회원 기능

- 밝은 모드 기본
- 다크 모드
- 반응형 UI
- 멤버십 카드
- 회원 등급
- 작업 노드 화면
- 작업내역 화면
- 지갑 화면
- 추천인 화면 기본 구조
- 입금·출금 안내 화면
- PWA 설치 버튼
- iPhone Safari 설치 안내
- 서비스워커
- 파비콘 및 아이콘

### 업무 실행

서버가 다음 값을 생성한다.

- 실행번호
- 시작시간
- 완료예정시간
- 보상금
- 연출 변형값
- 연출 시드
- 보상 정책 버전
- 업무 상태

상태:

~~~text
reserved
in_progress
checkpointed
submitted
review_pending
approved
rework
rejected
cancelled
~~~

회원은 본인 업무만 제출할 수 있다. 예상 완료시간 전 제출은 거부한다. 화면을 닫아도 서버 실행은 유지한다.

### 검수 및 지급

운영자 검수 메뉴에서 실제 제출 업무를 확인한다.

검수 완료 시 서버에서 함께 처리한다.

- 업무 상태 approved
- 보상 상태 posted
- 작업 보상 지갑 반영
- 출금 가능 잔액 반영
- private.ledger_entries 기록
- 중복 지급 방지
- task_events 기록
- 회원 알림 생성
- review_decisions 기록
- admin_audit_logs 기록

같은 업무를 두 번 승인해도 idempotency key로 이중 지급되지 않는다.

### 협력사·업무 공개

현재 운영자 화면에서 연결된 기능:

- 협력사 목록 조회
- 협력 자료·로고 승인
- 협력사 회원 공개
- 협력사 회원 비공개
- 업무 카드 목록 조회
- 업무 카드 공개
- 업무 카드 중지
- 업무 카드 보관

회원 화면에는 승인·공개된 협력사와 업무만 노출한다.

## 5. 현재 애니메이션 구현 상태

현재 구현:

- requestAnimationFrame
- Canvas 네트워크 궤도
- 패킷 이동
- 진행률 바
- 단계별 문구
- 터미널 로그 변화
- 서버 시간 기반 진행률
- 화면 이탈 후 복원
- 노드별 예상시간·보상
- motion_profile·motion_variant·motion_seed 저장
- DPR 제한

아직 미완료:

- 기업별 완전히 다른 장면
- 실제 차량·비행기·선박 이동
- 0~15초·15~35초·35~60초 시네마틱 구간
- WebGL2·GLSL 파티클
- Web Worker·OffscreenCanvas
- Web Audio API 효과음
- 기업별 경로·모델·패킷·완료효과
- 저사양 모바일 자동 품질 조절

현재 기본 Canvas 효과가 대부분 공통이므로, 최종 출시 전 motion registry와 기업별 scene을 추가해야 한다.

## 6. 최종 수익 지급 정책

모든 지급은 운영자 설정값과 서버 원장을 기준으로 한다.

### 업무 보상

운영자가 설정:

~~~text
최소 보상
최대 보상
예상 처리시간
하루 처리 한도
업무 가능 회원등급
공개 상태
연출 프로필
~~~

처리 순서:

~~~text
운영자 설정
→ 회원 업무 시작
→ 서버가 reward_amount 확정
→ 회원 입력값 무시
→ 업무 제출
→ 운영자 검수 완료
→ 지갑 반영
→ 출금 가능 잔액 반영
→ 원장 기록
→ 회원 알림
~~~

회원 브라우저에서 보상 금액을 변경할 수 없어야 한다.

### 신규 회원 지원금

기본 캠페인:

~~~text
캠페인명: 신규 회원 업무 지원금
기본금액: 10,000원
기본 트리거: signup
사용범위: work_only
~~~

운영자에서 다음을 변경할 수 있어야 한다.

- 지급 금액
- 지급 조건
- 활성화·중지
- 사용범위
- 유효기간
- 지원금 회수
- 지원금 원장

### 추천인 보상

추천은 무제한으로 허용한다.

단, 추천 회원이 실제 조건을 충족했을 때만 추천인에게 5,000원을 지급한다.

~~~text
추천 회원 가입
→ 계정 활성화
→ 실제 입금 확인
→ 실제 업무 수행
→ 조건 충족
→ 추천 보상 승인
→ 추천인 지갑에 5,000원 반영
~~~

필수:

- 추천 코드 자동 생성
- 추천 코드 중복 방지
- 추천 회원 수
- 추천 회원 목록
- 입금 여부
- 업무 수행 여부
- 보상 보류
- 보상 승인
- 보상 반려
- 어뷰징 신호
- 중복 지급 방지
- 추천 보상 원장
- 회원 알림

### 입금·출금

PG사 자동연동 없이 운영자가 수동 처리한다.

모든 금액 변경은 다음 순서를 따른다.

~~~text
회원 신청
→ 운영자 확인
→ 승인·반려
→ 원장 기록
→ 지갑 반영 또는 차감
→ 회원 알림
~~~

프론트엔드에서 잔액을 직접 증가·감소시키지 않는다.

## 7. 반드시 추가 구현할 운영자 기능

### 회원 관리

- 실제 회원 목록
- 회원번호 검색
- 이름 검색
- 이메일 검색
- 휴대폰 검색
- 가입일
- 최근 접속
- IP
- 등급
- 상태
- 지갑
- 작업내역
- 입금내역
- 출금내역
- KYC 상태
- 추천 수
- 회원 차단
- 차단 해제
- 비밀번호 재설정
- 등급 변경
- 특정 회원 업무 배정
- 특정 회원 알림
- 회원 행동 이력

현재 정적 샘플 회원 행을 실제 DB 조회로 교체한다.

### 협력사

- 협력사 등록·수정
- 법인명
- 분야
- 한국어 설명
- 자료 URL
- 증빙 파일
- 로고 파일
- 미리보기
- 승인 메모
- 승인자
- 승인시간
- 만료일
- 회원 공개·비공개
- 변경 이력

### 업무 카드

- 업무 카드 등록
- 협력사 선택
- 업무명
- 설명
- 분류
- 난이도
- 예상시간
- 최소·최대 보상
- 하루 처리 한도
- 가능 등급
- 연출 프로필
- 연출 버전
- 공개·중지·보관·복구
- 수정

현재 create_node와 update_node Edge API를 운영자 폼과 연결한다.

### 특정 회원 배정

운영자가 실제 업무를 특정 회원에게 배정한다.

필드:

~~~text
회원 ID
협력사
업무 카드
보상
예상시간
배정 사유
노출 시작시간
노출 종료시간
알림 여부
~~~

알림 예시:

~~~text
🎉 회원님에게 새로운 우선 업무가 배정됐어요.
📦 회원님 전용 업무가 작업실에 도착했어요.
⭐ 운영자가 배정한 업무를 확인해 보세요.
~~~

실제로 배정하지 않은 업무를 배정된 것처럼 표시하지 않는다.

## 8. 입금·출금·KYC

### 입금

- 원화 계좌 등록
- 은행명
- 예금주
- 계좌번호
- 안내문구
- USDT 네트워크
- USDT 주소
- QR 이미지
- 입금 금액
- 입금 증빙
- 운영자 승인·반려
- 반려 사유
- 입금 원장
- 입금내역
- 입금 알림

### 출금

- 원화·USDT 선택
- 출금 금액
- 은행계좌·USDT 주소
- 6자리 출금 비밀번호
- KYC 확인
- 출금 가능 잔액 확인
- 운영자 승인·반려
- 송금 완료
- 거래번호
- 잔액 차감
- 반려 시 복구
- 출금내역
- 출금 알림

### KYC

- private Storage 버킷
- 신분증 앞면
- 신분증 뒷면
- 셀카
- 파일 검증
- 검수 대기
- 승인
- 반려
- 반려사유
- 검수자
- 검수시간
- signed URL 미리보기

KYC 원본 주소를 공개하지 않는다.

출금 비밀번호는 평문 저장하지 않는다. 해시·실패 횟수·잠금시간만 저장한다.

## 9. 한국어 UI와 알림 토스트

전체 UI는 한국어로 작성한다.

영어 허용:

- DHL·UPS·FedEx·Maersk 등 기업명
- 회원번호
- 거래번호
- URL
- 이메일
- 내부 기술값

운영자 UI 금지 표현:

~~~text
API 오류
RPC 오류
토큰 오류
데이터베이스 오류
CRUD
디버그
테스트 데이터
~~~

대체 표현:

~~~text
요청을 처리하지 못했어요.
운영자 권한을 확인해 주세요.
잠시 후 다시 시도해 주세요.
회원 정보를 불러오고 있어요.
변경 기록을 저장하지 못했어요.
~~~

토스트 규칙:

- 성공·안내·주의·오류 상태
- aria-live
- 모바일 safe-area
- 자동 닫힘
- 큐 처리
- 중복 방지
- 실제 서버 응답 기반 금액
- 필요한 경우 액션 버튼
- 확정되지 않은 금액을 확정 수익으로 표시하지 않음

예시:

~~~text
🎉 가입이 완료됐어요. 회원 카드를 준비했어요.
📨 이메일 인증 안내를 보냈어요.
🟢 데이터 업무를 시작했어요.
📡 서울 노드와 연결 중이에요.
🚚 배송 데이터 경로를 분석하고 있어요.
✈️ 항공 운송 데이터를 비교하고 있어요.
🚢 컨테이너 상태를 대조하고 있어요.
📦 상품 속성 정보를 정리하고 있어요.
✅ 업무 제출이 완료됐어요. 운영자 검수를 기다리고 있어요.
🎉 검수가 완료됐어요. 보상이 지갑에 반영됐어요.
🔁 일부 항목을 다시 확인해 주세요.
💳 입금 확인 요청을 접수했어요.
🔐 출금 전 본인확인이 필요해요.
📲 퍼뜩 앱이 설치됐어요.
~~~

이모지는 보조 표현이며 업무 시각화 자체를 대체하지 않는다.

## 10. 애니메이션 기술 사양

권장 기술:

~~~text
Three.js WebGL2
PixiJS 또는 직접 구현한 WebGL 스프라이트
requestAnimationFrame
Web Animations API
InstancedMesh
GLSL Shader
OffscreenCanvas
Web Worker
최적화 GLB
Draco/KTX2 압축
자체 SVG 세계지도
Canvas/SVG 폴백
~~~

추천 구조:

~~~text
src/motion/motion-engine.ts
src/motion/motion-registry.ts
src/motion/motion-timeline.ts
src/motion/motion-quality.ts
src/motion/scenes/road-logistics.scene.ts
src/motion/scenes/air-cargo.scene.ts
src/motion/scenes/ocean-vessel.scene.ts
src/motion/scenes/warehouse-edge.scene.ts
src/motion/scenes/commerce-catalog.scene.ts
src/motion/scenes/satellite-network.scene.ts
src/motion/workers/motion.worker.ts
src/motion/assets/*
~~~

기업별 모션:

~~~text
DHL       → 배송 차량·도로 경로·스캔
UPS       → 경로 분기·운송 예외
FedEx     → 비행기·항로·통관 문서
Maersk    → 컨테이너선·해상 항로·항만
알리바바   → 상품 카드·컨베이어·속성 비교
이베이     → 상품 정합성·필드 일치
CJ대한통운 → 배송 차량·창고 스캔
GXO       → 창고 격자·재고 분산
~~~

각 노드에 다음 값을 저장한다.

~~~json
{
  "motion_profile": "road_logistics",
  "motion_version": "2.0.0",
  "scene_theme": "dhl_amber",
  "vehicle_type": "delivery_van",
  "route_type": "city_route",
  "particle_style": "data_packet",
  "completion_effect": "gold_sync"
}
~~~

차량·비행기·선박은 실제 경로 접선에 맞춰 회전한다.

작업시간은 서버의 다음 값을 기준으로 한다.

~~~text
started_at
expected_completed_at
현재 서버시간
progress
motion_variant
motion_seed
~~~

60초 기본 연출:

~~~text
0~15초: 데이터센터·도시·위성 회선 연결
15~35초: 차량·비행기·선박·상품 데이터 이동
35~50초: 비교·품질검사·오류 분리
50~60초: 검수 대기·보상 계산·금빛 동기화
~~~

긴 업무는 같은 비율로 확장한다.

## 11. 성능 기준

~~~text
일반 PC: 60fps 이상
중급 스마트폰: 45fps 이상
저사양 스마트폰: 30fps 이상
장기 메인 스레드 작업: 50ms 이하
Canvas DPR: 1.0~1.5 자동 조절
~~~

반드시 적용:

- WebGL Context Lost 복구
- WebGL 미지원 Canvas/SVG 폴백
- Worker 경로·파티클 계산
- 오브젝트 풀링
- IntersectionObserver
- 백그라운드 탭 렌더링 감소
- 저사양 기기 품질 하향
- prefers-reduced-motion
- 페이지 이동 시 GPU 해제
- 모바일 화면 잘림 방지
- 배터리 절약 모드 대응

## 12. 테마·PWA

### 테마

- 최초 접속 밝은 모드
- 다크 모드 전환
- 밝은·어두운 배경에서 텍스트 대비 확보
- 버튼 텍스트 가독성
- 에메랄드·금색 포인트
- 글래스모피즘
- backdrop blur
- 색상 외 아이콘·문구 병행

### PWA

~~~text
manifest.webmanifest
sw.js
favicon.svg
icon-180
icon-192
icon-512
~~~

Android:

- beforeinstallprompt
- 설치 버튼
- 설치 완료 토스트

iPhone:

~~~text
📱 Safari 하단 공유 버튼
→ 홈 화면에 추가
→ 퍼뜩 아이콘 선택
~~~

HTTPS에서만 설치를 허용한다.

## 13. AI 범위

1차 출시에서 AI 자동 판정은 필수가 아니다.

추후 추가한다면:

- 별도 Edge Function
- AI는 참고 점수만 생성
- 금액 지급 자동 승인 금지
- 출금 자동 승인 금지
- KYC 자동 승인 금지
- 운영자 최종 승인
- 모델·프롬프트 버전 기록
- 요청·응답 기록
- 장애 시 수동 검수 전환

## 14. Supabase 보안

- service_role 키를 브라우저에 넣지 않는다.
- publishable key만 회원 프론트에서 사용한다.
- private 스키마를 회원에게 공개하지 않는다.
- KYC·증빙은 private Storage만 사용한다.
- signed URL을 짧게 발급한다.
- 모든 운영자 요청에서 JWT와 역할을 재검증한다.
- 회원은 본인 데이터만 조회한다.
- 금액 변경은 Edge Function·RPC·원장을 사용한다.
- idempotency key를 사용한다.
- 모든 변경은 감사로그를 남긴다.
- CORS를 실제 운영도메인으로 제한한다.

운영자 전체 권한 등록:

~~~sql
insert into private.admin_roles (user_id, role)
values ('운영자_AUTH_UUID', 'super_admin')
on conflict (user_id)
do update set role = excluded.role;
~~~

현재 admin_roles는 사용자당 하나의 역할 구조다. 여러 역할을 동시에 부여하려면 복합키 또는 별도 역할 테이블로 마이그레이션한다.

## 15. Cursor 자동화

현재 CI는 기본 정적 검증만 한다. 다음을 추가한다.

~~~text
.github/workflows/ci.yml
.github/workflows/release.yml
.github/workflows/supabase-deploy.yml
.github/workflows/rollback.yml
scripts/automation/release.mjs
scripts/automation/health-check.mjs
scripts/automation/create-release.mjs
playwright.config.ts
tests/e2e/*
tests/unit/*
tests/a11y/*
lighthouserc.json
~~~

자동 순서:

~~~text
코드 수정
→ 브랜치 생성
→ 의존성 설치
→ 문법 검사
→ 단위테스트
→ E2E 테스트
→ 접근성 검사
→ 성능 검사
→ 보안 검사
→ 커밋
→ 원격 푸시
→ Pull Request
→ CI 통과 대기
→ 자동 병합
→ Supabase migration
→ Edge Function 배포
→ Cloudflare Pages 배포
→ 헬스체크
→ 결과 보고
~~~

단일 명령:

~~~bash
pnpm release:deploy
~~~

변경사항이 없으면 커밋하지 않는다.
테스트 실패 시 푸시하지 않는다.
배포 실패 시 성공으로 보고하지 않는다.

### GitHub Secrets

~~~text
SUPABASE_ACCESS_TOKEN
SUPABASE_PROJECT_REF
SUPABASE_DB_PASSWORD
SUPABASE_SERVICE_ROLE_KEY
PUTDUK_ALLOWED_ORIGINS
CLOUDFLARE_API_TOKEN
CLOUDFLARE_ACCOUNT_ID
CLOUDFLARE_PAGES_PROJECT
~~~

키·비밀번호·KYC 경로를 로그에 출력하지 않는다.

## 16. 자동 배포

Supabase:

~~~text
supabase db push
→ supabase functions deploy admin-control
→ secrets 설정
→ Edge Function ACTIVE 확인
~~~

Cloudflare Pages:

~~~text
Framework preset: None
Production branch: main
Build command: 없음
Output directory: dist
~~~

배포 명령:

~~~bash
pnpm dlx wrangler pages deploy dist --project-name putduk-data-platform
~~~

배포 후 확인:

~~~text
/
 /admin/
 /manifest.webmanifest
 /sw.js
 /favicon.svg
 /icons/icon-180.png
 /icons/icon-192.png
 /icons/icon-512.png
~~~

Supabase Auth:

~~~text
Site URL:
https://운영도메인/

Redirect URLs:
https://운영도메인/
https://운영도메인/admin/
~~~

Edge CORS:

~~~text
PUTDUK_ALLOWED_ORIGINS=https://운영도메인
~~~

## 17. 현재 잠금 플래그

회원 dist:

~~~js
enableWorkApi: true
enableFinanceApi: false
~~~

운영자 dist:

~~~js
enableWorkApi: false
enableFinanceApi: false
~~~

회원 실근무는 열려 있다. 회원 dist의 `enableWorkApi`를 false로 되돌리지 않는다.

`enableFinanceApi`는 KYC/PG 전에 전체 오픈하지 않는다.

## 18. 최종 테스트

회원:

- 회원가입
- 이메일 인증
- 고유번호
- 지원금
- 로그인
- 비밀번호 재설정
- 약관
- 멤버십
- 작업내역
- 입출금내역
- 추천내역
- 밝은 모드
- 다크 모드
- 모바일

업무:

- 업무 카드 공개
- 업무 시작
- 서버 보상 확정
- 서버 타이머
- 차량·비행기·선박·상품 연출
- 화면 이탈
- 화면 복귀
- 업무 제출
- 검수 대기
- 검수 완료
- 지갑 반영
- 알림
- 중복 승인 방지

운영자:

- 운영자 로그인
- 역할 확인
- 회원 목록
- 회원 상세
- 회원 차단
- 협력사 등록
- 자료 승인
- 로고 승인
- 업무 카드 등록
- 업무 카드 공개
- 검수
- 입금 승인
- 출금 승인
- KYC 승인
- 추천 보상
- 지원금 설정
- 특정 회원 알림
- 감사로그

배포:

- pnpm verify
- pnpm test
- pnpm test:e2e
- pnpm test:a11y
- pnpm test:performance
- pnpm security:scan
- pnpm healthcheck
- GitHub Actions 성공
- Supabase 배포 성공
- Edge Function ACTIVE
- Cloudflare HTTPS
- PWA 설치
- 모바일·저사양 테스트
- WebGL 폴백 테스트

## 19. Cursor 최종 보고 형식

~~~text
작업 상태:
변경 파일:
커밋 SHA:
푸시 브랜치:
Pull Request:
CI 결과:
단위테스트:
E2E 테스트:
접근성 검사:
성능 검사:
보안 검사:
Supabase migration:
Edge Function 배포:
Cloudflare 배포:
헬스체크:
실제 완료 기능:
아직 잠긴 기능:
운영자 설정 필요 항목:
실패한 항목:
롤백 여부:
~~~

기능이 구현되지 않았는데 완료됐다고 보고하지 않는다.
현재 저장소의 정적 샘플 데이터는 실제 운영 전 제거하거나 명확히 대체한다.

