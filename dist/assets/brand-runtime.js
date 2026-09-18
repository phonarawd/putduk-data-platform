(() => {
  'use strict';

  const BRAND = '퍼뜩';
  const isAdmin = document.documentElement.dataset.mode === 'admin';
  const LOGO_SRC = isAdmin ? '../icons/putduk-premium.png?v=20260919-logo1' : './icons/putduk-premium.png?v=20260919-logo1';

  function setMeta(selector, content) {
    const node = document.querySelector(selector);
    if (node && node.getAttribute('content') !== content) node.setAttribute('content', content);
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

  function mountLogo(node, size = 38) {
    const current = node.querySelector('img[data-putduk-premium-logo]');
    if (current) return;
    node.replaceChildren();
    node.style.background = 'transparent';
    node.style.boxShadow = 'none';
    const img = document.createElement('img');
    img.src = LOGO_SRC;
    img.alt = '';
    img.width = size;
    img.height = size;
    img.dataset.putdukPremiumLogo = '1';
    img.style.display = 'block';
    img.style.width = `${size}px`;
    img.style.height = `${size}px`;
    img.style.objectFit = 'cover';
    img.style.borderRadius = `${Math.round(size * 0.28)}px`;
    node.appendChild(img);
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
    document.querySelectorAll('.brand-symbol').forEach((node) => mountLogo(node, 38));
    document.querySelectorAll('.mobile-brand-logo').forEach((node) => {
      if (node.getAttribute('src') !== LOGO_SRC) node.setAttribute('src', LOGO_SRC);
      node.style.borderRadius = '8px';
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

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', normalizeBranding, { once: true });
  else normalizeBranding();

  const observer = new MutationObserver(scheduleNormalize);
  observer.observe(document.documentElement, { childList: true, subtree: true, characterData: true });
})();
