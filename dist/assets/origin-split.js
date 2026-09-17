(() => {
  'use strict';
  const host = String(location.hostname || '').toLowerCase();
  const port = String(location.port || '');
  const path = String(location.pathname || '/');
  const mode = document.documentElement.getAttribute('data-mode') || 'member';
  const protocol = location.protocol;
  const isLocal = host === '127.0.0.1' || host === 'localhost';
  const isOpsHost = host === 'ops.hiptk.app' || host === 'ops.putduk.kr' || (isLocal && port === '4174');
  const adminPath = path === '/admin' || path.indexOf('/admin/') === 0;
  const wantsAdmin = mode === 'admin' || adminPath;
  const search = location.search || '';
  const hash = location.hash || '';

  function opsOrigin() {
    if (isOpsHost) return location.origin;
    if (host === 'hiptk.app' || host === 'www.hiptk.app' || host === 'app.hiptk.app' || host === 'go.hiptk.app') return 'https://ops.hiptk.app';
    if (host === 'putduk.kr' || host === 'www.putduk.kr' || host === 'app.putduk.kr') return 'https://ops.putduk.kr';
    if (isLocal) return `${protocol}//${host}:4174`;
    return '';
  }

  if (!isOpsHost && wantsAdmin) {
    const target = opsOrigin();
    if (target) {
      location.replace(`${target}/admin/${search}${hash}`);
      return;
    }
    document.documentElement.dataset.launchBlock = 'ops-origin-missing';
    window.__PUTDUK_LAUNCH_BLOCK__ = {
      reason: 'ops-origin-missing',
      copy: '운영자 화면은 회원 주소와 다른 주소에서만 열 수 있어요. 출시 전에 운영자 전용 주소를 연결해 주세요.'
    };
    return;
  }

  if (isOpsHost && !adminPath) {
    location.replace(`${location.origin}/admin/${search}${hash}`);
  }
})();
