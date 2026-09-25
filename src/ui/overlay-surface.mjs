// 같은 오버레이는 #app 전체를 갈아끼우지 않고 data-surface로 유지한다.
// 근무 시트는 CSS fade를 쓰지 않는다. 부트는 인증을 기다리지 않고 바로 그린다.

export const REPLAY_LOCK_CUE_AFTER_START = false;
export const WAIT_FOR_SUBMIT_CUT = false;

export const OVERLAY_SURFACE_CSS = `.modal-backdrop[data-stable="1"],
.modal-backdrop[data-stable="1"] .modal,
.player-backdrop,
.player-backdrop .player-sheet { animation: none; }`;

function defaultIsCatalogWork(node) {
  const motion = String(node?.motion || node?.motion_profile || node?.motionProfile || '');
  return motion.includes('catalog');
}

export function overlaySurfaceKey(state = {}) {
  if (state.player && state.run?.overlayOpen) {
    return `run:${state.run.dbId || state.run.id || state.player.nodeId || 'active'}`;
  }
  if (state.resultScene) return `result:${state.resultScene.nodeId || ''}:${state.resultScene.cut || 'next'}`;
  if (state.reviewWait?.overlayOpen) {
    return `review:${state.reviewWait.dbId || state.reviewWait.id || 'wait'}`;
  }
  if (state.startNodeId) return `start:${state.startNodeId}`;
  if (state.onboardingStep) return `onboard:${state.onboardingStep}`;
  if (state.modal) return `modal:${state.modal}`;
  return '';
}

export function overlayBodyToken(state = {}, helpers = {}) {
  const key = overlaySurfaceKey(state);
  const isCatalog = helpers.isCatalogWork || defaultIsCatalogWork;
  const nodeById = typeof helpers.nodeById === 'function' ? helpers.nodeById : () => null;
  const isInspectComplete = typeof helpers.isInspectBundleComplete === 'function'
    ? helpers.isInspectBundleComplete
    : () => false;

  if (key.startsWith('run:')) {
    const node = nodeById(state.player?.nodeId || state.run?.nodeId);
    if (isCatalog(node)) return 'catalog';
    const bundle = state.player?.bundle;
    return `inspect:${Number(bundle?.current || 0)}:${Number(bundle?.total || 0)}:${isInspectComplete(bundle) ? 1 : 0}`;
  }
  if (key === 'modal:auth') return String(state.authMode || 'signup');
  if (key === 'modal:deposit') {
    const list = Array.isArray(state.depositDestinations) ? state.depositDestinations : [];
    const revealed = Array.isArray(state.depositReveal) ? state.depositReveal.length : 0;
    return `${list.length}:${state.depositPinSet ? 1 : 0}:${revealed}:${state.depositDestinationsError ? 1 : 0}:${state.depositPresetAmount || ''}:${state.depositMethod || ''}`;
  }
  if (key === 'modal:pin-settings') {
    return `${state.depositPinSet ? 1 : 0}:${state.depositPinLocked ? 1 : 0}:${state.depositDestinationsError ? 1 : 0}:${state.withdrawalPinSet ? 1 : 0}:${state.withdrawalPinLocked ? 1 : 0}:${state.withdrawalPinError ? 1 : 0}`;
  }
  if (key.startsWith('review:')) return String(state.reviewWait?.status || '');
  if (key === 'modal:member-detail') {
    return String(state.modalPayload?.id || state.adminMemberDetail?.id || '');
  }
  if (key === 'modal:balance-adjust') {
    const preset = state.modalPayload || {};
    const phase = preset.confirmAmount != null ? 'confirm' : 'entry';
    return `${phase}:${preset.user_id || preset.id || ''}:${preset.amount ?? ''}:${preset.bucket || ''}:${preset.confirmAmount ?? ''}`;
  }
  if (key === 'modal:notifications') {
    const rows = Array.isArray(state.notifications) ? state.notifications : [];
    const unread = rows.filter((item) => item && !item.read).length;
    const digest = rows.slice(0, 16).map((item) => `${item?.id || ''}:${item?.read ? 1 : 0}`).join('|');
    return `${unread}:${rows.length}:${digest}`;
  }
  return key;
}

export function escapeOverlayAttr(value) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/"/g, '&quot;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

export function stampOverlayMarkup(html, key, body, escapeHtml = escapeOverlayAttr) {
  if (!html || !key) return html || '';
  const safeKey = escapeHtml(key);
  const safeBody = escapeHtml(body);
  return String(html).replace(
    /<div class="modal-backdrop([^"]*)"/,
    `<div class="modal-backdrop$1" data-surface="${safeKey}" data-overlay-body="${safeBody}"`
  );
}

export function overlayPaintPlan(input = {}) {
  const nextKey = String(input.nextKey || '');
  const existingKey = String(input.existingKey || '');
  const hasExisting = Boolean(input.hasExisting);
  const hasShell = Boolean(input.hasShell);
  const sameBody = input.sameBody !== false;
  const memberDetailReuse = Boolean(input.memberDetailReuse);
  const notificationsModalReuse = Boolean(input.notificationsModalReuse);

  if (memberDetailReuse) {
    return { action: 'patch-member-detail', replayMotion: false, rebindOverlayUi: false, releaseCanvases: false };
  }
  if (notificationsModalReuse) {
    return { action: 'patch-notifications', replayMotion: false, rebindOverlayUi: false, releaseCanvases: false };
  }
  if (nextKey && hasExisting && existingKey === nextKey) {
    return {
      action: sameBody ? 'keep-overlay' : 'patch-overlay',
      replayMotion: false,
      rebindOverlayUi: !sameBody,
      releaseCanvases: false
    };
  }
  if (!nextKey && !hasExisting && hasShell) {
    return { action: 'patch-shell', replayMotion: false, rebindOverlayUi: false, releaseCanvases: false };
  }
  return {
    action: 'full-replace',
    replayMotion: true,
    rebindOverlayUi: true,
    releaseCanvases: Boolean(existingKey && existingKey !== nextKey)
  };
}

export function shouldPaintBootImmediately(_hasSupabaseClient) {
  return true;
}
