import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const adminUi = readFileSync(new URL('../../dist/admin/admin.js', import.meta.url), 'utf8');

test('회원 상세 hydrate는 pack의 pii_access로 PII 안내를 나중에 붙인다', () => {
  assert.match(adminUi, /function memberPiiNoteHtml\(pack\)/);
  assert.match(adminUi, /function hydrateMemberPiiNote\(root, pack\)/);
  assert.match(adminUi, /hydrateMemberPiiNote\(root, pack\)/);
  assert.match(adminUi, /data-member-pii-note/);
  assert.match(adminUi, /전체 휴대폰 번호 표시 중/);
  assert.match(adminUi, /전체 번호는 최고관리자만 볼 수 있습니다/);
});
