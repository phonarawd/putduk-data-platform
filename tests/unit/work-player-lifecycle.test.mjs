import test from 'node:test';
import assert from 'node:assert/strict';
import { readRepo } from '../helpers/repo.mjs';

test('5건 검수와 서버 제출·검수 대기 전환 계약이 앱에 유지된다', async () => {
  const app = await readRepo('dist', 'assets', 'app.js');

  assert.match(app, /const INSPECT_TOTAL = 5/);
  assert.match(app, /inspect_answers: bundle\.answers\.slice\(0, INSPECT_TOTAL\)/);
  assert.match(app, /if \(state\.run\?\._submitting \|\| state\.run\?\._submitWaiting\) return/);
  assert.match(app, /state\.reviewWait = \{/);
  assert.match(app, /state\.run = null/);
  assert.match(app, /state\.player = null/);
});

test('중간 저장은 checkpoint_work 서버 경로를 사용하고 복원 payload를 읽는다', async () => {
  const app = await readRepo('dist', 'assets', 'app.js');

  assert.match(app, /memberFinanceRequest\('checkpoint_work'/);
  assert.match(app, /checkpoint_key', 'work-draft'/);
  assert.match(app, /checkpoint_payload/);
  assert.match(app, /draft\.answers\.slice\(0, INSPECT_TOTAL\)/);
});

test('player lifecycle guard는 checkpoint와 submit 요청을 분리 추적한다', async () => {
  const guard = await readRepo('dist', 'assets', 'work-player-lifecycle-guard.js');

  assert.match(guard, /action === 'checkpoint_work' \|\| action === 'submit_work'/);
  assert.match(guard, /checkpointBusy \|\| submitBusy \|\| submissionAccepted/);
  assert.match(guard, /서버에 중간 저장 중/);
  assert.match(guard, /서버에 중간 저장됐어요/);
  assert.match(guard, /업무 제출 중… 중복 제출을 막고 있어요/);
  assert.match(guard, /제출이 접수됐어요\. 검수 대기 화면으로 전환합니다/);
});

test('제출 중에는 중간 저장 버튼을 비활성화하고 실패 시에만 다시 열 수 있다', async () => {
  const guard = await readRepo('dist', 'assets', 'work-player-lifecycle-guard.js');

  assert.match(guard, /button\.disabled = shouldDisable/);
  assert.match(guard, /submitBusy = true/);
  assert.match(guard, /submissionAccepted = ok/);
  assert.match(guard, /window\.setTimeout\(\(\) => \{/);
  assert.match(guard, /syncCheckpointButtons\(\)/);
});

test('guard는 응답 body를 소비하지 않고 clone으로 성공 여부를 확인한다', async () => {
  const guard = await readRepo('dist', 'assets', 'work-player-lifecycle-guard.js');

  assert.match(guard, /const probe = response\.clone\(\)/);
  assert.match(guard, /void probe\.json\(\)/);
  assert.match(guard, /return response/);
});

test('player lifecycle guard는 FOMO·봇 보호 설정을 수정하지 않는다', async () => {
  const guard = await readRepo('dist', 'assets', 'work-player-lifecycle-guard.js');
  for (const protectedName of ['bot_enabled', 'crowd_min', 'crowd_max', 'burn_per_minute', 'crew_pulse', 'FOMO_ACTIONS']) {
    assert.doesNotMatch(guard, new RegExp(protectedName));
  }
});
