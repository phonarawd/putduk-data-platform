# 퍼뜩 기술 기준과 이관 순서

## 버전 기준

- 런타임: Node.js 24 LTS, CI 기준 `24.21.0` (로컬에서는 같은 24.x LTS 범위를 허용)
- 패키지 관리자: pnpm `12.4.2`
- 워크스페이스 실행기: Turborepo `2.10.13`
- 웹 앱: Next.js 16 + TypeScript (이관 단계에서 호환되는 안정 버전을 고정)
- 데이터·인증: 기존에 새로 만든 Supabase 프로젝트 하나만 사용
- 배포 1단계: 현재 `dist/`와 이관 후 Next.js 정적 export를 Cloudflare Pages에 배포
- 서버 기능: 잔액·작업·관리자 승인·KYC는 Supabase Edge Functions를 기본 경계로 사용
- 배포 2단계(필요할 때): SSR·Server Actions가 필요해지면 Cloudflare Workers로 분리하고 호환성 점검 후 전환

## 현재 상태

현재 `dist/`는 바로 배포 가능한 회원 화면·관리자 화면 셸이다. 이 파일을 먼저 없애지 않고, `apps/member`, `apps/admin`, `packages/ui`, `packages/contracts`를 추가해 화면과 서버 계약을 순서대로 옮긴다. 따라서 이관 기간에도 Cloudflare에서 접근 가능한 화면이 끊기지 않는다.

## 목표 구조

```text
putduk-data-platform/
├─ apps/
│  ├─ member/             # 회원 가입·노드·작업내역·지갑·PWA
│  └─ admin/              # 관리자 로그인·회원·업무·검수·입출금·감사
├─ packages/
│  ├─ ui/                 # 밝은 모드 기본, 넥서스 모드 선택형 디자인 시스템
│  ├─ contracts/          # 작업·원장·KYC·알림의 공통 타입과 검증 스키마
│  └─ config/             # TypeScript·ESLint·Tailwind 공통 설정
├─ supabase/
│  ├─ migrations/         # RLS·권한·원장 불변성·스토리지 정책
│  └─ seed/               # 운영자가 승인한 초기 설정만
├─ dist/                  # 이관 중 유지하는 Cloudflare 정적 산출물
├─ tooling/scripts/       # 배포 전 자동 확인
├─ pnpm-workspace.yaml
├─ turbo.json
└─ wrangler.toml
```

## 운영 원칙

1. 브라우저에서 잔액·등급·관리자 권한을 직접 바꾸지 않는다. 모든 변경은 인증된 서버 함수와 불변 원장을 거친다.
2. 관리자 화면은 `admin_roles`를 서버에서 확인하고, 모든 민감 조회·승인·차단·비밀번호 재설정은 감사 로그를 남긴다.
3. 작업 타이머는 브라우저 연출이 아니라 서버의 `expected_completed_at`과 이벤트·체크포인트를 기준으로 복원한다.
4. 기업명·로고·업무 카드는 운영자가 협력 확인 자료와 사용 승인을 등록한 경우에만 공개한다.
5. 실제 데이터 원본·업무·보상 근거가 없는 항목은 회원에게 노출하지 않는다. 초기 화면값은 서버 연결 뒤 실데이터로 교체한다.
6. Supabase `public` 노출 테이블과 `private` 민감 테이블 모두 RLS·최소 권한·스토리지 정책을 적용하고, `service_role` 키는 브라우저와 저장소에 넣지 않는다.

## 단계별 이관

1. 이 저장소의 버전 고정·CI·정적 출시 검사를 통과시킨다.
2. 회원 화면을 `apps/member`로 옮기고, 기존 `dist/`와 픽셀 단위로 비교한다.
3. 관리자 화면을 `apps/admin`으로 옮기고 서버 권한 경계를 먼저 붙인다.
4. 공통 UI와 타입·검증 스키마를 패키지로 분리한다.
5. 작업 실행·체크포인트·검수·불변 원장·입출금 요청·KYC·감사 로그를 서버 함수와 RLS에 연결한다.
6. Supabase Auth 리디렉션과 Cloudflare 도메인을 설정한 뒤 모바일·데스크톱·오프라인 복원 시나리오를 점검한다.
7. 기존 `dist/`를 새 정적 export 산출물로 교체하고, CI가 통과할 때만 Cloudflare Pages에 배포한다.

Cloudflare의 현재 안내도 정적 Next.js export는 Pages에, 서버 렌더링·Server Actions·route handler가 필요한 전체 앱은 Workers 경로에 두도록 구분한다. Workers 전환 시에는 호환성 점검을 통과한 뒤에만 진행한다.

## AI 기능 배치

AI는 회원 브라우저가 아니라 인증된 서버 함수에서 선택적으로 사용한다.

- 업무 안내·제출 형식 점검: 민감정보를 제거한 입력만 AI에 보내고, 구조화된 결과·신뢰도·프롬프트 버전을 저장한다.
- 보상·입출금·차단 결정: AI가 단독으로 확정하지 않고 규칙 엔진과 운영자 검수를 거친다.
- 장애·한도 초과: AI 없이도 작업 제출과 운영자 처리가 가능한 폴백을 둔다.
- 키·비용·속도: 공급자 키는 서버 비밀로만 보관하고 회원별 호출 한도·비용 상한·감사 로그를 둔다.
