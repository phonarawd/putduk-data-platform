import { access, readFile } from 'node:fs/promises';
import { join } from 'node:path';

const root = process.cwd();
const configPath = join(root, 'lighthouserc.json');
await access(configPath);
const config = JSON.parse(await readFile(configPath, 'utf8'));

if (!config.ci?.collect?.url?.length) {
  throw new Error('lighthouserc.json에 수집 URL이 없습니다.');
}

const css = await readFile(join(root, 'dist/assets/app.css'), 'utf8');
const js = await readFile(join(root, 'dist/assets/app.js'), 'utf8');

if (!css.includes('prefers-reduced-motion')) {
  throw new Error('성능 기준: prefers-reduced-motion 폴백이 없습니다.');
}

if (!js.includes('devicePixelRatio')) {
  throw new Error('성능 기준: Canvas DPR 조절 코드가 없습니다.');
}

if (process.env.PUTDUK_RUN_LIGHTHOUSE === '1') {
  const { execFile } = await import('node:child_process');
  const { promisify } = await import('node:util');
  const execFileAsync = promisify(execFile);
  await execFileAsync('pnpm', ['dlx', '@lhci/cli', 'autorun'], {
    cwd: root,
    stdio: 'inherit',
    shell: true
  });
} else {
  console.log('Lighthouse 실측은 PUTDUK_RUN_LIGHTHOUSE=1 일 때만 실행합니다. 설정·폴백 검사는 통과했습니다.');
}
