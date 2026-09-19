const RECOVERY_ORIGIN = 'https://putduk-data-platform.pages.dev';

export async function onRequest(context) {
  const url = new URL(context.request.url);
  const host = url.hostname.toLowerCase();
  const method = context.request.method.toUpperCase();
  const isOps = host === 'ops.hiptk.app' || host === 'ops.putduk.kr' || host.startsWith('ops.');
  const adminPath = url.pathname === '/admin' || url.pathname.startsWith('/admin/');
  const staticPath = url.pathname.startsWith('/assets/')
    || url.pathname.startsWith('/icons/')
    || url.pathname === '/sw.js'
    || url.pathname === '/manifest.webmanifest'
    || url.pathname === '/favicon.svg';
  const recoveryMemberHost = host === 'app.hiptk.app' || host === 'putduk-git-preview.pages.dev';

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

  // Emergency recovery: keep the official/member hostname while serving the last known-good Pages build.
  // Proxy all GET/HEAD member documents and static assets to the stable project. API traffic remains direct to Supabase.
  if (recoveryMemberHost && !adminPath && (method === 'GET' || method === 'HEAD')) {
    const upstreamUrl = new URL(url.pathname + url.search, RECOVERY_ORIGIN);
    const upstreamRequest = new Request(upstreamUrl.toString(), {
      method,
      headers: context.request.headers,
      redirect: 'manual'
    });
    const upstreamResponse = await fetch(upstreamRequest);
    const recoveryResponse = new Response(method === 'HEAD' ? null : upstreamResponse.body, upstreamResponse);
    recoveryResponse.headers.delete('Clear-Site-Data');
    recoveryResponse.headers.set('X-Putduk-Recovery-Origin', 'stable-pages-v1');
    recoveryResponse.headers.set('X-Putduk-Boot', 'recovery-v1');
    return recoveryResponse;
  }

  const response = await context.next();
  if (staticPath) return response;

  const next = new Response(response.body, response);
  next.headers.delete('Clear-Site-Data');
  next.headers.set('X-Putduk-Boot', 'v39');
  return next;
}
