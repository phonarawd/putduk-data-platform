import { access, readFile } from 'node:fs/promises';
import { join } from 'node:path';

const root = process.cwd();
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

for (const relativePath of requiredFiles) {
  await access(join(root, relativePath));
}

const memberHtml = await readFile(join(root, 'dist/index.html'), 'utf8');
const adminHtml = await readFile(join(root, 'dist/admin/index.html'), 'utf8');
const appJs = await readFile(join(root, 'dist/assets/app.js'), 'utf8');

if (!memberHtml.includes('lang="ko"') || !adminHtml.includes('lang="ko"')) {
  throw new Error('회원·관리자 문서 언어가 한국어로 설정되어야 합니다.');
}

for (const forbidden of ['운영자 데모', '미리보기 화면', 'putduk-demo-state']) {
  if (memberHtml.includes(forbidden) || adminHtml.includes(forbidden) || appJs.includes(forbidden)) {
    throw new Error(`출시 화면에 내부 표현이 남아 있습니다: ${forbidden}`);
  }
}

JSON.parse(await readFile(join(root, 'dist/manifest.webmanifest'), 'utf8'));
console.log(`정적 출시 파일 확인 완료: ${requiredFiles.length}개`);
