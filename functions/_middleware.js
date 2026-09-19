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
  const isDocument = url.pathname === '/'
    || url.pathname.endsWith('/')
    || url.pathname.endsWith('.html');
  if (staticPath || !isDocument) return response;

  const cookies = context.request.headers.get('Cookie') || '';
  if (cookies.includes('putduk-cleared=v36')) return response;

  const next = new Response(response.body, response);
  next.headers.set('Clear-Site-Data', '"cache", "storage"');
  next.headers.append('Set-Cookie', 'putduk-cleared=v36; Path=/; Max-Age=31536000; SameSite=Lax; Secure');
  return next;
}
