import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { repoPath } from '../helpers/repo.mjs';

test('Cloudflare middleware는 모든 응답에 origin/router 지문을 남긴다', async () => {
  const middleware = await readFile(repoPath('functions/_middleware.js'), 'utf8');

  assert.match(middleware, /X-Putduk-Origin/);
  assert.match(middleware, /putduk-data-platform-pages/);
  assert.match(middleware, /X-Putduk-Router/);
  assert.match(middleware, /20260921-v020-cutover1/);
  assert.match(middleware, /withRoutingHeaders\(await context\.next\(\)\)/);
  assert.match(middleware, /return withRoutingHeaders\(Response\.redirect\(url\.toString\(\), 302\)\)/);
});

test('recovery/native redirect는 immutable Response.redirect headers를 직접 수정하지 않는다', async () => {
  const middleware = await readFile(repoPath('functions/_middleware.js'), 'utf8');

  assert.match(middleware, /function withRoutingHeaders\(response, extraHeaders = \{\}\)/);
  assert.match(middleware, /const headers = new Headers\(response\.headers\)/);
  assert.match(middleware, /return new Response\(response\.body/);
  assert.match(middleware, /'Set-Cookie': recoveryRequested/);
  assert.equal(middleware.includes("response.headers.append(\n      'Set-Cookie'"), false);
});
