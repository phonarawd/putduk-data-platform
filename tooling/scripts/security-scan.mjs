import { readFile, readdir } from 'node:fs/promises';
import { extname, join } from 'node:path';
import { scanBlockedForeignRepos, shouldSkipWalkDir } from './block-foreign-repos.mjs';

const root = process.cwd();
const secretPatterns = [
  { name: 'service_role 키', regex: /service_role/i, allowIn: [/docs\//, /PUTDUK_CURSOR_HANDOFF_FINAL\.md$/, /README\.md$/, /tooling\/scripts\/security-scan\.mjs$/, /tests\/unit\/security-invariants\.test\.mjs$/, /scripts\/automation\//, /supabase\/functions\//] },
  { name: '서비스 롤 환경변수', regex: /SUPABASE_SERVICE_ROLE_KEY/, allowIn: [/docs\//, /PUTDUK_CURSOR_HANDOFF_FINAL\.md$/, /scripts\/automation\//, /supabase\/functions\//, /\.github\//, /tooling\/scripts\/security-scan\.mjs$/] },
  { name: 'sb_secret', regex: /sb_secret_[A-Za-z0-9_-]+/, allowIn: [/tooling\/scripts\/security-scan\.mjs$/, /tests\//] },
  { name: 'JWT 형태 비밀', regex: /eyJ[A-Za-z0-9_-]{20,}\.[A-Za-z0-9_-]{20,}/, allowIn: [] }
];

const forbiddenPhrases = ['API 오류', 'RPC 오류', '토큰 오류', '데이터베이스 오류'];
const distOnlyFiles = [];

async function walk(dir) {
  const entries = await readdir(dir, { withFileTypes: true });
  const files = [];
  for (const entry of entries) {
    const fullPath = join(dir, entry.name);
    if (entry.isDirectory()) {
      // 차단 레포 폴더는 내용을 읽지 않고 건너뛴다.
      if (shouldSkipWalkDir(entry.name)) continue;
      files.push(...await walk(fullPath));
      continue;
    }
    if (['.png', '.jpg', '.jpeg', '.webp', '.gif', '.woff', '.woff2'].includes(extname(entry.name))) continue;
    files.push(fullPath);
  }
  return files;
}

function relativePosix(file) {
  return file.slice(root.length + 1).replaceAll('\\', '/');
}

const files = await walk(root);
const failures = [];
const blocked = await scanBlockedForeignRepos({ root });
failures.push(...blocked.failures);
for (const warning of blocked.warnings) console.warn(warning);

for (const file of files) {
  const relative = relativePosix(file);
  const text = await readFile(file, 'utf8');
  if (relative.startsWith('dist/')) distOnlyFiles.push({ relative, text });

  for (const rule of secretPatterns) {
    if (!rule.regex.test(text)) continue;
    if (rule.allowIn.some((pattern) => pattern.test(relative))) continue;
    if (relative.startsWith('dist/')) {
      failures.push(`${relative}: 브라우저 산출물에 ${rule.name}이(가) 있습니다.`);
    }
  }
}

for (const { relative, text } of distOnlyFiles) {
  for (const phrase of forbiddenPhrases) {
    if (text.includes(phrase)) {
      failures.push(`${relative}: 운영자 금지 문구 "${phrase}"`);
    }
  }
}

if (failures.length) {
  console.error('보안 검사 실패');
  for (const item of failures) console.error(`- ${item}`);
  process.exit(1);
}

console.log(`보안 검사 통과: 파일 ${files.length}개`);
