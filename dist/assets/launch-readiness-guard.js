(() => {
  'use strict';

  const mode = document.documentElement.dataset.mode || '';
  const root = document.getElementById('app');
  if (!root) return;

  const MEMBER_TEXT_REPLACEMENTS = [
    ['회원번호 준비 중', '회원번호 확인 중'],
    ['코드 준비 중', '추천 코드 확인 중'],
    ['첫 업무 준비 중', '현재 가능한 첫 업무 없음']
  ];

  function replaceTextNode(node) {
    if (mode !== 'member' || !node || node.nodeType !== Node.TEXT_NODE) return;
    const original = String(node.nodeValue || '');
    if (!original.trim()) return;
    let next = original;
    for (const [from, to] of MEMBER_TEXT_REPLACEMENTS) {
      if (next.includes(from)) next = next.replaceAll(from, to);
    }
    if (next !== original) node.nodeValue = next;
  }

  function cleanMemberSurface(scope) {
    if (mode !== 'member' || !(scope instanceof Element)) return;
    if (scope.matches('[data-action="export-history"]')) scope.remove();
    scope.querySelectorAll?.('[data-action="export-history"]').forEach((button) => button.remove());

    const walker = document.createTreeWalker(scope, NodeFilter.SHOW_TEXT);
    let node = walker.nextNode();
    while (node) {
      replaceTextNode(node);
      node = walker.nextNode();
    }
  }

  function campaignContractMissing() {
    return Array.from(document.querySelectorAll('.contract-note')).some((node) => {
      const text = String(node.textContent || '').replace(/\s+/g, ' ').trim();
      return text.includes('지원금 캠페인 저장 계약') && text.includes('아직 없습니다');
    });
  }

  function cleanAdminSurface(scope) {
    if (mode !== 'admin' || !(scope instanceof Element)) return;
    if (!campaignContractMissing()) return;
    const button = document.querySelector('[data-action="save-settings"]');
    if (!button) return;
    button.disabled = true;
    button.setAttribute('aria-disabled', 'true');
    button.dataset.launchReadinessLocked = '1';
    button.textContent = '서버 연결 필요';
  }

  function sanitize(scope) {
    if (!(scope instanceof Element)) return;
    cleanMemberSurface(scope);
    cleanAdminSurface(scope);
  }

  sanitize(root);

  const observer = new MutationObserver((records) => {
    for (const record of records) {
      for (const node of record.addedNodes) {
        if (node instanceof Element) sanitize(node);
        else replaceTextNode(node);
      }
    }
    if (mode === 'admin') cleanAdminSurface(root);
  });
  observer.observe(root, { childList: true, subtree: true });

  document.addEventListener('click', (event) => {
    const target = event.target instanceof Element ? event.target.closest('[data-action]') : null;
    if (!target) return;
    const action = target.dataset.action || '';
    if (mode === 'member' && action === 'export-history') {
      event.preventDefault();
      event.stopImmediatePropagation();
      target.remove();
      return;
    }
    if (mode === 'admin' && action === 'save-settings' && target.dataset.launchReadinessLocked === '1') {
      event.preventDefault();
      event.stopImmediatePropagation();
    }
  }, true);
})();
