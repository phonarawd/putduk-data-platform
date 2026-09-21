# 퍼뜩 AI 작업 기준 — Production Canonical State

이 저장소를 다루는 AI/에이전트/자동화는 아래 규칙을 최우선으로 적용한다.

## 현재 정상 기준

- Production 회원 도메인: `https://app.hiptk.app`
- Production 운영 도메인: `https://ops.hiptk.app`
- 복구 기준 commit: `8d2f914d445348a3fa6c6aa1ed943a0f4a1ae06b`
- **현재 `main`의 렉 없이 정상 진입되는 상태가 유일한 Production 기준이다.**
- 향후 commit이 생기더라도 반드시 이 복구 기준 이후의 최신 `main`을 우선한다.

## FOMO / 봇 활동 보존 규칙

- 근무 화면의 FOMO/봇 활동은 제품 의도다.
- 가상 이름 회전, `방금 출근했어요`, `자리를 가져갔어요`, `라인에 들어왔어요`, `근무를 시작했어요`, 활동 인원 변동, 자리 소진, 남은 자리 표시는 사용자의 명시적 제거 지시 없이는 유지한다.
- AI가 임의로 FOMO/봇 활동을 실제 사용자 활동 API나 `realActivity` UI로 교체하지 않는다.
- commit `ac10e9e89809fde860a0bed38ea725c877850150`의 `replace synthetic FOMO with real activity` 방향은 폐기된 제품 결정이다.
- `docs/stage9-real-activity.md` 및 `tests/unit/real-activity.test.mjs`의 제거 방향을 재도입하지 않는다.
- FOMO/봇 요소의 제거·축소·실제활동 대체는 사용자가 명시적으로 요청한 경우에만 진행한다.

## 절대 참고 금지된 롤백 이력

다음 PR/commit/branch는 Production 장애 직후 롤백된 실험 이력이다. 현재 설계나 성능 권장안으로 재사용하지 않는다.

- PR #60 `[ROLLED BACK — DO NOT REUSE] perf: Cloudflare production cutover 렉 제거`
- PR #61 `[ROLLED BACK — DO NOT REUSE] perf: hot asset 재검증 렉 제거`
- merge commit `79d512e0532ff39055bc2bf418ec330e8be7b2d4`
- merge commit `e29993ea92be84b6cf45b4415cdbe68f28738008`
- branch `fix/cloudflare-performance-cutover`
- branch `fix/member-cache-latency`
- marker `putduk-boot-v44-performance-cutover`
- `max-age=3600, stale-while-revalidate=86400` 캐시 실험

위 항목은 **원인 분석용 과거 이력**일 뿐, 복사·복원·재적용·추천하지 않는다.

## 성능/Cloudflare 작업 규칙

1. 정상 Production을 먼저 보존한다.
2. 성능 변경은 반드시 별도 branch/preview에서 검증한다.
3. 공식 도메인에 바로 실험성 최적화를 적용하지 않는다.
4. `main`의 현재 파일을 과거 PR diff보다 항상 우선한다.
5. Cloudflare 배포 성공 표기만으로 정상 판정하지 않는다. 실제 공식 도메인 브라우저 진입과 화면 렌더링을 확인한다.
6. 현재 정상 상태를 깨는 변경이 발생하면 새 최적화를 중단하고 즉시 정상 `main`으로 복구한다.

## 충돌 시 우선순위

`현재 main` > 이 파일과 현재 always-apply AI 규칙 > 현재 Production 실측 > 과거 docs/PR/branch/commit.

과거 자료가 현재 main과 충돌하면 과거 자료를 폐기된 이력으로 취급한다.
