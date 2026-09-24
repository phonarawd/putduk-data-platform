import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const root = new URL('../../', import.meta.url);
const app = fs.readFileSync(new URL('dist/assets/app-ia13.js', root), 'utf8');
const index = fs.readFileSync(new URL('dist/index.html', root), 'utf8');
const adminIndex = fs.readFileSync(new URL('dist/admin/index.html', root), 'utf8');

test('referral copy gives explicit success and failure feedback', () => {
  assert.match(app, /action === 'copy-referral'/);
  assert.equal((app.match(/data-action="copy-referral"/g) || []).length, 1);
  assert.match(app, /navigator\.clipboard\?\.writeText/);
  assert.match(app, /추천 코드를 복사했어요\./);
  assert.match(app, /추천 코드를 복사하지 못했어요\. 코드를 길게 눌러 복사해 주세요\./);
  assert.match(app, /await navigator\.clipboard\.writeText\(code\)/);
  assert.match(app, /function copyTextFallback\(text\)/);
  assert.match(app, /document\.execCommand\('copy'\)/);
  assert.match(app, /else copyTextFallback\(code\)/);
});

test('referral copy ships on fresh member asset ia11', () => {
  assert.match(index, /assets\/app-ia13\.js/);
  assert.match(adminIndex, /assets\/app-ia13\.js/);
});

new Function(app);
console.log('referral copy UX contract: ok');
