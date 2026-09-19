(() => {
  'use strict';

  if (window.__PUTDUK_NOTICE_INBOX__) return;
  window.__PUTDUK_NOTICE_INBOX__ = '20260920-n1';

  function core() {
    return window.PUTDUK_ADMIN_CORE || null;
  }

  function openNotices() {
    if (typeof window.__putdukOpenNotices === 'function') {
      void window.__putdukOpenNotices();
      return;
    }
    const api = core();
    if (typeof api?.openMemberNotices === 'function') void api.openMemberNotices();
  }

  function openNoticeItem(id) {
    if (typeof window.__putdukOpenNoticeItem === 'function') {
      void window.__putdukOpenNoticeItem(id);
      return;
    }
    const api = core();
    if (typeof api?.openNoticeItem === 'function') void api.openNoticeItem(id);
  }

  function markAllRead() {
    if (typeof window.__putdukMarkAllNoticesRead === 'function') {
      void window.__putdukMarkAllNoticesRead();
      return;
    }
    const api = core();
    if (typeof api?.markAllNoticesRead === 'function') void api.markAllNoticesRead();
  }

  document.addEventListener('click', (event) => {
    const bell = event.target.closest('[data-notification]');
    if (bell) {
      event.preventDefault();
      event.stopImmediatePropagation();
      openNotices();
      return;
    }

    const row = event.target.closest('[data-notice-id]');
    if (row) {
      event.preventDefault();
      event.stopImmediatePropagation();
      openNoticeItem(row.getAttribute('data-notice-id') || '');
      return;
    }

    const markAll = event.target.closest('[data-action="mark-notices-read"]');
    if (markAll) {
      event.preventDefault();
      event.stopImmediatePropagation();
      markAllRead();
    }
  }, true);
})();
