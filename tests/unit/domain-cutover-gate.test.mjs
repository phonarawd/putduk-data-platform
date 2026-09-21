import test from 'node:test';
import assert from 'node:assert/strict';
import { readRepo } from '../helpers/repo.mjs';

test('v0.2.0 release는 명시적 member/ops domain 없이는 fail-closed한다', async () => {
  const pkg = JSON.parse(await readRepo('package.json'));
  const release = await readRepo('scripts/automation/release.mjs');
  const audit = await readRepo('tooling/cloudflare/domain-cutover-audit.mjs');
  const doc = await readRepo('docs/v0.2.0-domain-cutover.md');
  const stage12 = await readRepo('docs/stage12-release-freeze.md');

  assert.equal(pkg.scripts?.['domain:audit'], 'node tooling/cloudflare/domain-cutover-audit.mjs');
  assert.equal(pkg.scripts?.['release:domain'], 'node tooling/cloudflare/domain-cutover-audit.mjs --require-target');
  assert.match(release, /domain-cutover-audit\.mjs/);
  assert.match(release, /--require-target/);

  for (const token of [
    'MEMBER_URL',
    'MEMBER_DOMAIN',
    'OPS_URL',
    'OPS_DOMAIN',
    'dist/index.html',
    'dist/admin/index.html',
    'dist/assets/origin-split.js',
    'dist/robots.txt',
    'dist/sitemap.xml',
    'functions/_middleware.js'
  ]) {
    assert.match(audit, new RegExp(token.replace(/[.*+?^${}()|[\\]\\]/g, '\\$&')), token);
  }

  assert.match(audit, /Domain cutover: PENDING/);
  assert.match(audit, /process\.exit\(2\)/);
  assert.match(doc, /PENDING \/ BLOCKED UNTIL DOMAIN MAPPING IS EXPLICIT/);
  assert.match(doc, /stage12-release-freeze\.md/);
  assert.match(doc, /PUTDUK_ALLOWED_ORIGINS/);
  assert.match(doc, /member-task-detail/);
  assert.match(doc, /admin-work-asset/);

  assert.match(stage12, /SUPERSEDED/);
  assert.match(stage12, /v0\.2\.0-domain-cutover\.md/);
  assert.match(stage12, /PENDING \/ BLOCKED UNTIL DOMAIN MAPPING IS EXPLICIT/);
  assert.doesNotMatch(stage12, /현재 Stage 12 PR 생성 조건은 충족한다/);
});
