# 퍼뜩 Cloudflare 자동화

회원/운영자 정적 사이트는 **Cloudflare Pages** 한 프로젝트입니다. Worker 앱으로 바꾸지 않습니다.

```text
GitHub main
  → CI 품질 확인
  → Supabase 배포 성공
  → Cloudflare Pages 배포
  → 운영 URL 스모크
```

ChatGPT에 Cloudflare MCP가 없어도 GitHub write만 있으면 `main` push가 Pages 배포를 트리거합니다.

## 구조

- 설정: `wrangler.toml` (`pages_build_output_dir = "dist"`)
- 프로젝트 이름: `putduk-data-platform` (GitHub Variable `CLOUDFLARE_PAGES_PROJECT`)
- 회원/운영 분리는 같은 Pages + `functions/_middleware.js` origin 분기입니다. 프로젝트 이름을 새로 만들지 않습니다.
- 운영 도메인: `app.hiptk.app` / `ops.hiptk.app` (기존 custom domain 유지)

## 필요한 값

GitHub Secrets:

- `CLOUDFLARE_API_TOKEN` (Pages Write. Global API Key 사용 금지)
- `CLOUDFLARE_ACCOUNT_ID`

GitHub Variables (비밀 아님):

- `CLOUDFLARE_PAGES_PROJECT`
- `CLOUDFLARE_MEMBER_PROJECT`
- `MEMBER_DOMAIN`
- `OPS_DOMAIN`

토큰 권한은 Pages Write가 최소입니다. DNS/MX/SPF를 일괄 삭제하지 않습니다.

## 배포 흐름

워크플로: `.github/workflows/cloudflare-deploy.yml`

1. Supabase 배포 성공(`workflow_run`) 또는 수동 `workflow_dispatch`
2. Cloudflare Secret preflight
3. `pnpm verify`로 `dist/` 확인
4. 번들에서 service role / payout / API 토큰 패턴 검사
5. `pnpm exec wrangler pages deploy dist --project-name ... --branch main`
6. 회원 `/`, 운영 `/admin/` HTTP 200·HTML·`퍼뜩` 마커 확인

동시 배포 방지: `putduk-cloudflare-production`, `cancel-in-progress: false`

PR/미리보기는 production custom domain을 덮어쓰지 않습니다. production 브랜치는 `main`만 배포합니다.

## Wrangler

CI는 `latest`를 받지 않고 `package.json`의 `wrangler`를 씁니다.

## Custom domain / DNS

이미 붙어 있는 회원·운영 도메인은 그대로 둡니다. 없는 호스트만 추가하고, zone reset·MX/SPF/DKIM/DMARC 삭제는 하지 않습니다.

## Rollback

Pages 배포는 이전 성공 배포를 Cloudflare 대시보드/배포 목록에서 재활성화합니다. Git SHA를 알고 있으면 해당 커밋의 `dist/`로 `wrangler pages deploy`를 다시 실행할 수 있습니다. DB는 이 워크플로가 되돌리지 않습니다.

## 장애 대응

1. Supabase job이 실패하면 Cloudflare job은 시작하지 않습니다.
2. `dist/index.html`이 비어 있으면 배포하지 않습니다.
3. Wrangler가 실패하면 토큰 권한(Pages Write)과 Account ID부터 확인하고, 다른 배포 방식으로 덮어쓰지 않습니다.
4. GitHub Actions가 billing 때문에 시작되지 않으면 로컬 `pnpm cf:bootstrap`, `pnpm cf:verify`로 상태만 검사합니다.
