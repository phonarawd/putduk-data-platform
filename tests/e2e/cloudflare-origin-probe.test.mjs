import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { repoPath } from '../helpers/repo.mjs';

test('Cloudflare Pages 응답은 production origin 지문을 남긴다', async () => {
  const middleware = await readFile(repoPath('functions/_middleware.js'), 'utf8');

  assert.match(middleware, /X-Putduk-Origin/);
  assert.match(middleware, /putduk-data-platform-pages/);
  assert.match(middleware, /X-Putduk-Router/);
  assert.match(middleware, /20260919-origin-probe1/);
  assert.match(middleware, /stampOrigin\(await context\.next\(\)\)/);
});
