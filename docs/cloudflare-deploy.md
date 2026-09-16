# 퍼뜩 Cloudflare Pages 배포 안내

## GitHub 연결

- 저장소: `phonarawd/putduk-data-platform`
- 운영 브랜치: `main`
- 프레임워크 preset: `None`
- 빌드 명령: 없음
- 출력 디렉터리: `dist`

저장소의 `wrangler.toml`, `dist/_headers`, `dist/_redirects`가 정적 배포 설정을 포함합니다.

## 도메인 연결 후 확인할 주소

- 회원 화면: `/`
- 운영자 화면: `/admin/`
- PWA 매니페스트: `/manifest.webmanifest`
- 서비스 워커: `/sw.js`
- 파비콘: `/favicon.svg`
- 설치 아이콘: `/icons/icon-180.png`, `/icons/icon-192.png`, `/icons/icon-512.png`

PWA 설치는 HTTPS가 적용된 도메인에서 확인합니다. 아이폰에서는 Safari의 공유 메뉴에서 `홈 화면에 추가`를 선택합니다.

## Supabase 인증 주소

Supabase Auth의 Site URL과 Redirect URLs에 운영 도메인을 등록합니다.

```text
https://운영도메인.example/
https://운영도메인.example/admin/
```

브라우저에는 publishable key만 사용합니다. `service_role` 또는 secret key는 HTML, GitHub, Cloudflare Pages 환경변수에 넣지 않습니다.

## 공개 전 점검

1. 이메일 인증 메일의 발신자와 링크가 운영 도메인으로 열리는지 확인합니다.
2. 운영자 인증과 권한별 서버 API가 연결되었는지 확인합니다.
3. 작업 완료·잔액 변경·입출금 상태가 서버 원장과 일치하는지 확인합니다.
4. KYC 파일 저장소와 운영자 감사 기록의 접근 범위를 확인합니다.
5. 실제 회원 계정으로 회원 화면과 운영자 계정을 각각 점검합니다.
