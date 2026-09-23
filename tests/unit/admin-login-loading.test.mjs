import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const root = new URL('../../', import.meta.url);
const app = fs.readFileSync(new URL('dist/assets/app-ia13.js', root), 'utf8');
const index = fs.readFileSync(new URL('dist/index.html', root), 'utf8');
const adminIndex = fs.readFileSync(new URL('dist/admin/index.html', root), 'utf8');

test('admin authorization renders a safe shell before waiting on the authorization response', () => {
  assert.match(
    app,
    /const authorization = hydrateAdminAuthorization\(\);\s+if \(!state\.modal\) render\(\);\s+await authorization;/
  );
  assert.match(app, /if \(authState\.adminAuthorized\) queueAdminPageData\(\{ silent: true \}\);/);
  assert.match(app, /const page = isAdmin && !authState\.adminAuthorized \? renderAdminGate\(\) : isAdmin \? renderAdminPage\(\) : renderMemberPage\(\);/);
});

test('admin login uses the shared authorization shell path and fresh asset', () => {
  assert.match(app, /await runAdminAuthorization\(\{ toast: true \}\);/);
  assert.match(index, /putduk-boot-v51-member-ia12-pwa-off-perf-fomo-catalog-bg-referral-one-button-admin-login-shell-cloudflare-production-20260924/);
  assert.match(index, /assets\/app-ia12\.js/);
  assert.match(adminIndex, /assets\/app-ia12\.js/);
});

new Function(app);
console.log('admin login loading contract: ok');
