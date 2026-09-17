import test from 'node:test';
import assert from 'node:assert/strict';
import { existsRepo, readLaunchFiles, readRepo } from '../helpers/repo.mjs';

const requiredFiles = [
  'dist/index.html',
  'dist/admin/index.html',
  'dist/assets/app.css',
  'dist/assets/app.js',
  'dist/manifest.webmanifest',
  'dist/sw.js',
  'dist/_headers',
  'dist/_redirects',
  'dist/favicon.svg',
  'dist/icons/icon-180.png',
  'dist/icons/icon-192.png',
  'dist/icons/icon-512.png'
];

test('핸드오프에 적힌 정적 출시 파일이 있다', async () => {
  for (const relativePath of requiredFiles) {
    assert.equal(await existsRepo(...relativePath.split('/')), true, relativePath);
  }
});

test('회원·운영자 문서는 한국어이고 경로가 분리되어 있다', async () => {
  const { memberHtml, adminHtml } = await readLaunchFiles();
  assert.match(memberHtml, /lang="ko"/);
  assert.match(adminHtml, /lang="ko"/);
  assert.match(memberHtml, /data-mode="member"/);
  assert.match(adminHtml, /data-mode="admin"/);
  assert.match(memberHtml, /퍼뜩/);
  assert.match(adminHtml, /퍼뜩/);
});

test('PWA 매니페스트가 유효하고 한국어다', async () => {
  const manifest = JSON.parse(await readRepo('dist', 'manifest.webmanifest'));
  assert.equal(manifest.lang, 'ko-KR');
  assert.equal(manifest.display, 'standalone');
  assert.ok(Array.isArray(manifest.icons) && manifest.icons.length >= 2);
  assert.match(String(manifest.name), /퍼뜩/);
});

test('출시 화면에 내부 데모 표현이 없다', async () => {
  const { memberHtml, adminHtml, appJs } = await readLaunchFiles();
  const haystack = `${memberHtml}\n${adminHtml}\n${appJs}`;
  for (const forbidden of ['운영자 데모', '미리보기 화면', 'putduk-demo-state']) {
    assert.equal(haystack.includes(forbidden), false, forbidden);
  }
});
