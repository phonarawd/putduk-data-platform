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
    return Response.redirect(url.toString(), 302);
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
      return Response.redirect(url.toString(), 302);
    }
  }

  const response = await context.next();
  if (staticPath) return response;

  const next = new Response(response.body, response);
  // Clear-Site-Data는 문서 로드 중 탭을 멈추고, 쿠키가 안 남으면 새로고침이 반복된다.
  next.headers.delete('Clear-Site-Data');
  next.headers.set('X-Putduk-Boot', 'v37');
  return next;
}
