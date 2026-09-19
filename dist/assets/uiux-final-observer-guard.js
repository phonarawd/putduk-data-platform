(() => {
  'use strict';

  const NativeMutationObserver = window.MutationObserver;
  if (typeof NativeMutationObserver !== 'function' || window.__PUTDUK_UIUX_FINAL_OBSERVER_GUARD__) return;

  window.__PUTDUK_UIUX_FINAL_OBSERVER_GUARD__ = true;

  class GuardedMutationObserver {
    constructor(callback) {
      this._callback = callback;
      this._subscriptions = [];
      this._running = false;
      this._manuallyDisconnected = false;
      this._native = new NativeMutationObserver((records) => {
        if (this._running || !records.length) return;
        this._running = true;
        this._native.disconnect();
        try {
          this._callback(records, this);
        } finally {
          // uiux-final queues its DOM rewrite in a microtask. Re-observe on the next task,
          // after those self-authored mutations are finished, so they cannot recursively
          // trigger the same observer forever.
          window.setTimeout(() => {
            if (!this._manuallyDisconnected) {
              for (const { target, options } of this._subscriptions) {
                try { this._native.observe(target, options); } catch (_) {}
              }
            }
            this._running = false;
          }, 0);
        }
      });
    }

    observe(target, options) {
      this._manuallyDisconnected = false;
      const existing = this._subscriptions.findIndex((item) => item.target === target);
      const entry = { target, options: { ...(options || {}) } };
      if (existing >= 0) this._subscriptions[existing] = entry;
      else this._subscriptions.push(entry);
      this._native.observe(target, options);
    }

    disconnect() {
      this._manuallyDisconnected = true;
      this._subscriptions = [];
      this._native.disconnect();
    }

    takeRecords() {
      return this._native.takeRecords();
    }
  }

  window.MutationObserver = GuardedMutationObserver;

  const restoreConstructor = () => {
    if (window.MutationObserver === GuardedMutationObserver) {
      window.MutationObserver = NativeMutationObserver;
    }
  };

  // uiux-final creates its observer while deferred scripts execute, before DOMContentLoaded.
  // Restore the native constructor afterwards so unrelated runtimes are unaffected.
  document.addEventListener('DOMContentLoaded', restoreConstructor, { once: true });
  window.setTimeout(restoreConstructor, 5000);
})();
