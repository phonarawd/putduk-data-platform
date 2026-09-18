# Cloudflare 운영 자동화

## 운영 기본 경로

PUTDUK 프론트 운영 배포는 **Cloudflare Pages Git Integration**이 담당합니다.

- Pages project: `putduk-git-preview`
- GitHub repository: `phonarawd/putduk-data-platform`
- Production branch: `main`
- Build output: `dist`

GitHub Actions로 Cloudflare를 배포하지 않습니다. `main` push를 Cloudflare Pages가 직접 감지해 production 배포합니다.

## 운영 도메인

- `https://app.hiptk.app`
- `https://ops.hiptk.app` (`/admin/` 운영자 화면)
- `https://go.hiptk.app`
- `https://www.hiptk.app`
- `https://hiptk.app`

예전 Direct Upload 프로젝트 `putduk-data-platform`은 롤백 참고용으로 남아 있으며 운영 custom domain은 연결하지 않습니다.

## 정상 릴리스 순서

백엔드 변경이 있을 때:

1. Supabase MCP/CLI Path A 적용
2. Migration/Edge/integrity/security 검증
3. 릴리스 사전검증
4. GitHub `main` push
5. Cloudflare Pages Git Integration 자동 production deploy
6. `pnpm cf:verify` 또는 외부 HTTP smoke test

프론트 전용 변경일 때:

1. 릴리스 사전검증
2. `main` push
3. Cloudflare 자동배포
4. 운영 URL 검증

## 검증

`pnpm cf:verify`는 로컬 `dist` 산출물과 운영 회원/운영자 URL을 확인하고, 알려진 Secret 이름이 번들에 포함되지 않았는지 검사합니다.

## 금지

- GitHub Actions를 Cloudflare production 필수 경로로 만들지 않음
- 기존 MX/SPF/DKIM/Resend TXT 임의 수정 금지
- 운영 custom domain을 예전 Direct Upload 프로젝트로 임의 복귀 금지
- FOMO/실시간 연출 로직 수정 금지

## 롤백

Cloudflare 배포 이상 시 새 변경을 무작정 덮어쓰지 말고, 마지막 정상 Git commit을 기준으로 forward-fix 또는 명시적 revert를 수행합니다. DNS/MX/TXT 레코드는 프론트 롤백과 별개로 보존합니다.
