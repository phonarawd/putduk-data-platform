(() => {
  'use strict';

  const FEATURE_FROM = '라인 찾기';
  const FEATURE_TO = '업무 매칭';
  const root = document.documentElement;
  root.dataset.uiuxFinal = '2026-09';

  function normalizeText(value) {
    const text = String(value || '');
    return text.includes(FEATURE_FROM) ? text.split(FEATURE_FROM).join(FEATURE_TO) : text;
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
      scope.querySelectorAll('[aria-label*="라인 찾기"], [title*="라인 찾기"]').forEach(normalizeAttributes);
    }
  }

  const pending = new Set();
  let queued = false;

  function flush() {
    queued = false;
    const roots = Array.from(pending);
    pending.clear();
    roots.forEach(normalizeTree);
  }

  function queue(node) {
    if (!node) return;
    pending.add(node.nodeType === Node.TEXT_NODE ? node : node);
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
