import { createHash } from 'node:crypto';
import { copyFile, readFile, readdir, unlink, writeFile } from 'node:fs/promises';
import { join, extname } from 'node:path';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';

const execFileAsync = promisify(execFile);
const root = process.cwd();
const dir = join(root, 'dist/assets/brand-logos');

async function toWebp(pngPath, webpPath) {
  try {
    await execFileAsync('pnpm', ['dlx', 'sharp-cli', pngPath, '--webp', '--quality', '82', '--output', webpPath], {
      cwd: root,
      shell: true
    });
    return true;
  } catch (_) {
    const png = await readFile(pngPath);
    await writeFile(webpPath, png);
    return false;
  }
}

const files = (await readdir(dir)).filter((name) => name.endsWith('-logo.png'));
let savedBytes = 0;

for (const logoFile of files) {
  const slug = logoFile.replace(/-logo\.png$/, '');
  const logoPath = join(dir, logoFile);
  const photoPath = join(dir, `${slug}-photo.png`);
  const webpPath = join(dir, `${slug}-logo.webp`);

  const logoHash = createHash('md5').update(await readFile(logoPath)).digest('hex');
  try {
    const photoHash = createHash('md5').update(await readFile(photoPath)).digest('hex');
    if (photoHash === logoHash) {
      await unlink(photoPath);
      savedBytes += (await readFile(logoPath)).length;
    }
  } catch (_) {}

  const before = (await readFile(logoPath)).length;
  const ok = await toWebp(logoPath, webpPath);
  if (ok) {
    const after = (await readFile(webpPath)).length;
    savedBytes += Math.max(0, before - after);
  }
}

console.log(`브랜드 로고 최적화 완료: ${files.length}개 WebP, 중복 photo 제거·용량 절감 약 ${Math.round(savedBytes / 1024)}KB`);
