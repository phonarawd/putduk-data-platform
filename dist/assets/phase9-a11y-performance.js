(() => {
  'use strict';

  const root = document.documentElement;
  const isAdmin = root.dataset.mode === 'admin';
  const metrics = {
    started_at: Date.now(),
    mode: isAdmin ? 'admin' : 'member',
    lcp_ms: null,
    inp_ms: null,
    cls: 0,
    longtask_ms: 0,
    longtask_count: 0,
    js_heap_used_mb: null
  };

  function idle(fn, timeout = 2000) {
    if (typeof requestIdleCallback === 'function') requestIdleCallback(fn, { timeout });
    else setTimeout(fn, Math.min(timeout, 250));
  }

  function publish() {
    window.PUTDUK_PERF_METRICS = { ...metrics, sampled_at: Date.now() };
  }

  function observe(type, handler) {
    if (!('PerformanceObserver' in window)) return;
    try {
      const supported = PerformanceObserver.getSupportedEntryTypes
        ? PerformanceObserver.getSupportedEntryTypes()
        : [];
      if (supported.length && !supported.includes(type)) return;
      const observer = new PerformanceObserver((list) => {
        for (const entry of list.getEntries()) handler(entry);
      });
      observer.observe({ type, buffered: true });
    } catch (_) {}
  }

  observe('largest-contentful-paint', (entry) => {
    metrics.lcp_ms = Math.round(entry.startTime);
    publish();
  });

  let clsValue = 0;
  observe('layout-shift', (entry) => {
    if (!entry.hadRecentInput) {
      clsValue += Number(entry.value || 0);
      metrics.cls = Number(clsValue.toFixed(4));
      publish();
    }
  });

  observe('event', (entry) => {
    const duration = Number(entry.duration || 0);
    if (duration > Number(metrics.inp_ms || 0)) {
      metrics.inp_ms = Math.round(duration);
      publish();
    }
  });

  observe('longtask', (entry) => {
    metrics.longtask_count += 1;
    metrics.longtask_ms = Math.round(metrics.longtask_ms + Number(entry.duration || 0));
    publish();
  });

  function sampleMemory() {
    const memory = performance?.memory;
    if (memory?.usedJSHeapSize) {
      metrics.js_heap_used_mb = Number((memory.usedJSHeapSize / 1048576).toFixed(1));
      publish();
    }
  }

  function addLiveRegion() {
    if (document.getElementById('putdukA11yLive')) return;
    const live = document.createElement('div');
    live.id = 'putdukA11yLive';
    live.className = 'pd-live-region';
    live.setAttribute('role', 'status');
    live.setAttribute('aria-live', 'polite');
    live.setAttribute('aria-atomic', 'true');
    document.body.appendChild(live);
    window.PutdukA11y = window.PutdukA11y || {};
    window.PutdukA11y.announce = (message) => {
      const text = String(message || '').trim();
      if (!text) return;
      live.textContent = '';
      requestAnimationFrame(() => { live.textContent = text; });
    };
  }

  function enhanceForm(form) {
    if (!form || form.dataset.a11yEnhanced === '1') return;
    form.dataset.a11yEnhanced = '1';

    form.querySelectorAll('input, select, textarea').forEach((control) => {
      if (!control.id) return;
      const label = form.querySelector('label[for="' + CSS.escape(control.id) + '"]');
      if (!label && !control.getAttribute('aria-label') && !control.getAttribute('aria-labelledby')) {
        const placeholder = String(control.getAttribute('placeholder') || '').trim();
        if (placeholder) control.setAttribute('aria-label', placeholder);
      }
      if (control.required) control.setAttribute('aria-required', 'true');
    });
  }

  function enhanceDialog(dialog) {
    if (!dialog || dialog.dataset.a11yEnhanced === '1') return;
    dialog.dataset.a11yEnhanced = '1';
    if (!dialog.hasAttribute('role')) dialog.setAttribute('role', 'dialog');
    dialog.setAttribute('aria-modal', 'true');

    const heading = dialog.querySelector('.modal-head h1, .modal-head h2, .modal-head h3, [data-dialog-title]');
    if (heading) {
      if (!heading.id) heading.id = 'putduk-dialog-title-' + Math.random().toString(36).slice(2, 9);
      dialog.setAttribute('aria-labelledby', heading.id);
    }

    dialog.querySelectorAll('button').forEach((button) => {
      if (button.getAttribute('aria-label') || button.textContent.trim()) return;
      const title = String(button.getAttribute('title') || '').trim();
      if (title) button.setAttribute('aria-label', title);
    });
  }

  let activeDialog = null;
  let restoreFocus = null;

  function visibleDialog() {
    const dialogs = [...document.querySelectorAll(
      '.modal-backdrop:not([hidden]) .modal, .modal-backdrop:not([hidden]) [role="dialog"], [role="dialog"][data-open="1"], .uiux-legal-sheet'
    )];
    return dialogs.reverse().find((el) => {
      const style = getComputedStyle(el);
      return style.display !== 'none' && style.visibility !== 'hidden' && el.getBoundingClientRect().width > 0;
    }) || null;
  }

  function getFocusable(dialog) {
    return [...dialog.querySelectorAll(
      'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])'
    )].filter((el) => {
      const style = getComputedStyle(el);
      return style.display !== 'none' && style.visibility !== 'hidden';
    });
  }

  function syncDialogFocus() {
    const dialog = visibleDialog();
    if (dialog === activeDialog) return;
    if (activeDialog && !dialog) {
      if (restoreFocus && document.contains(restoreFocus)) {
        try { restoreFocus.focus({ preventScroll: true }); } catch (_) {}
      }
      activeDialog = null;
      restoreFocus = null;
      return;
    }
    if (dialog) {
      restoreFocus = document.activeElement instanceof HTMLElement ? document.activeElement : null;
      activeDialog = dialog;
      enhanceDialog(dialog);
      const focusables = getFocusable(dialog);
      if (focusables.length) {
        idle(() => {
          if (activeDialog === dialog && !dialog.contains(document.activeElement)) {
            try { focusables[0].focus({ preventScroll: true }); } catch (_) {}
          }
        }, 350);
      }
    }
  }

  document.addEventListener('keydown', (event) => {
    if (event.key !== 'Tab') return;
    const dialog = visibleDialog();
    if (!dialog) return;
    const focusables = getFocusable(dialog);
    if (!focusables.length) {
      event.preventDefault();
      try { dialog.focus({ preventScroll: true }); } catch (_) {}
      return;
    }
    const first = focusables[0];
    const last = focusables[focusables.length - 1];
    if (event.shiftKey && document.activeElement === first) {
      event.preventDefault();
      last.focus({ preventScroll: true });
    } else if (!event.shiftKey && document.activeElement === last) {
      event.preventDefault();
      first.focus({ preventScroll: true });
    }
  });

  const observer = new MutationObserver(() => {
    addLiveRegion();
    document.querySelectorAll('form').forEach(enhanceForm);
    document.querySelectorAll('.modal, [role="dialog"], .uiux-legal-sheet').forEach(enhanceDialog);
    syncDialogFocus();
  });

  function start() {
    addLiveRegion();
    document.querySelectorAll('form').forEach(enhanceForm);
    document.querySelectorAll('.modal, [role="dialog"], .uiux-legal-sheet').forEach(enhanceDialog);
    observer.observe(document.getElementById('app') || document.body, { childList: true, subtree: true });
    syncDialogFocus();
    idle(sampleMemory, 2500);
    window.addEventListener('visibilitychange', () => {
      if (!document.hidden) idle(sampleMemory, 1500);
    }, { passive: true });
    window.addEventListener('beforeunload', publish, { passive: true });
    publish();
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', start, { once: true });
  } else {
    start();
  }
})();
