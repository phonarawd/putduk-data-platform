import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const src = fs.readFileSync(new URL('../../dist/assets/notification-read-contract.js', import.meta.url), 'utf8');

test('opening inbox does not auto-write read_at', () => {
  const openStart = src.indexOf('async function openInbox()');
  const markStart = src.indexOf('async function markAll()');
  const openBody = src.slice(openStart, markStart);
  assert.match(openBody, /await loadRows\(\)/);
  assert.doesNotMatch(openBody, /update\(\{ read_at:/);
  assert.doesNotMatch(openBody, /originalMarkAll/);
});

test('single item delegates to existing single-read contract', () => {
  assert.match(src, /const originalOpenItem = window\.__putdukOpenNoticeItem/);
  assert.match(src, /await originalOpenItem\(id\)/);
});

test('mark all remains explicit', () => {
  assert.match(src, /data-putduk-notice-mark-all/);
  assert.match(src, /await originalMarkAll\(\)/);
});

test('visible rows come from notifications RLS query', () => {
  assert.match(src, /\.from\('notifications'\)/);
  assert.match(src, /\.select\('id,title,body,notification_type,created_at,read_at'\)/);
  assert.match(src, /\.eq\('user_id', session\.user\.id\)/);
  assert.doesNotMatch(src, /member_hidden_at/);
});

test('title, body, read state and mobile surface are explicit', () => {
  assert.match(src, /putduk-notice-copy/);
  assert.match(src, /안 읽음/);
  assert.match(src, /읽음/);
  assert.match(src, /@media\(max-width:640px\)/);
  assert.match(src, /min-height:44px/);
});

test('does not create a second realtime subscription', () => {
  assert.doesNotMatch(src, /postgres_changes/);
  assert.doesNotMatch(src, /\.channel\(/);
  assert.match(src, /MutationObserver/);
});
