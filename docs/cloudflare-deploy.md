# 퍼뜩 Cloudflare Pages 배포 안내

## GitHub 연결

- 저장소: `phonarawd/putduk-data-platform`
- 운영 브랜치: `main`
- 프레임워크 preset: `None`
- 빌드 명령: 없음
- 출력 디렉터리: `dist`

저장소의 `wrangler.toml`, `dist/_headers`, `dist/_redirects`가 정적 배포 설정을 포함합니다.

회원 화면과 운영자 화면은 정적 Pages에서 제공하고, 권한·검수·보상처럼 비밀 키가 필요한 변경은 Supabase Edge Functions에서 처리합니다. 현재 업무 검수 경로는 `/functions/v1/admin-control`의 `list_reviews`와 `review_task` 액션으로 연결되어 있습니다.

## 도메인 연결 후 확인할 주소

회원 화면과 운영자 화면은 **서로 다른 origin**으로 연다. 같은 주소의 `/`와 `/admin/`을 같이 쓰면 브라우저 Auth 세션이 섞인다.

- 회원 화면: `https://app.hiptk.app/` 또는 `https://hiptk.app/`
- 운영자 화면: `https://ops.hiptk.app/admin/`
- 로컬: 회원 `http://127.0.0.1:4173/` , 운영자 `http://127.0.0.1:4174/admin/`
- PWA 매니페스트: `/manifest.webmanifest`
- 서비스 워커: `/sw.js`
- 파비콘: `/favicon.svg`
- 설치 아이콘: `/icons/icon-180.png`, `/icons/icon-192.png`, `/icons/icon-512.png`

PWA 설치는 HTTPS가 적용된 도메인에서 확인합니다. iPhone·iPad에서는 Safari의 공유 메뉴에서 **홈 화면에 추가**를 선택합니다.

## Supabase 인증 주소

Supabase Auth의 Site URL과 Redirect URLs에 운영 도메인을 등록합니다.

```text
https://app.hiptk.app/
https://ops.hiptk.app/admin/
http://127.0.0.1:4173/
http://127.0.0.1:4174/admin/
```

브라우저에는 publishable key만 사용합니다. `service_role` 또는 secret key는 HTML, GitHub, Cloudflare Pages 환경변수에 넣지 않습니다.

## 배포 전 확인

0. **app origin과 ops origin이 실제로 다른 호스트인지** 브라우저 주소창과 HTML `<title>`로 확인합니다. `app.hiptk.app`은 회원(`퍼뜩 · 라인 근무`), `ops.hiptk.app`은 운영자(`퍼뜩 · 운영자 관리센터`)여야 합니다. 같은 셸이 두 호스트에 올라가면 배포하지 않습니다.

1. 이메일 인증 메일의 발신자와 리디렉션 주소를 확인합니다.
2. 운영자 Auth 계정을 만들고 `private.admin_roles`에 역할을 등록합니다.
3. 협력 자료·로고를 승인하고 공개 업무 카드를 하나 이상 등록합니다.
4. 실제 회원 계정으로 업무 시작 → 완료 제출 → 운영자 검수 완료 → 회원 검수 완료·지갑·알림 반영을 확인합니다.
5. 화면을 닫고 복귀했을 때 서버 시각 기준으로 작업이 복원되는지 확인합니다.
6. KYC·입출금·추천 보상 API를 연결하기 전에는 관련 UI에서 잔액을 변경하지 않는지 확인합니다.

## Next.js 이관 후 Pages 설정

- 루트 디렉터리: 저장소 루트
- 빌드 명령: `corepack pnpm@12.4.2 build`
- 출력 디렉터리: 이관 단계에서 고정한 정적 export 경로
- 서버 비밀: Pages 환경변수와 정적 번들에 `service_role` 키를 넣지 않음
