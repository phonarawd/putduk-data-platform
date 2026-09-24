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
const js = await readFile(join(root, 'dist/assets/app-ia13.js'), 'utf8');
const fomoBot = await readFile(join(root, 'dist/assets/fomo-bot-runtime-v2.js'), 'utf8');
const perfDeferred = await readFile(join(root, 'dist/assets/perf-deferred.js'), 'utf8');
if (!memberHtml.includes('assets/fomo-bot-runtime-v2.js') || memberHtml.includes('assets/fomo-bot-runtime.js?v=')) {
  throw new Error('성능 기준: FOMO runtime은 cache-bust된 v2 asset만 회원 셸에서 로드해야 합니다.');
}

if (!css.includes('prefers-reduced-motion')) {
  throw new Error('성능 기준: prefers-reduced-motion 폴백이 없습니다.');
}

if (!css.includes('data-low-perf')) {
  throw new Error('성능 기준: 저사양 backdrop-filter 축소 규칙이 없습니다.');
}

if (!js.includes('devicePixelRatio')) {
  throw new Error('성능 기준: Canvas DPR 조절 코드가 없습니다.');
}

if (js.includes('realActivityFetchedAt') || js.includes("action: 'real_activity'")) {
  throw new Error('성능 기준: 회원 app-ia13.js에 real_activity FOMO 폴링이 남아 있습니다.');
}
if (!fomoBot.includes("from('crew_pulse')") || !fomoBot.includes('4000')) {
  throw new Error('성능 기준: FOMO bot runtime crew_pulse 폴링 완화가 없습니다.');
}
if (fomoBot.includes('observer.observe(document.documentElement')
  || !fomoBot.includes("const observerRoot = document.getElementById('app')")
  || !fomoBot.includes('observer.observe(observerRoot')) {
  throw new Error('성능 기준: FOMO MutationObserver는 전체 document가 아니라 #app 범위만 감시해야 합니다.');
}

const memberRuntime = await readFile(join(root, 'dist/assets/member-runtime-core.js'), 'utf8');
const memberCatalog = await readFile(join(root, 'dist/assets/member-catalog-runtime.js'), 'utf8');
if (!memberRuntime.includes('getMemberExperience') || !memberRuntime.includes('snapshotPromise') || !memberRuntime.includes('maxAgeMs = 2000')) {
  throw new Error('성능 기준: 회원 snapshot 요청 병합 캐시가 없습니다.');
}
if (js.includes("light && nodes.length ? Promise.resolve() : hydratePublishedCatalog()")
  || !js.includes('const needsCatalogForRunState = runRows.some')
  || !js.includes('if (needsCatalogForRunState)')
  || !js.includes('else if (!light || nodes.length === 0)')
  || !js.includes('void hydratePublishedCatalog().then')) {
  throw new Error('성능 기준: 공개 카탈로그는 활성/검수 상태가 있을 때만 인증 critical path에서 기다리고, 그 외에는 백그라운드 hydration이어야 합니다.');
}
if (!memberCatalog.includes('const PAGE_SIZE = 12') || !memberCatalog.includes('rows.slice(0, state.visibleCount)')) {
  throw new Error('성능 기준: 12개 증분 catalog 렌더링이 유지되어야 합니다.');
}

if (!js.includes('hydrateSession') || !js.includes('light: true')) {
  throw new Error('성능 기준: 가벼운 세션 hydrate 경로가 없습니다.');
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
