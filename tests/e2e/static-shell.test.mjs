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
  assert.match(member.text, /enableWorkApi:\s*true/);
  assert.match(member.text, /enableFinanceApi:\s*true/);
  assert.match(member.text, /channel-talk\.js/);
  assert.match(member.text, /channelPluginKey/);

  const admin = await fetchText(`${started.url}/admin/`);
  assert.equal(admin.status, 200);
  assert.match(admin.text, /data-mode="admin"/);
  assert.match(admin.text, /퍼뜩/);
  assert.match(admin.text, /adminFunctionUrl:\s*'https:\/\/gaugwamwceqdnqdqrxqg\.supabase\.co\/functions\/v1\/admin-phase5'/);
  assert.match(admin.text, /phase3-admin-wiring\.js/);

  const phase31 = await fetchText(`${started.url}/admin/phase3-admin-wiring.js`);
  assert.equal(phase31.status, 200);
  assert.match(phase31.text, /list_members/);
  assert.match(phase31.text, /get_member/);
  assert.match(phase31.text, /member_activity/);
  assert.match(phase31.text, /data-phase31-member-page/);
  assert.match(phase31.text, /수동 배정 내역/);
  assert.match(phase31.text, /감사 로그/);

  const manifest = await fetchText(`${started.url}/manifest.webmanifest`);
  assert.equal(manifest.status, 200);
  const parsed = JSON.parse(manifest.text);
  assert.equal(parsed.lang, 'ko-KR');

  const sw = await fetchText(`${started.url}/sw.js`);
  assert.equal(sw.status, 200);
  assert.match(sw.text, /putduk-sw-off-v37/);
  assert.match(sw.text, /unregister/);

  const favicon = await fetchText(`${started.url}/favicon.svg`);
  assert.equal(favicon.status, 200);

  for (const icon of ['icon-180.png', 'icon-192.png', 'icon-512.png']) {
    const response = await fetch(`${started.url}/icons/${icon}`);
    assert.equal(response.status, 200, icon);
  }
});

test('운영자 포트 루트는 회원 화면이 아니라 운영자 셸이다', async (t) => {
  const started = await startStaticServer(repoPath('dist'), { opsMode: true });
  t.after(() => started.close());

  const root = await fetchText(`${started.url}/`);
  assert.equal(root.status, 200);
  assert.match(root.text, /data-mode="admin"/);
  assert.doesNotMatch(root.text, /data-mode="member"/);
  assert.match(root.text, /운영자 관리센터/);
  assert.match(root.text, /phase3-admin-wiring\.js/);

  const indexHtml = await fetchText(`${started.url}/index.html`);
  assert.match(indexHtml.text, /data-mode="admin"/);
  assert.doesNotMatch(indexHtml.text, /data-mode="member"/);

  const phase31 = await fetchText(`${started.url}/admin/phase3-admin-wiring.js`);
  assert.equal(phase31.status, 200);
  assert.match(phase31.text, /phase31MemberPage/);

  const assets = await fetchText(`${started.url}/assets/origin-split.js`);
  assert.equal(assets.status, 200);
  assert.match(assets.text, /isOpsHost/);

  const overlay = await fetchText(`${started.url}/assets/overlay-surface.js`);
  assert.equal(overlay.status, 200);
  assert.match(overlay.text, /PutdukOverlaySurface/);
});
