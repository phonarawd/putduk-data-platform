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
  'dist/admin/admin.js',
  'dist/assets/phase4-finance-wiring.js',
  'dist/assets/app.css',
  'dist/assets/app.js',
  'dist/assets/overlay-surface.js',
  'dist/assets/overlay-surface.css',
  'dist/assets/channel-talk.js',
  'dist/assets/perf-deferred.js',
  'dist/assets/uiux-final-2026.css',
  'dist/assets/uiux-final-2026.js',
  'dist/assets/uiux-premium-2026.css',
  'dist/assets/uiux-premium-2026.js',
  'dist/assets/uiux-growth-2026.css',
  'dist/assets/uiux-growth-2026.js',
  'dist/assets/uiux-auth-2026.css',
  'dist/assets/uiux-auth-2026.js',
  'dist/assets/uiux-legal-2026.css',
  'dist/assets/uiux-legal-2026.js',
  'dist/assets/uiux-compliance-2026.js',
  'dist/admin/uiux-admin-premium-2026.css',
  'dist/admin/uiux-admin-premium-2026.js',
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
const legalJs = await readFile(join(root, 'dist/assets/uiux-legal-2026.js'), 'utf8');
const complianceJs = await readFile(join(root, 'dist/assets/uiux-compliance-2026.js'), 'utf8');
const sw = await readFile(join(root, 'dist/sw.js'), 'utf8');

await execFileAsync(process.execPath, ['--check', join(root, 'dist/assets/app.js')]);
await execFileAsync(process.execPath, ['--check', join(root, 'dist/admin/phase3-admin-wiring.js')]);
await execFileAsync(process.execPath, ['--check', join(root, 'dist/admin/admin.js')]);
await execFileAsync(process.execPath, ['--check', join(root, 'dist/assets/phase4-finance-wiring.js')]);
await execFileAsync(process.execPath, ['--check', join(root, 'dist/assets/overlay-surface.js')]);
await execFileAsync(process.execPath, ['--check', join(root, 'dist/assets/channel-talk.js')]);
await execFileAsync(process.execPath, ['--check', join(root, 'dist/assets/uiux-final-2026.js')]);
await execFileAsync(process.execPath, ['--check', join(root, 'dist/assets/uiux-premium-2026.js')]);
await execFileAsync(process.execPath, ['--check', join(root, 'dist/assets/uiux-growth-2026.js')]);
await execFileAsync(process.execPath, ['--check', join(root, 'dist/assets/uiux-auth-2026.js')]);
await execFileAsync(process.execPath, ['--check', join(root, 'dist/assets/uiux-legal-2026.js')]);
await execFileAsync(process.execPath, ['--check', join(root, 'dist/assets/uiux-compliance-2026.js')]);
await execFileAsync(process.execPath, ['--check', join(root, 'dist/assets/perf-deferred.js')]);
await execFileAsync(process.execPath, ['--check', join(root, 'dist/admin/uiux-admin-premium-2026.js')]);

if (!memberHtml.includes('lang="ko"') || !adminHtml.includes('lang="ko"')) {
  throw new Error('회원·관리자 문서 언어가 한국어로 설정되어야 합니다.');
}

if (!adminHtml.includes('phase3-admin-wiring.js')) {
  throw new Error('운영자 PHASE 3-1 DB 연결 스크립트가 관리자 셸에 포함되어야 합니다.');
}

if (!memberHtml.includes('phase4-finance-wiring.js')) {
  throw new Error('회원 PHASE 4 입금 증빙 연결 스크립트가 회원 셸에 포함되어야 합니다.');
}

if (!memberHtml.includes('perf-deferred.js')) {
  throw new Error('회원 셸에 perf-deferred.js 지연 로딩 부트스트랩이 포함되어야 합니다.');
}

if (!memberHtml.includes('href="./assets/uiux-final-2026.css') || !memberHtml.includes('src="./assets/uiux-final-2026.js')) {
  throw new Error('회원 셸에 UI/UX FINAL 2026 자산이 포함되어야 합니다.');
}

if (!adminHtml.includes('uiux-final-2026.css') || !adminHtml.includes('uiux-final-2026.js')) {
  throw new Error('운영자 셸에 UI/UX FINAL 2026 자산이 포함되어야 합니다.');
}

if (!memberHtml.includes('uiux-premium-2026.css') || !memberHtml.includes('uiux-premium-2026.js')) {
  throw new Error('회원 셸에 Premium UI/UX 2026 자산이 포함되어야 합니다.');
}

if (!memberHtml.includes('uiux-growth-2026.css') || !memberHtml.includes('uiux-growth-2026.js')) {
  throw new Error('회원 셸에 Growth UI/UX 2026 추천·등급 자산이 포함되어야 합니다.');
}

if (!memberHtml.includes('uiux-auth-2026.css') || !memberHtml.includes('uiux-auth-2026.js')) {
  throw new Error('회원 셸에 Auth UI/UX 2026 로그인·회원가입 자산이 포함되어야 합니다.');
}

if (!memberHtml.includes('uiux-legal-2026.css') || !memberHtml.includes('uiux-legal-2026.js') || !memberHtml.includes('uiux-compliance-2026.js')) {
  throw new Error('회원 셸에 Legal/Compliance UI/UX 2026 자산이 포함되어야 합니다.');
}

if (!adminHtml.includes('uiux-premium-2026.css') || !adminHtml.includes('uiux-admin-premium-2026.css') || !adminHtml.includes('uiux-admin-premium-2026.js')) {
  throw new Error('운영자 셸에 Premium Admin UI/UX 2026 자산이 포함되어야 합니다.');
}

if (!legalJs.includes('퍼뜩 이용약관')
  || !legalJs.includes('개인정보 수집·이용 및 처리 안내')
  || !legalJs.includes('광고성 정보 수신 동의')
  || !legalJs.includes('주민등록번호')) {
  throw new Error('Legal UI에 이용약관·개인정보·광고성 수신·KYC 개인정보 안내가 포함되어야 합니다.');
}

if (!complianceJs.includes('주민등록번호 뒷자리') || !complianceJs.includes('uiux-kyc-privacy-note')) {
  throw new Error('KYC 화면에 불필요한 고유식별정보 마스킹 안내가 포함되어야 합니다.');
}

if (!sw.includes('putduk-member-v35')
  || !sw.includes('putduk-admin-v35')
  || !sw.includes('perf-deferred.js?v=20260920-perf3')
  || !sw.includes('uiux-premium-2026.css?v=20260919-uiux2')
  || !sw.includes('uiux-premium-2026.js?v=20260919-uiux2')
  || !sw.includes('uiux-growth-2026.css?v=20260919-uiux3')
  || !sw.includes('uiux-growth-2026.js?v=20260919-uiux3')
  || !sw.includes('uiux-auth-2026.css?v=20260919-uiux4')
  || !sw.includes('uiux-auth-2026.js?v=20260919-uiux4')
  || !sw.includes('uiux-legal-2026.css?v=20260919-uiux8')
  || !sw.includes('uiux-legal-2026.js?v=20260919-uiux8')
  || !sw.includes('uiux-compliance-2026.js?v=20260919-uiux8')
  || !sw.includes('uiux-admin-premium-2026.css?v=20260919-uiux2')
  || !sw.includes('uiux-admin-premium-2026.js?v=20260919-uiux2')) {
  throw new Error('서비스워커가 FINAL/Premium/Growth/Auth/Legal UI 자산과 v32 캐시를 사용해야 합니다.');
}

for (const forbidden of ['운영자 데모', '미리보기 화면', 'putduk-demo-state']) {
  if (memberHtml.includes(forbidden) || adminHtml.includes(forbidden) || appJs.includes(forbidden)) {
    throw new Error(`출시 화면에 내부 표현이 남아 있습니다: ${forbidden}`);
  }
}

JSON.parse(await readFile(join(root, 'dist/manifest.webmanifest'), 'utf8'));
console.log(`정적 출시 파일 확인 완료: ${requiredFiles.length}개`);
