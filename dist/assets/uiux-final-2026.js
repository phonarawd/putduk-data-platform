(() => {
  'use strict';

  const root = document.documentElement;
  root.dataset.uiuxFinal = '2026-09';
  if (root.dataset.mode === 'admin') return;

  const COPY_REPLACEMENTS = [
    ['라인 찾기', '업무 매칭'],
    ['정산·지갑', '지갑·정산'],
    ['중복확인', '중복 확인'],
    ['휴대폰번호', '휴대폰 번호'],
    ['USDT로만 출금가능해요', 'USDT로만 출금할 수 있어요'],
    ['오늘 배정된 라인이에요. 잠금 금액과 수당을 보고 출근하세요.', '오늘 참여할 수 있는 업무예요. 잠금 금액과 예상 수당을 확인한 뒤 시작해 주세요.'],
    ['운영자가 배정한 라인이나 공개된 근무가 여기에 나타나요.', '운영자가 배정했거나 지금 참여할 수 있는 업무가 여기에 표시돼요.'],
    ['배정된 라인을 업무 매칭에서 확인해요.', '배정된 업무를 업무 매칭에서 확인해요.']
  ];

  function normalizeText(value) {
    let text = String(value || '');
    for (const [from, to] of COPY_REPLACEMENTS) {
      if (text.includes(from)) text = text.split(from).join(to);
    }
    return text;
  }

  function normalizeAttributes(element) {
    if (!(element instanceof Element)) return;
    for (const name of ['aria-label', 'title']) {
      if (!element.hasAttribute(name)) continue;
      const before = element.getAttribute(name) || '';
      const after = normalizeText(before);
      if (after !== before) element.setAttribute(name, after);
    }
  }

  function ensureMatchingTab(scope = document) {
    const tabbar = scope.querySelector?.('.member-tabbar') || document.querySelector('.member-tabbar');
    if (!tabbar) return;

    let matching = tabbar.querySelector('[data-nav="nodes"]');
    const dashboard = tabbar.querySelector('[data-nav="dashboard"]');
    const nodeNav = document.querySelector('#sidebar [data-nav="nodes"]');
    const nodeActive = Boolean(nodeNav?.classList.contains('active'));

    if (!matching && dashboard) {
      matching = document.createElement('button');
      matching.type = 'button';
      matching.className = 'member-tab';
      matching.dataset.nav = 'nodes';
      matching.setAttribute('aria-label', '업무 매칭');

      const iconWrap = document.createElement('span');
      iconWrap.className = 'member-tab-icon';
      const sourceIcon = nodeNav?.querySelector('svg');
      if (sourceIcon) iconWrap.appendChild(sourceIcon.cloneNode(true));
      else iconWrap.textContent = '↗';

      const label = document.createElement('span');
      label.className = 'member-tab-label';
      label.textContent = '업무 매칭';
      matching.append(iconWrap, label);
      dashboard.insertAdjacentElement('afterend', matching);
    }

    if (matching) matching.classList.toggle('active', nodeActive);
    if (dashboard && nodeActive) dashboard.classList.remove('active');
  }

  function normalizeTree(start) {
    if (!start) return;
    if (start.nodeType === Node.TEXT_NODE) {
      const parent = start.parentElement;
      if (!parent || ['SCRIPT', 'STYLE', 'NOSCRIPT', 'TEXTAREA'].includes(parent.tagName)) return;
      const before = start.nodeValue || '';
      const after = normalizeText(before);
      if (after !== before) start.nodeValue = after;
      return;
    }

    if (!(start instanceof Element) && start !== document) return;
    const scope = start === document ? document.documentElement : start;
    normalizeAttributes(scope);

    const walker = document.createTreeWalker(scope, NodeFilter.SHOW_TEXT);
    let node = walker.nextNode();
    while (node) {
      const parent = node.parentElement;
      if (parent && !['SCRIPT', 'STYLE', 'NOSCRIPT', 'TEXTAREA'].includes(parent.tagName)) {
        const before = node.nodeValue || '';
        const after = normalizeText(before);
        if (after !== before) node.nodeValue = after;
      }
      node = walker.nextNode();
    }

    if (scope.querySelectorAll) {
      scope.querySelectorAll('[aria-label], [title]').forEach(normalizeAttributes);
    }
    ensureMatchingTab(scope);
  }

  const pending = new Set();
  let queued = false;

  function flush() {
    queued = false;
    const roots = Array.from(pending);
    pending.clear();
    roots.forEach(normalizeTree);
    ensureMatchingTab(document);
  }

  function queue(node) {
    if (!node) return;
    pending.add(node);
    if (queued) return;
    queued = true;
    queueMicrotask(flush);
  }

  const observer = new MutationObserver((records) => {
    for (const record of records) {
      if (record.type === 'characterData') {
        queue(record.target);
        continue;
      }
      record.addedNodes.forEach(queue);
    }
  });

  function start() {
    normalizeTree(document);
    ensureMatchingTab(document);
    observer.observe(document.body || document.documentElement, {
      childList: true,
      subtree: true,
      characterData: true
    });
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', start, { once: true });
  } else {
    start();
  }
})();
