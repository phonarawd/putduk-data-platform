(() => {
  'use strict';

  // Production boot watchdog: UI-only recovery for a stalled auth/session lookup.
  // It never grants access, changes auth state, or mutates work/finance data.
  const start = () => {
    window.setTimeout(() => {
      const shell = document.querySelector('[data-boot-shell="1"]');
      if (!shell || !document.documentElement) return;

      const hasAuthAction = shell.querySelector('[data-action="open-login"], [data-action="open-signup"]');
      if (hasAuthAction) return;

      const mode = document.documentElement.dataset.mode === 'admin' ? 'admin' : 'member';
      const title = shell.querySelector('strong, .page-title, h1');
      const copy = shell.querySelector('span, .page-copy, p');

      if (title) {
        title.textContent = mode === 'admin'
          ? '운영자 로그인을 확인해 주세요'
          : '로그인을 확인하는 데 시간이 걸리고 있어요';
      }
      if (copy) {
        copy.textContent = mode === 'admin'
          ? '잠시 후에도 화면이 열리지 않으면 운영자 로그인으로 다시 시작할 수 있어요.'
          : '네트워크 상태를 확인한 뒤 로그인하면 안전하게 이어서 사용할 수 있어요.';
      }

      const actions = shell.querySelector('.modal-actions') || (() => {
        const el = document.createElement('div');
        el.className = 'modal-actions';
        el.style.cssText = 'justify-content:center;margin-top:18px';
        shell.appendChild(el);
        return el;
      })();

      const button = document.createElement('button');
      button.type = 'button';
      button.className = mode === 'admin' ? 'primary-button' : 'pd-button pd-button--primary';
      button.dataset.action = 'open-login';
      button.textContent = mode === 'admin' ? '운영자 로그인' : '로그인';
      actions.appendChild(button);

      shell.setAttribute('data-boot-recovery', '1');
      shell.setAttribute('role', 'status');
      shell.setAttribute('aria-live', 'polite');
    }, 12000);
  };

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', start, { once: true });
  } else {
    start();
  }
})();
