import { access, readFile } from 'node:fs/promises';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';

const root = process.cwd();
await import(pathToFileURL(join(root, 'tooling/scripts/sync-overlay-surface.mjs')).href);
await import(pathToFileURL(join(root, 'tooling/scripts/sync-channel-talk.mjs')).href);
const execFileAsync = promisify(execFile);
const requiredFiles = [
  'dist/index.html',
  'dist/admin/index.html',
  'dist/admin/phase3-admin-wiring.js',
  'dist/assets/phase4-finance-wiring.js',
  'dist/assets/app.css',
  'dist/assets/app.js',
  'dist/assets/overlay-surface.js',
  'dist/assets/overlay-surface.css',
  'dist/assets/channel-talk.js',
  'dist/assets/uiux-final-2026.css',
  'dist/assets/uiux-final-2026.js',
  'dist/assets/uiux-premium-2026.css',
  'dist/assets/uiux-premium-2026.js',
  'dist/manifest.webmanifest',
  'dist/sw.js',
  'dist/_headers',
  'dist/_redirects',
  'dist/favicon.svg',
  'dist/icons/icon-180.png',
  'dist/icons/icon-192.png',
  'dist/icons/icon-512.png'
];

for (const relativePath of requiredFiles) {
  await access(join(root, relativePath));
}

const memberHtml = await readFile(join(root, 'dist/index.html'), 'utf8');
const adminHtml = await readFile(join(root, 'dist/admin/index.html'), 'utf8');
const appJs = await readFile(join(root, 'dist/assets/app.js'), 'utf8');
const sw = await readFile(join(root, 'dist/sw.js'), 'utf8');

await execFileAsync(process.execPath, ['--check', join(root, 'dist/assets/app.js')]);
await execFileAsync(process.execPath, ['--check', join(root, 'dist/admin/phase3-admin-wiring.js')]);
await execFileAsync(process.execPath, ['--check', join(root, 'dist/assets/phase4-finance-wiring.js')]);
await execFileAsync(process.execPath, ['--check', join(root, 'dist/assets/overlay-surface.js')]);
await execFileAsync(process.execPath, ['--check', join(root, 'dist/assets/channel-talk.js')]);
await execFileAsync(process.execPath, ['--check', join(root, 'dist/assets/uiux-final-2026.js')]);
await execFileAsync(process.execPath, ['--check', join(root, 'dist/assets/uiux-premium-2026.js')]);

if (!memberHtml.includes('lang="ko"') || !adminHtml.includes('lang="ko"')) {
  throw new Error('회원·관리자 문서 언어가 한국어로 설정되어야 합니다.');
}

if (!adminHtml.includes('phase3-admin-wiring.js')) {
  throw new Error('운영자 PHASE 3-1 DB 연결 스크립트가 관리자 셸에 포함되어야 합니다.');
}

if (!memberHtml.includes('phase4-finance-wiring.js')) {
  throw new Error('회원 PHASE 4 입금 증빙 연결 스크립트가 회원 셸에 포함되어야 합니다.');
}

if (!memberHtml.includes('uiux-final-2026.css') || !memberHtml.includes('uiux-final-2026.js')) {
  throw new Error('회원 셸에 UI/UX FINAL 2026 자산이 포함되어야 합니다.');
}

if (!adminHtml.includes('uiux-final-2026.css') || !adminHtml.includes('uiux-final-2026.js')) {
  throw new Error('운영자 셸에 UI/UX FINAL 2026 자산이 포함되어야 합니다.');
}

if (!memberHtml.includes('uiux-premium-2026.css') || !memberHtml.includes('uiux-premium-2026.js')) {
  throw new Error('회원 셸에 Premium UI/UX 2026 자산이 포함되어야 합니다.');
}

if (!adminHtml.includes('uiux-premium-2026.css')) {
  throw new Error('운영자 셸에 Premium UI/UX 2026 스타일이 포함되어야 합니다.');
}

if (!sw.includes("putduk-shell-v25") || !sw.includes('uiux-premium-2026.css?v=20260919-uiux2') || !sw.includes('uiux-premium-2026.js?v=20260919-uiux2')) {
  throw new Error('서비스워커가 Premium UI/UX 2026 자산과 v25 캐시를 사용해야 합니다.');
}

for (const forbidden of ['운영자 데모', '미리보기 화면', 'putduk-demo-state']) {
  if (memberHtml.includes(forbidden) || adminHtml.includes(forbidden) || appJs.includes(forbidden)) {
    throw new Error(`출시 화면에 내부 표현이 남아 있습니다: ${forbidden}`);
  }
}

JSON.parse(await readFile(join(root, 'dist/manifest.webmanifest'), 'utf8'));
console.log(`정적 출시 파일 확인 완료: ${requiredFiles.length}개`);
