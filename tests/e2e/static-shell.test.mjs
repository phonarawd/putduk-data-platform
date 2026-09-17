import test from 'node:test';
import assert from 'node:assert/strict';
import { repoPath } from '../helpers/repo.mjs';
import { startStaticServer } from '../../tooling/scripts/serve-dist.mjs';

async function fetchText(url) {
  const response = await fetch(url);
  const text = await response.text();
  return { status: response.status, text, contentType: response.headers.get('content-type') || '' };
}

test('정적 셸 경로가 회원·운영자·PWA 파일을 제공한다', async (t) => {
  const started = await startStaticServer(repoPath('dist'));
  t.after(() => started.close());

  const member = await fetchText(`${started.url}/`);
  assert.equal(member.status, 200);
  assert.match(member.text, /lang="ko"/);
  assert.match(member.text, /data-mode="member"/);
  assert.match(member.text, /enableWorkApi:\s*false/);

  const admin = await fetchText(`${started.url}/admin/`);
  assert.equal(admin.status, 200);
  assert.match(admin.text, /data-mode="admin"/);
  assert.match(admin.text, /퍼뜩/);

  const manifest = await fetchText(`${started.url}/manifest.webmanifest`);
  assert.equal(manifest.status, 200);
  const parsed = JSON.parse(manifest.text);
  assert.equal(parsed.lang, 'ko-KR');

  const sw = await fetchText(`${started.url}/sw.js`);
  assert.equal(sw.status, 200);
  assert.match(sw.text, /putduk-shell/);

  const favicon = await fetchText(`${started.url}/favicon.svg`);
  assert.equal(favicon.status, 200);

  for (const icon of ['icon-180.png', 'icon-192.png', 'icon-512.png']) {
    const response = await fetch(`${started.url}/icons/${icon}`);
    assert.equal(response.status, 200, icon);
  }
});
