import test from 'node:test';
import assert from 'node:assert/strict';
import { readLaunchFiles, readRepo } from '../helpers/repo.mjs';

const forbiddenOperatorPhrases = [
  'API 오류',
  'RPC 오류',
  '토큰 오류',
  '데이터베이스 오류',
  'CRUD',
  '테스트 데이터'
];

test('정적 번들에 서비스 롤·비밀 키가 없다', async () => {
  const { memberHtml, adminHtml, appJs } = await readLaunchFiles();
  const channelTalk = await readRepo('dist', 'assets', 'channel-talk.js');
  const haystack = `${memberHtml}\n${adminHtml}\n${appJs}\n${channelTalk}`;
  assert.equal(haystack.includes('service_role'), false);
  assert.equal(haystack.includes('SUPABASE_SERVICE_ROLE_KEY'), false);
  assert.equal(haystack.includes('sb_secret_'), false);
  assert.doesNotMatch(haystack, /eyJ[A-Za-z0-9_-]{20,}\.[A-Za-z0-9_-]{20,}/);
});

test('운영자 금지 기술 문구가 화면에 없다', async () => {
  const { memberHtml, adminHtml, appJs } = await readLaunchFiles();
  const haystack = `${memberHtml}\n${adminHtml}\n${appJs}`;
  for (const phrase of forbiddenOperatorPhrases) {
    assert.equal(haystack.includes(phrase), false, phrase);
  }
});
