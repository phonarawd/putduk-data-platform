import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { repoPath } from '../helpers/repo.mjs';

test('PWA 문서는 최신 배포를 먼저 받고 PHASE 4 자산을 셸에 포함한다', async () => {
  const sw = await readFile(repoPath('dist/sw.js'), 'utf8');

  assert.match(sw, /putduk-sw-push-v1/);
  assert.match(sw, /addEventListener\('push'/);
  assert.match(sw, /event\.respondWith\(fetch\(event\.request\)\)/);
  assert.doesNotMatch(sw, /cache\.addAll/);
  assert.doesNotMatch(sw, /staleWhileRevalidate/);
  assert.doesNotMatch(sw, /networkFirstDocument/);
});
