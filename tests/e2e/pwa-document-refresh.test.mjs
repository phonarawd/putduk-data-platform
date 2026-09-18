import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { repoPath } from '../helpers/repo.mjs';

test('PWA 문서는 최신 배포를 먼저 받고 PHASE 4 자산을 셸에 포함한다', async () => {
  const sw = await readFile(repoPath('dist/sw.js'), 'utf8');

  assert.match(sw, /putduk-shell-v19/);
  assert.match(sw, /phase4-finance-wiring\.js\?v=20260919-p4r1/);
  assert.match(sw, /isDocument \? networkFirstDocument\(event\.request\) : staleWhileRevalidate\(event\.request\)/);
  assert.match(sw, /async function networkFirstDocument/);
  assert.match(sw, /const response = await fetch\(request\)/);
  assert.match(sw, /cache\.match\(request, \{ ignoreSearch: true \}\)/);
  assert.doesNotMatch(sw, /return cached \|\| network;\n}\s*$/);
});
