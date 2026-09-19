const RECOVERY_ORIGIN = 'https://putduk-data-platform.pages.dev';
const RECOVERY_COOKIE = 'putduk_recovery';

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

  const isOfficialMemberHost = host === 'app.hiptk.app';
  const cookieHeader = context.request.headers.get('Cookie') || '';
  const recoveryCookie = new RegExp(`(?:^|;\\s*)${RECOVERY_COOKIE}=1(?:;|$)`).test(cookieHeader);
  const recoveryRequested = isOfficialMemberHost && url.searchParams.get('__recovery') === '1';
  const nativeRequested = isOfficialMemberHost && url.searchParams.get('__native') === '1';

  // Hidden emergency switch. Native is the default production path.
  // ?__recovery=1 pins this browser to the last known-good Pages origin.
  // ?__native=1 clears that pin and returns to the patched native build.
  if (!adminPath && (recoveryRequested || nativeRequested)) {
    const cleanUrl = new URL(url);
    cleanUrl.searchParams.delete('__recovery');
    cleanUrl.searchParams.delete('__native');
    const response = Response.redirect(cleanUrl.toString(), 302);
    response.headers.append(
      'Set-Cookie',
      recoveryRequested
        ? `${RECOVERY_COOKIE}=1; Path=/; Max-Age=3600; Secure; HttpOnly; SameSite=Lax`
        : `${RECOVERY_COOKIE}=; Path=/; Max-Age=0; Secure; HttpOnly; SameSite=Lax`
    );
    return response;
  }

  const recoveryMemberHost = isOfficialMemberHost && recoveryCookie;

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
  next.headers.set('X-Putduk-Boot', 'native-v41');
  return next;
}
