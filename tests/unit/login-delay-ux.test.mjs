import test from 'node:test';
import assert from 'node:assert/strict';
import { readRepo } from '../helpers/repo.mjs';

test('로그인 클릭은 즉시 busy 피드백으로 잠기고 완료 후 복원된다', async () => {
  const appJs = await readRepo('dist', 'assets', 'app-ia13.js');

  assert.match(appJs, /function setLoginBusy\(form, busy\)/);
  assert.match(appJs, /form\.dataset\.putdukLoginBusy = busy \? '1' : '0'/);
  assert.match(appJs, /button\.textContent = '로그인 중…'/);
  assert.match(appJs, /if \(form\.dataset\.putdukLoginBusy === '1'\) return;/);
  assert.match(appJs, /button\.dataset\.putdukIdleLabel \|\| '로그인'/);
});

test('로그인 실패·세션 없음은 즉시 busy를 해제해 재시도할 수 있다', async () => {
  const appJs = await readRepo('dist', 'assets', 'app-ia13.js');

  const submitBlock = appJs.slice(
    appJs.indexOf('async function submitLogin'),
    appJs.indexOf('function handleClick')
  );
  assert.ok(submitBlock.length > 100);
  assert.match(submitBlock, /if \(result\.error\) \{\s*setLoginBusy\(form, false\);/);
  assert.match(submitBlock, /if \(!data\?\.session\) \{\s*setLoginBusy\(form, false\);/);
  assert.match(submitBlock, /catch \(error\) \{\s*setLoginBusy\(form, false\);/);
});

test('로그인 성공은 모달을 즉시 닫고 하이드레이션 동안 중립 오버레이를 띄운다', async () => {
  const appJs = await readRepo('dist', 'assets', 'app-ia13.js');
  const css = await readRepo('dist', 'assets', 'app.css');

  assert.match(appJs, /function showLoginTransitionOverlay\(show\)/);
  assert.match(appJs, /putdukLoginTransition/);
  assert.match(appJs, /showLoginTransitionOverlay\(true\)/);
  assert.match(appJs, /void hydrateSession\(data\.session\)\.finally\(\(\) => \{/);
  assert.match(appJs, /showLoginTransitionOverlay\(false\)/);
  assert.match(appJs, /내 업무와 지갑을 안전하게 불러오고 있어요\./);
  assert.match(css, /#putdukLoginTransition\{/);
  assert.match(css, /place-content:center/);
});

test('하이드레이션 완료 후 기존 온보딩·렌더·뷰포트 정리 흐름을 그대로 탄다', async () => {
  const appJs = await readRepo('dist', 'assets', 'app-ia13.js');

  const submitBlock = appJs.slice(
    appJs.indexOf('async function submitLogin'),
    appJs.indexOf('function handleClick')
  );
  assert.match(submitBlock, /queueOnboarding\(\);/);
  assert.match(submitBlock, /settleMobileViewportAfterAuth\(\);/);
  assert.match(submitBlock, /syncMemberPush\(data\.session, \{ prompt: true \}\);/);
  assert.match(submitBlock, /await runAdminAuthorization\(\{ toast: true \}\);/);
});

test('기존 auth 계약은 그대로 유지한다', async () => {
  const appJs = await readRepo('dist', 'assets', 'app-ia13.js');

  // 오류 분류와 inline feedback 경로 유지
  assert.match(appJs, /function loginErrorMessage\(error\)/);
  assert.match(appJs, /function setLoginFeedback\(message\)/);
  assert.match(appJs, /signInWithPassword\(\{ email, password \}\)/);
  // 세션 하이드레이션·온보딩·모바일 뷰포트 함수 유지
  assert.match(appJs, /async function hydrateSession\(session, options = \{\}\)/);
  assert.match(appJs, /signedOutLock = false;/);
  assert.match(appJs, /function settleMobileViewportAfterAuth\(\)/);
  // 로그인 모달 규격 요소 유지
  assert.match(appJs, /data-auth-feedback/);
  assert.match(appJs, /autocomplete="current-password"/);
});

test('로그인 딜레이 UX는 FOMO·봇 보호 설정을 수정하지 않는다', async () => {
  const appJs = await readRepo('dist', 'assets', 'app-ia13.js');
  const css = await readRepo('dist', 'assets', 'app.css');
  for (const protectedName of ['bot_enabled', 'crowd_min', 'crowd_max', 'burn_per_minute', 'crew_pulse', 'FOMO_ACTIONS']) {
    const before = appJs.split(protectedName).length - 1;
    assert.ok(before >= 0, `app-ia13.js에서 ${protectedName} 확인 실패`);
  }
  assert.doesNotMatch(css, /bot_enabled|crowd_min|crowd_max|burn_per_minute|crew_pulse/);
});
