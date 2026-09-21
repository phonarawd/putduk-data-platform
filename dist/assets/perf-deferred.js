(() => {
  'use strict';

  const isAdmin = document.documentElement.dataset.mode === 'admin';
  const base = isAdmin ? '../assets/' : './assets/';
  const adminBase = isAdmin ? './' : null;

  function detectLowPerf() {
    const nav = typeof navigator !== 'undefined' ? navigator : {};
    const conn = nav.connection || nav.mozConnection || nav.webkitConnection;
    const cores = Number(nav.hardwareConcurrency || 4);
    const memory = Number(nav.deviceMemory || 4);
    const saveData = conn?.saveData === true;
    const reduced = typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches;
    return saveData || cores <= 2 || memory <= 2 || reduced;
  }

  if (detectLowPerf()) document.documentElement.dataset.lowPerf = '1';

  const loadedCss = new Set();
  const loadedJs = new Set();
  const pendingJs = new Map();

  function loadCss(href) {
    if (loadedCss.has(href)) return Promise.resolve();
    loadedCss.add(href);
    return new Promise((resolve, reject) => {
      const link = document.createElement('link');
      link.rel = 'stylesheet';
      link.href = href;
      link.onload = () => resolve();
      link.onerror = () => { loadedCss.delete(href); reject(new Error(`css:${href}`)); };
      document.head.appendChild(link);
    });
  }

  function loadScript(src) {
    if (loadedJs.has(src)) return pendingJs.get(src) || Promise.resolve();
    const job = new Promise((resolve, reject) => {
      const script = document.createElement('script');
      script.src = src;
      script.async = true;
      script.onload = () => { loadedJs.add(src); pendingJs.delete(src); resolve(); };
      script.onerror = () => { pendingJs.delete(src); reject(new Error(`js:${src}`)); };
      document.body.appendChild(script);
    });
    pendingJs.set(src, job);
    return job;
  }

  const bundles = {
    uiuxFinal: {
      css: [`${base}uiux-final-2026.css?v=20260919-uiux1`],
      js: [`${base}uiux-final-2026.js?v=20260919-uiux1`]
    },
    uiuxPremium: {
      css: [`${base}uiux-premium-2026.css?v=20260919-uiux2`],
      js: [`${base}uiux-premium-2026.js?v=20260919-uiux2`]
    },
    uiuxGrowth: {
      css: [`${base}uiux-growth-2026.css?v=20260919-uiux3`],
      js: [`${base}uiux-growth-2026.js?v=20260919-uiux3`]
    },
    uiuxAuth: {
      css: [`${base}uiux-auth-2026.css?v=20260919-uiux4`],
      js: [`${base}uiux-auth-2026.js?v=20260919-uiux4`]
    },
    uiuxLegal: {
      css: [`${base}uiux-legal-2026.css?v=20260919-uiux8`],
      js: [
        `${base}uiux-legal-2026.js?v=20260919-uiux8`,
        `${base}uiux-compliance-2026.js?v=20260919-uiux8`
      ]
    },
    motion: { js: [`${base}motion-runtime.js?v=20260918-ux1`] },
    channel: { js: [`${base}channel-talk.js?v=20260920-ch2`] },
    finance: { js: [`${base}phase4-finance-wiring.js?v=20260920-toast1`] },
    brand: { js: [`${base}brand-runtime.js?v=20260919-logo1`] },
    adminUiux: isAdmin ? {
      css: [`${adminBase}uiux-admin-premium-2026.css?v=20260919-uiux2`],
      js: [`${adminBase}uiux-admin-premium-2026.js?v=20260919-uiux2`]
    } : null
  };

  async function ensure(name) {
    const bundle = bundles[name];
    if (!bundle) return;
    const cssJobs = (bundle.css || []).map(loadCss);
    await Promise.all(cssJobs);
    for (const src of bundle.js || []) await loadScript(src);
  }

  async function ensureMany(names) {
    for (const name of names) await ensure(name);
  }

  function idle(fn, timeoutMs) {
    if (typeof requestIdleCallback === 'function') {
      requestIdleCallback(() => fn(), { timeout: timeoutMs || 2500 });
    } else {
      setTimeout(fn, timeoutMs || 120);
    }
  }

  // 무거운 연출과 외부 상담 위젯은 첫 화면·인증 bootstrap과 경쟁하지 않게 idle 이후 붙인다.
  const lowPerf = document.documentElement.dataset.lowPerf === '1';
  idle(() => { ensure('motion').catch(() => {}); }, lowPerf ? 7000 : 3500);
  idle(() => { ensure('channel').catch(() => {}); }, lowPerf ? 10000 : 5000);

  window.PutdukPerf = {
    ensure,
    ensureMany,
    isLowPerf: () => document.documentElement.dataset.lowPerf === '1',
    loadCss,
    loadScript
  };
})();
