(() => {
  'use strict';

  const root = document.documentElement;
  root.dataset.uiuxFinal = '2026-09';
  if (root.dataset.mode === 'admin') return;

  const EXACT_TEXT_REPLACEMENTS = new Map([
    ['오늘 라인', '오늘 업무'],
    ['라인 더 보기', '업무 더 보기'],
    ['오늘 라인 근무', '오늘 업무'],
    ['방금 라인', '방금 매칭'],
    ['지금 라인', '지금 업무'],
    ['신청하고 처리 중으로', '출금 신청']
  ]);

  const COPY_REPLACEMENTS = [
    ['라인 찾기', '업무 매칭'],
    ['정산·지갑', '지갑·정산'],
    ['중복확인', '중복 확인'],
    ['휴대폰번호', '휴대폰 번호'],
    ['업무잔액', '업무 잔액'],
    ['출금가능', '출금 가능'],
    ['USDT로만 출금 가능해요', 'USDT로만 출금할 수 있어요'],
    ['오늘 배정된 라인이에요. 잠금 금액과 수당을 보고 출근하세요.', '오늘 참여할 수 있는 업무예요. 잠금 금액과 예상 수당을 확인한 뒤 시작해 주세요.'],
    ['운영자가 배정한 라인이나 공개된 근무가 여기에 나타나요.', '운영자가 배정했거나 지금 참여할 수 있는 업무가 여기에 표시돼요.'],
    ['운영자가 배정한 라인이나 공개된 근무가 여기에 보여요.', '운영자가 배정했거나 지금 참여할 수 있는 업무가 여기에 표시돼요.'],
    ['오늘 공개된 라인이 아직 없어요.', '오늘 참여할 수 있는 업무가 아직 없어요.'],
    ['배정된 라인을 업무 매칭에서 확인해요.', '배정된 업무를 업무 매칭에서 확인해요.'],
    ['로그인하면 오늘 라인에 출근해요', '로그인하면 오늘 업무를 확인할 수 있어요'],
    ['오늘 라인 근무와 등급·혜택을 쉽게 안내해요.', '오늘 업무와 등급·혜택을 쉽게 안내해요.'],
    ['협력사 라인 근무', '협력사 업무 운영'],
    ['퍼뜩 라인 근무', '퍼뜩 업무'],
    ['나만의 노드 카드를 발급해요.', '가입 후 나만의 회원 카드를 발급해요.']
  ];

  function replaceExactText(text) {
    const trimmed = text.trim();
    const replacement = EXACT_TEXT_REPLACEMENTS.get(trimmed);
    if (!replacement) return text;
    const start = text.indexOf(trimmed);
    return `${text.slice(0, start)}${replacement}${text.slice(start + trimmed.length)}`;
  }

  function normalizeText(value) {
    let text = replaceExactText(String(value || ''));
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

  function ensureMatchingTab() {
    const tabbar = document.querySelector('.member-tabbar');
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

    if (scope.querySelectorAll) scope.querySelectorAll('[aria-label], [title]').forEach(normalizeAttributes);
  }

  const pending = new Set();
  let queued = false;

  function flush() {
    queued = false;
    const roots = Array.from(pending);
    pending.clear();
    roots.forEach(normalizeTree);
    ensureMatchingTab();
  }

  function queue(node) {
    if (!node) return;
    pending.add(node);
    if (queued) return;
    queued = true;
    queueMicrotask(flush);
  }

  const observer = new MutationObserver((records) => {
    for (const record of records) record.addedNodes.forEach(queue);
  });

  function start() {
    normalizeTree(document);
    ensureMatchingTab();
    observer.observe(document.body || document.documentElement, {
      childList: true,
      subtree: true
    });
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', start, { once: true });
  } else {
    start();
  }
})();
