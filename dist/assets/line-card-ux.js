(() => {
  'use strict';

  if (document.documentElement.dataset.mode !== 'member') return;

  const app = document.getElementById('app');
  if (!app) return;

  const PAGE_COPY = '체험은 지원금을 사용하고, 일반 업무는 업무 잔액을 잠급니다. 필요한 금액·승인 시 수당·예상 소요를 비교해 보세요.';
  const FILTER_HINTS = new Map([
    ['오늘 열린 라인을 모두 봐요.', '현재 공개된 업무를 모두 봅니다.'],
    ['짧은 시간 칸이에요. 처음 출근하기 좋아요.', '체험·소액 업무가 포함된 짧은 확인 업무입니다.'],
    ['기본 근무 칸이에요. 잠금과 수당을 보고 골라요.', '중간 금액대 업무입니다. 필요한 업무 잔액과 승인 시 수당을 확인하세요.'],
    ['조금 더 오래 보는 칸이에요.', '고액 업무입니다. 필요한 업무 잔액과 예상 소요를 먼저 확인하세요.'],
    ['검수가 촘촘한 칸이에요. 잠금이 더 커요.', '초고액 업무는 운영자 배정이 필요한 경우에만 표시됩니다.']
  ]);

  function setText(element, text) {
    if (!(element instanceof Element)) return;
    if (String(element.textContent || '').trim() === text) return;
    element.textContent = text;
  }

  function extractAmount(text) {
    return String(text || '')
      .replace(/^(지원금 잠금|근무 보증|업무 시작 금액|체험 지원금 사용|필요 업무 잔액|수당|예상 수당|승인 시 수당)\s*/, '')
      .trim();
  }

  function currentUserId() {
    try {
      const supabaseUrl = String(window.PUTDUK_CONFIG?.supabaseUrl || '');
      if (!supabaseUrl) return '';
      const projectRef = new URL(supabaseUrl).hostname.split('.')[0];
      if (!projectRef) return '';
      const raw = localStorage.getItem(`sb-${projectRef}-auth-token`);
      if (!raw) return '';
      const parsed = JSON.parse(raw);
      return String(
        parsed?.user?.id
        || parsed?.currentSession?.user?.id
        || parsed?.session?.user?.id
        || ''
      );
    } catch (_) {
      return '';
    }
  }

  function hasPersistedActiveRun() {
    const userId = currentUserId();
    if (!userId) return false;
    try {
      const raw = localStorage.getItem(`putduk-state-v2:${userId}`);
      if (!raw) return false;
      const parsed = JSON.parse(raw);
      return Boolean(parsed?.run && parsed.run.nodeId);
    } catch (_) {
      return false;
    }
  }

  function fundingSource(card) {
    const stored = card.dataset.putdukFundingSource;
    if (stored === 'support' || stored === 'work') return stored;

    const first = card.querySelector('.node-money .money-line span');
    const text = String(first?.textContent || '').trim();
    let source = null;
    if (text.startsWith('지원금 잠금') || text.startsWith('체험 지원금 사용')) source = 'support';
    if (text.startsWith('근무 보증') || text.startsWith('필요 업무 잔액')) source = 'work';
    if (!source) return null;

    card.dataset.putdukFundingSource = source;
    return source;
  }

  function actionState(button, source) {
    const stored = button.dataset.putdukCardAction;
    if (stored) return stored;

    const text = String(button.textContent || '').trim();
    let state = '';
    if (text === '출근하기' || text === '업무 시작') state = 'ready';
    else if (text === '검수 대기 중') state = 'review';
    else if (text === '대기 중') state = 'waiting';
    else if (text === '입금 안내' || text === '시작 조건 확인' || text === '입금 안내 보기') {
      state = hasPersistedActiveRun()
        ? 'active-run'
        : source === 'support' ? 'support-missing' : 'insufficient';
    }
    if (!state) return '';

    button.dataset.putdukCardAction = state;
    return state;
  }

  function ensureStateBadge(card, state) {
    const top = card.querySelector('.node-top');
    if (!top) return;
    let badge = top.querySelector('[data-putduk-card-state]');
    if (!badge) {
      badge = document.createElement('span');
      badge.className = 'line-card-state';
      badge.dataset.putdukCardState = '1';
      top.appendChild(badge);
    }

    const labels = {
      ready: '시작 가능',
      insufficient: '업무 잔액 부족',
      'support-missing': '체험 지원금 없음',
      'active-run': '업무 진행 중',
      review: '검수 대기',
      waiting: '대기 중'
    };
    badge.dataset.state = state || 'waiting';
    setText(badge, labels[state] || '조건 확인');
  }

  function ensureContract(card, source) {
    let contract = card.querySelector('[data-putduk-line-contract]');
    if (!contract) {
      contract = document.createElement('div');
      contract.className = 'line-card-contract';
      contract.dataset.putdukLineContract = '1';
      card.querySelector('.node-bottom')?.before(contract);
    }

    if (contract.dataset.kind === source) return;
    contract.dataset.kind = source;
    if (source === 'support') {
      contract.innerHTML = '<strong>체험</strong><span>지원금 자체는 출금되지 않아요 · 승인 시 수당만 출금 가능</span>';
    } else {
      contract.innerHTML = '<strong>일반</strong><span>업무 잔액에서 잠금 · 승인/반려 처리 시 원금은 업무 잔액으로 복귀</span>';
    }
  }

  function enhanceCard(card) {
    if (!(card instanceof Element) || !card.matches('.node-card')) return;

    const source = fundingSource(card);
    if (!source) return;

    card.dataset.putdukCardContract = 'funding-v1';

    const moneySpans = card.querySelectorAll('.node-money .money-line span');
    const first = moneySpans[0];
    const second = moneySpans[1];
    if (first) {
      const amount = extractAmount(first.textContent);
      setText(first, `${source === 'support' ? '체험 지원금 사용' : '필요 업무 잔액'} ${amount}`.trim());
    }
    if (second) {
      const amount = extractAmount(second.textContent);
      setText(second, `승인 시 수당 ${amount}`.trim());
    }

    ensureContract(card, source);

    const button = card.querySelector('[data-start-node]');
    if (!button) return;
    const state = actionState(button, source);
    ensureStateBadge(card, state);

    button.classList.toggle('primary', state === 'ready');
    if (state === 'ready') {
      button.disabled = false;
      setText(button, '업무 시작');
    } else if (state === 'insufficient') {
      button.disabled = false;
      setText(button, '입금 안내 보기');
    } else if (state === 'support-missing') {
      button.disabled = true;
      setText(button, '체험 지원금 필요');
    } else if (state === 'active-run') {
      button.disabled = true;
      setText(button, '진행 중 업무 먼저 완료');
    } else if (state === 'review') {
      button.disabled = true;
      setText(button, '검수 대기 중');
    } else if (state === 'waiting') {
      button.disabled = true;
      setText(button, '대기 중');
    }

    const title = String(card.querySelector('.node-title')?.textContent || '업무').trim();
    button.setAttribute('aria-label', `${title} ${String(button.textContent || '').trim()}`);
  }

  function enhanceMatchingCopy(root) {
    const title = Array.from(root.querySelectorAll?.('.section-heading .page-title') || [])
      .find((node) => ['라인 찾기', '업무 매칭'].includes(String(node.textContent || '').trim()));
    if (title) {
      const copy = title.closest('.section-heading')?.querySelector('.page-copy');
      if (copy) setText(copy, PAGE_COPY);
    }

    root.querySelectorAll?.('#nodeFilterHint').forEach((hint) => {
      const current = String(hint.textContent || '').trim();
      const next = FILTER_HINTS.get(current);
      if (next) setText(hint, next);
    });
  }

  function enhanceScope(root) {
    if (!(root instanceof Element)) return;
    enhanceMatchingCopy(root === app ? app : root.closest('#app') || app);

    if (root.matches('.node-card')) enhanceCard(root);
    root.querySelectorAll?.('.node-card').forEach(enhanceCard);

    const nearestCard = root.closest('.node-card');
    if (nearestCard) enhanceCard(nearestCard);
  }

  function installStyles() {
    if (document.getElementById('putduk-line-card-ux-style')) return;
    const style = document.createElement('style');
    style.id = 'putduk-line-card-ux-style';
    style.textContent = `
      .node-card[data-putduk-card-contract="funding-v1"] .node-top{align-items:flex-start}
      .node-card[data-putduk-card-contract="funding-v1"] .line-card-state{display:inline-flex;align-items:center;min-height:28px;padding:4px 9px;border:1px solid var(--line);border-radius:999px;background:var(--surface-strong);color:var(--muted);font-size:11px;font-weight:850;line-height:1.2;text-align:center}
      .node-card[data-putduk-card-contract="funding-v1"] .line-card-state[data-state="ready"]{color:var(--emerald-strong);border-color:color-mix(in srgb,var(--emerald) 34%,var(--line));background:color-mix(in srgb,var(--emerald) 9%,var(--surface-strong))}
      .node-card[data-putduk-card-contract="funding-v1"] .line-card-state[data-state="insufficient"],
      .node-card[data-putduk-card-contract="funding-v1"] .line-card-state[data-state="support-missing"]{color:var(--gold);border-color:color-mix(in srgb,var(--gold) 35%,var(--line));background:color-mix(in srgb,var(--gold) 8%,var(--surface-strong))}
      .node-card[data-putduk-card-contract="funding-v1"] .node-money{margin-top:14px}
      .node-card[data-putduk-card-contract="funding-v1"] .node-money .money-line span{font-weight:850}
      .node-card[data-putduk-funding-source="support"] .node-money .money-line:first-child span{color:var(--gold)}
      .node-card[data-putduk-funding-source="work"] .node-money .money-line:first-child span{color:var(--text)}
      .node-card[data-putduk-card-contract="funding-v1"] .line-card-contract{display:grid;grid-template-columns:auto minmax(0,1fr);gap:8px 10px;align-items:start;margin-top:12px;padding:10px 11px;border:1px solid var(--line);border-radius:12px;background:color-mix(in srgb,var(--surface-soft) 74%,transparent);font-size:11px;line-height:1.48}
      .node-card[data-putduk-card-contract="funding-v1"] .line-card-contract strong{color:var(--text);font-size:11px;white-space:nowrap}
      .node-card[data-putduk-card-contract="funding-v1"] .line-card-contract span{color:var(--muted)}
      .node-card[data-putduk-card-contract="funding-v1"] .node-bottom{margin-top:12px}
      .node-card[data-putduk-card-contract="funding-v1"] [data-putduk-card-action="insufficient"]{border-color:color-mix(in srgb,var(--gold) 30%,var(--line));background:var(--surface-strong)}
      @media (max-width:640px){
        .node-card[data-putduk-card-contract="funding-v1"] .line-card-contract{grid-template-columns:1fr;gap:3px;padding:10px}
        .node-card[data-putduk-card-contract="funding-v1"] .node-bottom{display:grid;grid-template-columns:1fr;align-items:stretch}
        .node-card[data-putduk-card-contract="funding-v1"] .node-bottom .small-button{width:100%;min-height:48px}
        .node-card[data-putduk-card-contract="funding-v1"] .node-meta{margin-bottom:8px}
      }
    `;
    document.head.appendChild(style);
  }

  installStyles();
  enhanceScope(app);

  const observer = new MutationObserver((records) => {
    for (const record of records) {
      const target = record.target instanceof Element ? record.target : app;
      enhanceScope(target);
      for (const node of record.addedNodes) {
        if (node instanceof Element) enhanceScope(node);
      }
    }
  });
  observer.observe(app, { childList: true, subtree: true });
})();
