import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { repoPath } from '../helpers/repo.mjs';

async function middlewareSource() {
  return readFile(repoPath('functions/_middleware.js'), 'utf8');
}

async function loadMiddleware() {
  const source = await middlewareSource();
  const href = `data:text/javascript;base64,${Buffer.from(source).toString('base64')}`;
  return import(href);
}

test('Cloudflare middleware는 모든 응답에 origin/router 지문을 남긴다', async () => {
  const middleware = await middlewareSource();

  assert.match(middleware, /X-Putduk-Origin/);
  assert.match(middleware, /putduk-data-platform-pages/);
  assert.match(middleware, /X-Putduk-Router/);
  assert.match(middleware, /20260921-v020-cutover1/);
  assert.match(middleware, /withRoutingHeaders\(await context\.next\(\)\)/);
  assert.match(middleware, /return withRoutingHeaders\(Response\.redirect\(url\.toString\(\), 302\)\)/);
});

test('recovery/native redirect는 immutable Response.redirect headers를 직접 수정하지 않는다', async () => {
  const middleware = await middlewareSource();

  assert.match(middleware, /function withRoutingHeaders\(response, extraHeaders = \{\}\)/);
  assert.match(middleware, /const headers = new Headers\(response\.headers\)/);
  assert.match(middleware, /return new Response\(response\.body/);
  assert.match(middleware, /'Set-Cookie': recoveryRequested/);
  assert.equal(middleware.includes("response.headers.append(\n      'Set-Cookie'"), false);
});

test('recovery toggle은 302 redirect와 cookie를 보존하고 next를 호출하지 않는다', async () => {
  const { onRequest } = await loadMiddleware();
  let nextCalls = 0;
  const response = await onRequest({
    request: new Request('https://app.hiptk.app/?__recovery=1'),
    next: async () => {
      nextCalls += 1;
      return new Response('native');
    }
  });

  assert.equal(response.status, 302);
  assert.equal(response.headers.get('location'), 'https://app.hiptk.app/');
  assert.match(response.headers.get('set-cookie') || '', /^putduk_recovery=1;/);
  assert.equal(response.headers.get('x-putduk-origin'), 'putduk-data-platform-pages');
  assert.equal(response.headers.get('x-putduk-router'), '20260921-v020-cutover1');
  assert.equal(nextCalls, 0);
});

test('ops redirect와 native 응답은 routing fingerprint를 유지한다', async () => {
  const { onRequest } = await loadMiddleware();
  const ops = await onRequest({
    request: new Request('https://ops.hiptk.app/'),
    next: async () => new Response('ops')
  });

  assert.equal(ops.status, 302);
  assert.equal(ops.headers.get('location'), 'https://ops.hiptk.app/admin/');
  assert.equal(ops.headers.get('x-putduk-origin'), 'putduk-data-platform-pages');
  assert.equal(ops.headers.get('x-putduk-router'), '20260921-v020-cutover1');

  const native = await onRequest({
    request: new Request('https://app.hiptk.app/'),
    next: async () => new Response('native', { headers: { 'Clear-Site-Data': '"cache"' } })
  });

  assert.equal(native.status, 200);
  assert.equal(native.headers.get('x-putduk-boot'), 'native-v41');
  assert.equal(native.headers.get('clear-site-data'), null);
  assert.equal(native.headers.get('x-putduk-origin'), 'putduk-data-platform-pages');
  assert.equal(native.headers.get('x-putduk-router'), '20260921-v020-cutover1');
});
