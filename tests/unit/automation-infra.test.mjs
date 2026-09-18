import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { encryptPayoutSecret } from '../../src/security/payout-crypto.mjs';

async function read(relativePath) {
  return readFile(new URL(`../../${relativePath}`, import.meta.url), 'utf8');
}

test('지급정보 암호 저장은 키가 없으면 평문으로 돌아가지 않는다', async () => {
  const edge = await read('supabase/functions/_shared/payout-crypto.ts');
  assert.match(edge, /PAYOUT_SECRET_MISSING/);
  assert.doesNotMatch(edge, /if \(!String\(secret \|\| ""\)\.trim\(\)\) return text;/);
  await assert.rejects(
    () => encryptPayoutSecret('plaintext-should-not-save', ''),
    (error) => error.code === 'PAYOUT_SECRET_MISSING'
  );
});

test('운영자 배정 가드 SQL이 GitHub에 있다', async () => {
  const sql = await read('supabase/migrations/20260918111147_putduk_admin_assignment_catalog_guard.sql');
  assert.match(sql, /putduk_admin_assign_task/);
  assert.match(sql, /supply_source is distinct from 'operator'/);
  assert.match(sql, /catalog_status is distinct from 'published'/);
  assert.match(sql, /verification_status::text = 'approved'/);
  assert.match(sql, /logo_usage_status, ''\) = 'approved'/);
});

test('지급정보 DB 가드 SQL이 GitHub에 있다', async () => {
  const sql = await read('supabase/migrations/20260918111839_putduk_payout_ciphertext_guard.sql');
  assert.match(sql, /enc\.v1\./);
  assert.match(sql, /trg_putduk_payout_ciphertext_guard/);
  assert.match(sql, /account_number, usdt_address, encrypted_value/);
});

test('Supabase 배포 워크플로는 비밀 원문을 출력하지 않는다', async () => {
  const yaml = await read('.github/workflows/supabase-deploy.yml');
  assert.match(yaml, /putduk-supabase-production/);
  assert.match(yaml, /contents: read/);
  assert.match(yaml, /version: 2\.113\.0/);
  assert.match(yaml, /preflight-secrets\.sh/);
  assert.match(yaml, /secrets set --project-ref/);
  assert.doesNotMatch(yaml, /echo "\$PUTDUK_PAYOUT_SECRET"/);
  assert.doesNotMatch(yaml, /set -x/);
  assert.doesNotMatch(yaml, /db reset/);
});

test('Cloudflare 배포는 Supabase 성공 뒤에만 이어진다', async () => {
  const yaml = await read('.github/workflows/cloudflare-deploy.yml');
  assert.match(yaml, /putduk-cloudflare-production/);
  assert.match(yaml, /workflows: \["Supabase 배포"\]/);
  assert.match(yaml, /wrangler pages deploy dist/);
  assert.doesNotMatch(yaml, /set -x/);
});
