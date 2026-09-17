import test from 'node:test';
import assert from 'node:assert/strict';
import {
  overlaySurfaceKey,
  overlayBodyToken,
  stampOverlayMarkup,
  overlayPaintPlan,
  shouldPaintBootImmediately,
  REPLAY_LOCK_CUE_AFTER_START,
  WAIT_FOR_SUBMIT_CUT
} from '../../src/ui/overlay-surface.mjs';

test('같은 근무 표면은 키를 유지하고 본문만 바뀐다', () => {
  const state = {
    player: { nodeId: 'dhl', bundle: { current: 2, total: 5 } },
    run: { overlayOpen: true, dbId: 'run-1', nodeId: 'dhl' }
  };
  assert.equal(overlaySurfaceKey(state), 'run:run-1');
  assert.equal(overlayBodyToken(state, {
    nodeById: () => ({ motion: 'inspect' }),
    isCatalogWork: () => false,
    isInspectBundleComplete: () => false
  }), 'inspect:2:5:0');
  assert.equal(REPLAY_LOCK_CUE_AFTER_START, false);
  assert.equal(WAIT_FOR_SUBMIT_CUT, false);
});

test('클래스 목록을 깨지 않고 data-surface를 붙인다', () => {
  const html = '<div class="modal-backdrop player-backdrop"><div class="player-sheet"></div></div>';
  const stamped = stampOverlayMarkup(html, 'run:1', 'inspect:1:5:0');
  assert.match(stamped, /class="modal-backdrop player-backdrop"/);
  assert.match(stamped, /data-surface="run:1"/);
  assert.match(stamped, /data-overlay-body="inspect:1:5:0"/);
});

test('같은 표면은 패치하고 부트는 클라이언트 없을 때만 바로 그린다', () => {
  assert.deepEqual(overlayPaintPlan({
    nextKey: 'run:1',
    existingKey: 'run:1',
    hasExisting: true,
    hasShell: true,
    sameBody: true
  }).action, 'keep-overlay');
  assert.deepEqual(overlayPaintPlan({
    nextKey: 'run:1',
    existingKey: 'run:1',
    hasExisting: true,
    hasShell: true,
    sameBody: false
  }).action, 'patch-overlay');
  assert.equal(overlayPaintPlan({
    nextKey: '',
    existingKey: '',
    hasExisting: false,
    hasShell: true
  }).action, 'patch-shell');
  assert.equal(overlayPaintPlan({
    nextKey: 'modal:auth',
    existingKey: 'run:1',
    hasExisting: true,
    hasShell: true
  }).releaseCanvases, true);
  assert.equal(shouldPaintBootImmediately(true), false);
  assert.equal(shouldPaintBootImmediately(false), true);
});
