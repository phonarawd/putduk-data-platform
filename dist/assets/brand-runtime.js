(() => {
  'use strict';

  const BRAND = '퍼뜩';

  function setMeta(selector, content) {
    const node = document.querySelector(selector);
    if (node && node.getAttribute('content') !== content) {
      node.setAttribute('content', content);
    }
  }

  function normalizeBreadcrumb(node) {
    const strong = node.querySelector('strong');
    const pageTitle = strong?.textContent?.trim() || '';
    const desired = pageTitle ? `${BRAND} ${pageTitle}` : BRAND;
    const current = node.textContent.replace(/\s+/g, ' ').trim();
    if (current === desired) return;

    if (pageTitle) {
      const pageNode = strong.cloneNode(true);
      node.replaceChildren(document.createTextNode(`${BRAND} `), pageNode);
      return;
    }

    node.textContent = BRAND;
  }

  function normalizeBranding() {
    if (document.title !== BRAND) document.title = BRAND;

    setMeta('meta[name="description"]', BRAND);
    setMeta('meta[property="og:title"]', BRAND);
    setMeta('meta[property="og:description"]', BRAND);

    document.querySelectorAll('.brand-name').forEach((node) => {
      if (node.textContent !== BRAND) node.textContent = BRAND;
    });

    document.querySelectorAll('.brand-kicker').forEach((node) => {
      if (node.textContent) node.textContent = '';
      if (!node.hidden) node.hidden = true;
    });

    document.querySelectorAll('.breadcrumb').forEach(normalizeBreadcrumb);
  }

  let scheduled = false;
  function scheduleNormalize() {
    if (scheduled) return;
    scheduled = true;
    queueMicrotask(() => {
      scheduled = false;
      normalizeBranding();
    });
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', normalizeBranding, { once: true });
  } else {
    normalizeBranding();
  }

  const observer = new MutationObserver(scheduleNormalize);
  observer.observe(document.documentElement, {
    childList: true,
    subtree: true,
    characterData: true
  });
})();
