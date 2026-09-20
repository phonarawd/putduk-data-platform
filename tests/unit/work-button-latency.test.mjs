import test from 'node:test';
import assert from 'node:assert/strict';
import { readRepo } from '../helpers/repo.mjs';

test('출근·검수·제출 버튼은 서버 응답 전에 바로 바쁘게 바뀐다', async () => {
  const appJs = await readRepo('dist', 'assets', 'app.js');
  const startBlock = appJs.slice(
    appJs.indexOf('async function confirmStartWork()'),
    appJs.indexOf('function openResultScene')
  );
  const submitBlock = appJs.slice(
    appJs.indexOf('async function submitPlayer()'),
    appJs.indexOf('function tickRun()')
  );
  const finishBlock = appJs.slice(
    appJs.indexOf('async function finishRun('),
    appJs.indexOf('function bindAuxMotion()')
  );
  const inspectBlock = appJs.slice(
    appJs.indexOf('function confirmInspectLabel()'),
    appJs.indexOf('async function submitSignup(')
  );
  const paintBlock = appJs.slice(
    appJs.indexOf('function finishPaint('),
    appJs.indexOf('function render()')
  );

  assert.match(startBlock, /setWorkActionBusy\(true, '출근하는 중…'\)/);
  assert.match(startBlock, /void refreshWorkSideState\(\)/);
  assert.match(startBlock, /render\(\);\s*runFrame = requestAnimationFrame\(tickRun\);\s*void refreshWorkSideState\(\)/);
  assert.doesNotMatch(startBlock, /await refreshMemberWallet\(\)/);
  assert.doesNotMatch(startBlock, /await memberFinanceRequest\('daily_task_quota'\)/);

  assert.match(submitBlock, /setWorkActionBusy\(true, '제출하는 중…'\)/);
  assert.match(inspectBlock, /setWorkActionBusy\(true, '확인하는 중…'\)/);
  assert.match(finishBlock, /scheduleSubmitRetry/);
  assert.match(appJs, /제출 준비 중…/);
  assert.match(paintBlock, /if \(!isLiveWorkOverlay\(\)\)/);
});
