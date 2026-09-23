import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

const root = path.resolve(import.meta.dirname, '../..');
const app = fs.readFileSync(path.join(root, 'dist/assets/app.js'), 'utf8');
const bundle = fs.readFileSync(path.join(root, 'dist/assets/app-quota5.js'), 'utf8');
const lineUx = fs.readFileSync(path.join(root, 'dist/assets/line-card-ux.js'), 'utf8');
const index = fs.readFileSync(path.join(root, 'dist/index.html'), 'utf8');
const adminIndex = fs.readFileSync(path.join(root, 'dist/admin/index.html'), 'utf8');
const perfDeferred = fs.readFileSync(path.join(root, 'dist/assets/perf-deferred.js'), 'utf8');

assert.match(app, /id: 'dashboard', label: '근무'/);
assert.match(app, /id: 'nodes', label: '업무 매칭'/);
assert.match(app, /id: 'history', label: '내역'/);
assert.match(app, /id: 'wallet', label: '지갑'/);
assert.match(app, /id: 'referrals', label: '추천'/);
assert.match(app, /id: 'membership', label: '사원증'/);
assert.match(app, /id: 'support', label: '도움말'/);
assert.doesNotMatch(app, /id: 'nodes', label: '라인 찾기'/);
assert.doesNotMatch(app, /data-modal="onboard-pwa"/);
assert.doesNotMatch(app, /pwa_home/);
assert.doesNotMatch(app, /state\.onboardingStep = 'pwa'/);
assert.match(app, /function initializePwa\(\)/);
assert.match(app, /data-action="install-app"/);
assert.match(lineUx, /\['업무 매칭'\]/);
assert.doesNotMatch(lineUx, /\['라인 찾기'/);
assert.equal(app, bundle);
assert.match(index, /putduk-boot-v50-member-ia11-pwa-off-perf-fomo-catalog-bg-referral-copy-one-button-cloudflare-production-20260924/);
assert.match(index, /assets\\/app-ia13\\.js/);
assert.match(adminIndex, /assets\\/app-ia13\\.js/);
assert.doesNotMatch(index, /assets\\/motion-runtime\\.js/);
assert.match(index, /assets\\/perf-deferred\\.js/);
assert.match(perfDeferred, /requestIdleCallback/);
assert.match(perfDeferred, /ensure\('motion'\)/);

new Function(app);
new Function(lineUx);
console.log('member IA + referral + PWA presentation removal contract: ok');
