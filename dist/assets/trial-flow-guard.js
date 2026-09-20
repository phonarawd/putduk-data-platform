(() => {
  'use strict';

  if (document.documentElement.dataset.mode !== 'member') return;

  const app = document.getElementById('app');
  if (!app) return;

  const HELP_FROM = '체험 첫 출금 3천 원은 운영 경로로만 처리돼요.';
  const HELP_TO = '체험 업무가 승인된 뒤 3,000원 수당은 1회에 한해 본인확인 전에도 원화 계좌로 출금 신청할 수 있어요. 이후 출금은 본인확인이 필요해요.';
  const RESULT_FROM = '✅ 일이 끝나면 원금과 수당이 잔액에 같이 반영돼요';
  const RESULT_TO = '🎁 체험 지원금은 이미 사용됐어요. 승인되면 수당만 출금가능에 반영돼요.';

  function replaceText(root, from, to) {
    if (!root) return;
    const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
    let node = walker.nextNode();
    while (node) {
      const current = String(node.nodeValue || '');
      if (current.includes(from)) node.nodeValue = current.replace(from, to);
      node = walker.nextNode();
    }
  }

  function sanitize(root) {
    if (!(root instanceof Element)) return;

    replaceText(root, HELP_FROM, HELP_TO);

    const resultModals = [];
    if (root.matches?.('[data-modal="result-scene"]')) resultModals.push(root);
    root.querySelectorAll?.('[data-modal="result-scene"]').forEach((node) => resultModals.push(node));

    for (const modal of resultModals) {
      const isTrial = Array.from(modal.querySelectorAll('.work-receipt-label'))
        .some((label) => String(label.textContent || '').includes('지원금 잠금'));
      if (isTrial) replaceText(modal, RESULT_FROM, RESULT_TO);
    }
  }

  function ensureStyle(marker, href) {
    if (document.querySelector(`link[${marker}]`)) return;
    const link = document.createElement('link');
    link.rel = 'stylesheet';
    link.href = href;
    link.setAttribute(marker, '1');
    document.head.appendChild(link);
  }

  function ensureScript(marker, src, onload) {
    const existing = document.querySelector(`script[${marker}]`);
    if (existing) {
      if (typeof onload === 'function') {
        if (existing.dataset.loaded === '1') onload();
        else existing.addEventListener('load', onload, { once: true });
      }
      return;
    }
    const script = document.createElement('script');
    script.src = src;
    script.async = false;
    script.setAttribute(marker, '1');
    script.addEventListener('load', () => {
      script.dataset.loaded = '1';
      if (typeof onload === 'function') onload();
    }, { once: true });
    document.head.appendChild(script);
  }

  function loadMemberExperience() {
    ensureStyle('data-p4-member-experience', './assets/member-experience-p4.css?v=20260921-p4member1');
    ensureStyle('data-stage7-member-runtime', './assets/member-catalog-runtime.css?v=20260921-stage7a');
    ensureScript('data-p4-member-experience', './assets/member-experience-p4.js?v=20260921-p4member1', () => {
      ensureScript('data-stage7-member-runtime', './assets/member-catalog-runtime.js?v=20260921-stage7a');
    });
  }

  sanitize(app);
  loadMemberExperience();

  const runtime = window.PUTDUK_MEMBER_RUNTIME;
  runtime?.observeMutations((records) => {
    for (const record of records) {
      for (const node of record.addedNodes) {
        if (node instanceof Element) sanitize(node);
      }
    }
  });
})();
