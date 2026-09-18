function stampOrigin(response) {
  const headers = new Headers(response.headers);
  headers.set('X-Putduk-Origin', 'putduk-data-platform-pages');
  headers.set('X-Putduk-Router', '20260919-origin-probe1');
  return new Response(response.body, {
    status: response.status,
    statusText: response.statusText,
    headers
  });
}

export async function onRequest(context) {
  const url = new URL(context.request.url);
  const host = url.hostname.toLowerCase();
  const isOps = host === 'ops.hiptk.app' || host === 'ops.putduk.kr' || host.startsWith('ops.');
  const adminPath = url.pathname === '/admin' || url.pathname.startsWith('/admin/');
  const staticPath = url.pathname.startsWith('/assets/')
    || url.pathname.startsWith('/icons/')
    || url.pathname === '/sw.js'
    || url.pathname === '/manifest.webmanifest'
    || url.pathname === '/favicon.svg';

  if (isOps && !adminPath && !staticPath) {
    url.pathname = '/admin/';
    return stampOrigin(Response.redirect(url.toString(), 302));
  }

  if (!isOps && adminPath) {
    const opsHost = host.endsWith('hiptk.app')
      ? 'ops.hiptk.app'
      : host.endsWith('putduk.kr')
        ? 'ops.putduk.kr'
        : '';
    if (opsHost) {
      url.hostname = opsHost;
      url.pathname = '/admin/';
      return stampOrigin(Response.redirect(url.toString(), 302));
    }
  }

  return stampOrigin(await context.next());
}
