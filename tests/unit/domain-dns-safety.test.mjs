import test from 'node:test';
import assert from 'node:assert/strict';
import { readRepo } from '../helpers/repo.mjs';

const releaseExecutables = [
  '.github/workflows/release.yml',
  'scripts/automation/release.mjs',
  'tooling/cloudflare/domain-cutover-audit.mjs',
  'tooling/cloudflare/verify-deployment.mjs',
  'functions/_middleware.js'
];

const dnsWritePatterns = [
  /api\.cloudflare\.com\/client\/v4\/zones/i,
  /\/dns_records\b/i,
  /\bwrangler\s+dns\b/i,
  /\bcloudflare\s+dns\b/i,
  /\bdns(?:-|_)record(?:s)?\s+(?:create|update|delete|put|post|patch)\b/i
];

test('v0.2.0 release 실행 경로는 Cloudflare DNS record를 직접 변경하지 않는다', async () => {
  for (const path of releaseExecutables) {
    const source = await readRepo(path);
    for (const pattern of dnsWritePatterns) {
      assert.doesNotMatch(source, pattern, `${path}: ${pattern}`);
    }
  }
});

test('정적 release workflow는 Pages Git Integration과 read-only 검증 경로만 사용한다', async () => {
  const [workflow, redirects, headers] = await Promise.all([
    readRepo('.github/workflows/release.yml'),
    readRepo('dist/_redirects'),
    readRepo('dist/_headers')
  ]);

  assert.match(workflow, /pnpm release:domain/);
  assert.match(workflow, /pnpm release:deploy/);
  assert.match(workflow, /pnpm cf:verify/);
  assert.match(workflow, /Pages Git Integration/);
  assert.doesNotMatch(workflow, /CLOUDFLARE_API_TOKEN/);
  assert.doesNotMatch(workflow, /CLOUDFLARE_ZONE_ID/);

  assert.equal(redirects.trim(), '/admin /admin/ 301');
  assert.match(headers, /Content-Security-Policy:/);
  assert.doesNotMatch(headers, /\b(?:MX|SPF|DKIM|Resend)\b/i);
});
