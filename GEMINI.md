# Gemini 작업 기준

이 저장소에서는 **현재 `main`의 렉 없이 정상 동작하는 Production 상태만 정답으로 취급**한다.

## Canonical Production

- 회원: `https://app.hiptk.app`
- 운영: `https://ops.hiptk.app`
- 복구 기준 commit: `8d2f914d445348a3fa6c6aa1ed943a0f4a1ae06b`
- 이 commit 이후 최신 `main`이 항상 우선한다.

## 폐기된 변경 — 참고/재사용 금지

다음은 Production 장애 직후 롤백된 실험이다.

- PR #60
- PR #61
- commit `79d512e0532ff39055bc2bf418ec330e8be7b2d4`
- commit `e29993ea92be84b6cf45b4415cdbe68f28738008`
- branch `fix/cloudflare-performance-cutover`
- branch `fix/member-cache-latency`
- `putduk-boot-v44-performance-cutover`
- `max-age=3600, stale-while-revalidate=86400` 변경

이 항목들을 현재 성능 최적화 정답, Cloudflare 권장 설정, UI 기준, 복구 기준으로 사용하지 않는다.

## 작업 원칙

- 과거 PR diff보다 현재 `main` 파일을 우선한다.
- 성능/Cloudflare 변경은 공식 도메인에 바로 적용하지 말고 preview에서 먼저 검증한다.
- Cloudflare가 `Deployed successfully`라고 표시해도 실제 `app.hiptk.app` / `ops.hiptk.app` 브라우저 진입을 확인하기 전에는 정상 배포로 결론내리지 않는다.
- 현재 정상 화면과 충돌하는 과거 화면/코드는 폐기된 이력이다.
- 추가 지침은 루트 `AGENTS.md`를 따른다.
