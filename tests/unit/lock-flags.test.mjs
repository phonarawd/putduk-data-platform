import test from 'node:test';
import assert from 'node:assert/strict';
import { readLaunchFiles } from '../helpers/repo.mjs';

test('회원은 근무 API가 열려 있고 입출금은 잠긴다', async () => {
  const { memberHtml } = await readLaunchFiles();
  assert.match(memberHtml, /enableWorkApi:\s*true/);
  assert.doesNotMatch(memberHtml, /enableWorkApi:\s*false/);
  assert.match(memberHtml, /enableFinanceApi:\s*false/);
  assert.doesNotMatch(memberHtml, /enableFinanceApi:\s*true/);
});

test('운영자 셸은 근무·입출금 API가 잠긴다', async () => {
  const { adminHtml } = await readLaunchFiles();
  assert.match(adminHtml, /enableWorkApi:\s*false/);
  assert.doesNotMatch(adminHtml, /enableWorkApi:\s*true/);
  assert.match(adminHtml, /enableFinanceApi:\s*false/);
  assert.doesNotMatch(adminHtml, /enableFinanceApi:\s*true/);
});

test('브라우저 설정은 publishable key만 사용한다', async () => {
  const { memberHtml, adminHtml } = await readLaunchFiles();
  const html = `${memberHtml}\n${adminHtml}`;
  assert.match(html, /supabasePublishableKey:\s*'sb_publishable_/);
  assert.doesNotMatch(html, /service_role/);
  assert.doesNotMatch(html, /sb_secret_/);
});
