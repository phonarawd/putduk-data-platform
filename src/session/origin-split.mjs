// 회원 웹과 운영자 웹은 서로 다른 origin이어야 Auth 세션이 섞이지 않는다.

export const OPS_HOSTS = ['ops.hiptk.app', 'ops.putduk.kr'];
export const MEMBER_HOSTS = [
  'app.hiptk.app',
  'hiptk.app',
  'www.hiptk.app',
  'go.hiptk.app',
  'app.putduk.kr',
  'putduk.kr',
  'www.putduk.kr'
];

export function isLocalHost(hostname) {
  const host = String(hostname || '').toLowerCase();
  return host === '127.0.0.1' || host === 'localhost';
}

export function isOpsHost(hostname, port = '') {
  const host = String(hostname || '').toLowerCase();
  if (OPS_HOSTS.includes(host)) return true;
  return isLocalHost(host) && String(port) === '4174';
}

export function isMemberHost(hostname, port = '') {
  const host = String(hostname || '').toLowerCase();
  if (isOpsHost(host, port)) return false;
  if (MEMBER_HOSTS.includes(host)) return true;
  return isLocalHost(host) && String(port) !== '4174';
}

export function resolveOpsOrigin(locationLike) {
  const host = String(locationLike?.hostname || '').toLowerCase();
  const port = String(locationLike?.port || '');
  const protocol = locationLike?.protocol || 'https:';
  if (isOpsHost(host, port)) return `${protocol}//${host}${port ? `:${port}` : ''}`;
  if (host.endsWith('hiptk.app')) return 'https://ops.hiptk.app';
  if (host.endsWith('putduk.kr')) return 'https://ops.putduk.kr';
  if (isLocalHost(host)) return `${protocol}//${host}:4174`;
  return '';
}

export function resolveMemberOrigin(locationLike) {
  const host = String(locationLike?.hostname || '').toLowerCase();
  const port = String(locationLike?.port || '');
  const protocol = locationLike?.protocol || 'https:';
  if (isMemberHost(host, port)) return `${protocol}//${host}${port ? `:${port}` : ''}`;
  if (host === 'ops.hiptk.app') return 'https://app.hiptk.app';
  if (host === 'ops.putduk.kr') return 'https://app.putduk.kr';
  if (isLocalHost(host)) return `${protocol}//${host}:4173`;
  return '';
}

export function isAdminPath(pathname) {
  const path = String(pathname || '/');
  return path === '/admin' || path.startsWith('/admin/');
}

export function originGate(locationLike, mode = 'member') {
  const host = String(locationLike?.hostname || '').toLowerCase();
  const port = String(locationLike?.port || '');
  const path = String(locationLike?.pathname || '/');
  const search = String(locationLike?.search || '');
  const hash = String(locationLike?.hash || '');
  const ops = isOpsHost(host, port);
  const adminPath = isAdminPath(path);
  const wantsAdmin = mode === 'admin' || adminPath;

  if (!ops && wantsAdmin) {
    const target = resolveOpsOrigin(locationLike);
    if (target) {
      return { action: 'redirect', url: `${target}/admin/${search}${hash}` };
    }
    return {
      action: 'block',
      reason: 'ops-origin-missing',
      copy: '운영자 화면은 회원 주소와 다른 주소에서만 열 수 있어요. 출시 전에 운영자 전용 주소를 연결해 주세요.'
    };
  }

  if (ops && !adminPath) {
    const origin = `${locationLike.protocol}//${host}${port ? `:${port}` : ''}`;
    return { action: 'redirect', url: `${origin}/admin/${search}${hash}` };
  }

  if (ops && mode === 'member' && adminPath) {
    return { action: 'allow' };
  }

  return { action: 'allow' };
}
