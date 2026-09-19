import { access, readFile } from 'node:fs/promises';
import { join } from 'node:path';

const root = process.cwd();
const configPath = join(root, 'lighthouserc.json');
await access(configPath);
const config = JSON.parse(await readFile(configPath, 'utf8'));

if (!config.ci?.collect?.url?.length) {
  throw new Error('lighthouserc.json에 수집 URL이 없습니다.');
}

const memberHtml = await readFile(join(root, 'dist/index.html'), 'utf8');
const css = await readFile(join(root, 'dist/assets/app.css'), 'utf8');
const js = await readFile(join(root, 'dist/assets/app.js'), 'utf8');
const perfDeferred = await readFile(join(root, 'dist/assets/perf-deferred.js'), 'utf8');

if (!css.includes('prefers-reduced-motion')) {
  throw new Error('성능 기준: prefers-reduced-motion 폴백이 없습니다.');
}

if (!css.includes('data-low-perf')) {
  throw new Error('성능 기준: 저사양 backdrop-filter 축소 규칙이 없습니다.');
}

if (!js.includes('devicePixelRatio')) {
  throw new Error('성능 기준: Canvas DPR 조절 코드가 없습니다.');
}

if (!js.includes('CREW_PULSE_MIN_MS') || !js.includes('FOMO_POLL_MS')) {
  throw new Error('성능 기준: crew_pulse 폴링 완화 상수가 없습니다.');
}

if (!js.includes('scheduleSessionDeferred')) {
  throw new Error('성능 기준: idle 지연 hydrate 경로가 없습니다.');
}

if (!memberHtml.includes('perf-deferred.js')) {
  throw new Error('성능 기준: perf-deferred.js 부트스트랩이 index.html에 없습니다.');
}

if (!perfDeferred.includes('requestIdleCallback')) {
  throw new Error('성능 기준: perf-deferred.js가 idle 로딩을 사용해야 합니다.');
}

const mobilePreset = config.ci?.collect?.settings?.formFactor === 'mobile'
  || config.ci?.collect?.settings?.preset === 'perf';
if (!mobilePreset) {
  throw new Error('성능 기준: Lighthouse 모바일/perf 프리셋이 설정되어야 합니다.');
}

if (process.env.PUTDUK_RUN_LIGHTHOUSE === '1') {
  const { execFile } = await import('node:child_process');
  const { promisify } = await import('node:util');
  const execFileAsync = promisify(execFile);
  const urls = [...config.ci.collect.url];
  const localOnly = process.env.PUTDUK_LIGHTHOUSE_LOCAL === '1';
  const runUrls = localOnly ? urls.filter((url) => /^https?:\/\/127\.0\.0\.1|^http:\/\/localhost/.test(url)) : urls;
  if (!runUrls.length) {
    throw new Error('실행할 Lighthouse URL이 없습니다.');
  }
  await execFileAsync('pnpm', ['dlx', '@lhci/cli', 'autorun', `--collect.url=${runUrls.join(',')}`], {
    cwd: root,
    stdio: 'inherit',
    shell: true
  });
} else {
  console.log('Lighthouse 실측은 PUTDUK_RUN_LIGHTHOUSE=1 일 때만 실행합니다. PUTDUK_LIGHTHOUSE_LOCAL=1이면 로컬 URL만 측정합니다. 설정·폴백 검사는 통과했습니다.');
}
