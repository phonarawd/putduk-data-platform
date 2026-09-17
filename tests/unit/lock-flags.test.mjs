import test from 'node:test';
import assert from 'node:assert/strict';
import { readLaunchFiles } from '../helpers/repo.mjs';

test('업무·입출금 API 잠금 플래그가 false로 유지된다', async () => {
  const { memberHtml, adminHtml } = await readLaunchFiles();
  for (const [label, html] of [['회원', memberHtml], ['운영자', adminHtml]]) {
    assert.match(html, /enableWorkApi:\s*false/, `${label} enableWorkApi`);
    assert.match(html, /enableFinanceApi:\s*false/, `${label} enableFinanceApi`);
    assert.doesNotMatch(html, /enableWorkApi:\s*true/);
    assert.doesNotMatch(html, /enableFinanceApi:\s*true/);
  }
});

test('브라우저 설정은 publishable key만 사용한다', async () => {
  const { memberHtml, adminHtml } = await readLaunchFiles();
  const html = `${memberHtml}\n${adminHtml}`;
  assert.match(html, /supabasePublishableKey:\s*'sb_publishable_/);
  assert.doesNotMatch(html, /service_role/);
  assert.doesNotMatch(html, /sb_secret_/);
});
