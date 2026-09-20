(() => {
  'use strict';

  if (document.documentElement.dataset.mode !== 'member') return;
  if (window.__PUTDUK_WORK_PLAYER_LIFECYCLE_GUARD__) return;
  window.__PUTDUK_WORK_PLAYER_LIFECYCLE_GUARD__ = true;

  const nativeFetch = window.fetch.bind(window);
  let checkpointBusy = false;
  let submitBusy = false;
  let submissionAccepted = false;

  function activePlayer() {
    return Array.from(document.querySelectorAll('.player-backdrop .player-card'))
      .find((card) => !card.closest('[data-modal="review-wait"]')) || null;
  }

  function lifecycleStatus(create = true) {
    const player = activePlayer();
    if (!player) return null;
    let status = player.querySelector('[data-work-lifecycle-status]');
    if (status || !create) return status;
    status = document.createElement('div');
    status.className = 'work-lifecycle-status';
    status.dataset.workLifecycleStatus = '1';
    status.setAttribute('role', 'status');
    status.setAttribute('aria-live', 'polite');
    status.textContent = '입력 내용은 이 기기에 임시 보관돼요. 중간 저장을 누르면 서버에도 저장돼요.';
    const actions = player.querySelector('.player-actions');
    if (actions) actions.before(status);
    else player.appendChild(status);
    return status;
  }

  function setStatus(text, state = 'info') {
    const status = lifecycleStatus(true);
    if (!status) return;
    status.dataset.state = state;
    status.textContent = text;
  }

  function checkpointButtons() {
    return document.querySelectorAll('.player-backdrop [data-action="checkpoint-work"]');
  }

  function submitIsVisiblyBusy() {
    return Array.from(document.querySelectorAll('.player-backdrop [data-action="submit-player"], .player-backdrop .inspect-entry .primary-button, .player-backdrop .catalog-entry .primary-button'))
      .some((button) => button instanceof HTMLButtonElement && button.disabled);
  }

  function syncCheckpointButtons() {
    const shouldDisable = checkpointBusy || submitBusy || submissionAccepted || submitIsVisiblyBusy();
    checkpointButtons().forEach((button) => {
      if (!(button instanceof HTMLButtonElement)) return;
      button.disabled = shouldDisable;
      button.setAttribute('aria-busy', checkpointBusy ? 'true' : 'false');
    });
  }

  function parseWorkAction(input, init) {
    try {
      const url = typeof input === 'string'
        ? input
        : input instanceof URL
          ? input.href
          : String(input?.url || '');
      if (!url.includes('/functions/v1/member-finance')) return '';
      const body = init?.body;
      if (typeof body !== 'string') return '';
      const parsed = JSON.parse(body);
      const action = String(parsed?.action || '');
      return action === 'checkpoint_work' || action === 'submit_work' ? action : '';
    } catch (_) {
      return '';
    }
  }

  function requestStarted(action) {
    if (action === 'checkpoint_work') {
      checkpointBusy = true;
      setStatus('서버에 중간 저장 중…', 'busy');
    }
    if (action === 'submit_work') {
      submitBusy = true;
      submissionAccepted = false;
      setStatus('업무 제출 중… 중복 제출을 막고 있어요.', 'busy');
    }
    syncCheckpointButtons();
  }

  function requestFinished(action, ok) {
    if (action === 'checkpoint_work') {
      checkpointBusy = false;
      setStatus(ok ? '서버에 중간 저장됐어요.' : '중간 저장에 실패했어요. 다시 시도해 주세요.', ok ? 'saved' : 'error');
      syncCheckpointButtons();
      return;
    }

    if (action === 'submit_work') {
      submitBusy = false;
      submissionAccepted = ok;
      if (ok) {
        setStatus('제출이 접수됐어요. 검수 대기 화면으로 전환합니다.', 'saved');
        syncCheckpointButtons();
        return;
      }
      window.setTimeout(() => {
        setStatus('제출이 완료되지 않았어요. 화면 안내를 확인한 뒤 다시 제출해 주세요.', 'error');
        syncCheckpointButtons();
      }, 0);
    }
  }

  window.fetch = async function putdukWorkLifecycleFetch(input, init) {
    const action = parseWorkAction(input, init);
    if (!action) return nativeFetch(input, init);

    requestStarted(action);
    try {
      const response = await nativeFetch(input, init);
      const probe = response.clone();
      void probe.json()
        .then((payload) => requestFinished(action, response.ok && payload?.ok === true))
        .catch(() => requestFinished(action, response.ok));
      return response;
    } catch (error) {
      requestFinished(action, false);
      throw error;
    }
  };

  const observer = new MutationObserver(() => {
    if (!activePlayer()) {
      if (!submitBusy) submissionAccepted = false;
      return;
    }
    lifecycleStatus(true);
    syncCheckpointButtons();
  });

  observer.observe(document.getElementById('app') || document.body, { childList: true, subtree: true });
  lifecycleStatus(true);
  syncCheckpointButtons();

  const style = document.createElement('style');
  style.id = 'putduk-work-player-lifecycle-style';
  style.textContent = `
    .work-lifecycle-status{margin:10px 0 12px;padding:10px 12px;border:1px solid var(--line);border-radius:12px;background:color-mix(in srgb,var(--surface-soft) 72%,transparent);color:var(--muted);font-size:12px;line-height:1.5}
    .work-lifecycle-status[data-state="busy"]{color:var(--text)}
    .work-lifecycle-status[data-state="saved"]{color:var(--emerald-strong);border-color:color-mix(in srgb,var(--emerald) 30%,var(--line));background:color-mix(in srgb,var(--emerald) 7%,var(--surface-soft))}
    .work-lifecycle-status[data-state="error"]{color:var(--danger);border-color:color-mix(in srgb,var(--danger) 30%,var(--line));background:color-mix(in srgb,var(--danger) 6%,var(--surface-soft))}
    .player-backdrop [data-action="checkpoint-work"][aria-busy="true"]{cursor:progress}
  `;
  document.head.appendChild(style);
})();
