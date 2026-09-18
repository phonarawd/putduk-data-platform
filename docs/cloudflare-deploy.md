# 퍼뜩 Cloudflare Pages 운영 배포 기준

## Production 연결

- Pages project: `putduk-git-preview`
- Repository: `phonarawd/putduk-data-platform`
- Production branch: `main`
- Framework preset: `None`
- Build command: 없음
- Output directory: `dist`

Cloudflare Pages Git Integration이 `main` push를 직접 감지해 production 배포한다.

GitHub Actions 또는 `wrangler pages deploy`는 production 필수 경로가 아니다.

예전 Direct Upload 프로젝트 `putduk-data-platform`은 롤백 참고용으로 보존하되 운영 custom domain은 연결하지 않는다.

## 운영 도메인

- 회원: `https://app.hiptk.app/`
- 운영자: `https://ops.hiptk.app/admin/`
- 루트: `https://hiptk.app/`
- www: `https://www.hiptk.app/`
- go: `https://go.hiptk.app/`

`app.hiptk.app/admin/`은 운영자 origin으로 보내는 리디렉션 정책을 유지한다.

회원과 운영자는 서로 다른 origin을 사용해 브라우저 세션·권한 경계를 명확히 한다.

## 배포 순서

프론트 전용 변경:

```text
작업 브랜치 검증
→ main 반영
→ Cloudflare Git Integration 자동배포
→ 운영 URL smoke test
```

백엔드 포함 변경:

```text
Supabase MCP/CLI Path A 적용
→ migration/Edge/integrity/security 검증
→ main 반영
→ Cloudflare Git Integration 자동배포
→ 운영 URL smoke test
```

## 정적 산출물

운영에 필요한 기본 파일:

```text
dist/index.html
dist/admin/index.html
dist/_headers
dist/_redirects
dist/assets/*
dist/manifest.webmanifest
dist/sw.js
dist/favicon.svg
dist/icons/icon-180.png
dist/icons/icon-192.png
dist/icons/icon-512.png
```

## 배포 후 검증

반드시 실제 production URL로 확인한다.

1. `app.hiptk.app` HTTP 200 및 회원 title/본문 확인
2. `ops.hiptk.app/admin/` HTTP 200 및 운영자 title/본문 확인
3. 회원 origin의 `/admin/` 리디렉션 확인
4. PWA manifest/service worker/icon 응답 확인
5. 정적 번들 Secret leak scan
6. 변경 기능의 실제 서버 state와 UI 일치 확인

`pnpm cf:verify` 또는 동등한 외부 HTTP smoke test를 사용한다.

## Supabase Auth 주소

운영 Auth redirect는 실제 production origin을 기준으로 유지한다.

```text
https://app.hiptk.app/
https://ops.hiptk.app/admin/
```

로컬 개발 URL은 개발 환경에서만 사용한다.

브라우저에는 publishable key만 사용한다. service role 또는 secret key는 정적 HTML/JS/Cloudflare Pages client bundle에 넣지 않는다.

## DNS 보호

프론트 배포나 롤백 과정에서 다음 레코드를 임의 수정하지 않는다.

- MX
- SPF
- DKIM
- Resend TXT

custom domain을 예전 Direct Upload 프로젝트로 임의 복귀시키지 않는다.

## 롤백

배포 이상 시 DNS를 흔들지 않는다.

```text
마지막 정상 Git commit 확인
→ 명시적 revert 또는 forward-fix
→ main 반영
→ Git Integration 재배포
→ smoke test
```

## FOMO 보호

Cloudflare/정적 배포 정리 과정에서 FOMO/live simulation 코드를 수정하지 않는다. 관련 diff는 0이어야 한다.
