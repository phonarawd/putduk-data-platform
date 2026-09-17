import { execFile } from 'node:child_process';
import { readdir } from 'node:fs/promises';
import { extname, join } from 'node:path';
import { promisify } from 'node:util';

const execFileAsync = promisify(execFile);
const root = process.cwd();

async function collectJsFiles(dir) {
  const entries = await readdir(dir, { withFileTypes: true });
  const files = [];
  for (const entry of entries) {
    const fullPath = join(dir, entry.name);
    if (entry.isDirectory()) {
      if (['node_modules', '.git', '.turbo', 'playwright-report', 'test-results', '.lighthouseci'].includes(entry.name)) {
        continue;
      }
      files.push(...await collectJsFiles(fullPath));
      continue;
    }
    if (['.js', '.mjs', '.cjs'].includes(extname(entry.name))) {
      files.push(fullPath);
    }
  }
  return files;
}

const files = (await Promise.all([
  collectJsFiles(join(root, 'dist')),
  collectJsFiles(join(root, 'tooling')),
  collectJsFiles(join(root, 'scripts')),
  collectJsFiles(join(root, 'tests'))
])).flat();

for (const file of files) {
  await execFileAsync(process.execPath, ['--check', file]);
}

console.log(`문법 확인 완료: ${files.length}개 JS 파일`);
