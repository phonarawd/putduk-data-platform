import test from 'node:test';
import assert from 'node:assert/strict';
import { readRepo } from '../helpers/repo.mjs';

test('Cloudflare 운영 검증은 legacy production domain을 기본값으로 사용하지 않는다', async () => {
  const verifier = await readRepo('tooling/cloudflare/verify-deployment.mjs');
  assert.doesNotMatch(verifier, /MEMBER_DOMAIN \|\| "https:\/\/app\.hiptk\.app"/);
  assert.doesNotMatch(verifier, /OPS_DOMAIN \|\| "https:\/\/ops\.hiptk\.app"/);
  assert.match(verifier, /MEMBER_URL\/MEMBER_DOMAIN/);
  assert.match(verifier, /OPS_URL\/OPS_DOMAIN/);
  assert.match(verifier, /explicit production domains are required/i);
});
