import test from 'node:test';
import assert from 'node:assert/strict';
import { readRepo } from '../helpers/repo.mjs';
import { encryptPayoutSecret, isPayoutCiphertext } from '../../src/security/payout-crypto.mjs';

test('member payout guard는 enc.v1이 아니면 거절한다', async () => {
  const migration = await readRepo('supabase', 'migrations', '20260919120000_putduk_phase5_kyc_payout_security.sql');
  assert.match(migration, /putduk_member_payout_ciphertext_guard/);
  assert.match(migration, /account_holder not like 'enc\.v1\./);
  assert.match(migration, /account_number not like 'enc\.v1\./);
  assert.match(migration, /usdt_address not like 'enc\.v1\./);
});

test('Edge member-finance는 암호화 후 RPC에 ciphertext를 전달한다', async () => {
  const edge = await readRepo('supabase', 'functions', 'member-finance', 'index.ts');
  assert.match(edge, /encryptPayoutSecret/);
  assert.match(edge, /payoutSecretFromEnv/);
  assert.match(edge, /PAYOUT_SECRET_MISSING/);
  assert.match(edge, /p_masked_value/);
  assert.match(edge, /p_account_number: accountNumberEnc/);
  assert.doesNotMatch(edge, /plaintext fallback|평문 저장/i);
});

test('키 없으면 Edge encryptPayoutSecret은 503으로 fail closed', async () => {
  const edgeCrypto = await readRepo('supabase', 'functions', '_shared', 'payout-crypto.ts');
  const encryptBlock = edgeCrypto.slice(edgeCrypto.indexOf('export async function encryptPayoutSecret'), edgeCrypto.indexOf('export async function decryptPayoutSecret'));
  assert.match(encryptBlock, /PAYOUT_SECRET_MISSING/);
  assert.match(encryptBlock, /throw error/);
});

test('암호문은 enc.v1 prefix를 유지한다', async () => {
  const cipher = await encryptPayoutSecret('test-account', 'phase5-unit-secret');
  assert.equal(isPayoutCiphertext(cipher), true);
  assert.doesNotMatch(String(cipher), /test-account/);
});

test('withdrawal_requests.destination_id FK가 migration에 있다', async () => {
  const migration = await readRepo('supabase', 'migrations', '20260919120000_putduk_phase5_kyc_payout_security.sql');
  assert.match(migration, /destination_id uuid references private\.member_payout_destinations/);
  assert.match(migration, /destination_id,/);
});

test('admin reveal는 finance role·audit·no-store 응답 경로가 있다', async () => {
  const adminOps = await readRepo('supabase', 'functions', '_shared', 'admin-ops.ts');
  const adminJs = await readRepo('dist', 'admin', 'admin.js');
  assert.match(adminOps, /revealWithdrawalDestination/);
  assert.match(adminOps, /출금 지급정보 reveal/);
  assert.match(adminOps, /decryptPayoutSecret/);
  assert.match(adminJs, /reveal_withdrawal_destination/);
  assert.match(adminJs, /destination_masked|지급정보 보기/);
  assert.match(adminJs, /close-withdrawal-reveal/);
  assert.doesNotMatch(adminJs, /localStorage.*account_number|sessionStorage.*usdt_address/);
});

test('audit JSON에 plaintext account_number를 넣지 않는다', async () => {
  const adminOps = await readRepo('supabase', 'functions', '_shared', 'admin-ops.ts');
  const auditStart = adminOps.indexOf('await appendAudit(', adminOps.indexOf('revealWithdrawalDestination'));
  const auditEnd = adminOps.indexOf(');', auditStart) + 2;
  const auditBlock = adminOps.slice(auditStart, auditEnd);
  assert.doesNotMatch(auditBlock, /account_number|usdt_address|account_holder/);
  assert.match(auditBlock, /masked:/);
});
