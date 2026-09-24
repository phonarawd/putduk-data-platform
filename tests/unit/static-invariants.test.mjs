import test from 'node:test';
import assert from 'node:assert/strict';
import { existsRepo, readLaunchFiles, readRepo } from '../helpers/repo.mjs';

const requiredFiles = [
  'dist/index.html',
  'dist/admin/index.html',
  'dist/assets/app.css',
  'dist/assets/app-ia13.js',
  'dist/assets/overlay-surface.css',
  'dist/assets/overlay-surface.js',
  'dist/assets/origin-split.js',
  'dist/assets/channel-talk.js',
  'dist/assets/ui-icons.js',
  'dist/assets/vendor/supabase.min.js',
  'dist/assets/vendor/chart.umd.min.js',
  'dist/assets/vendor/qrcode.min.js',
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

test('회원·운영자 셸은 canonical app-ia13 runtime만 사용한다', async () => {
  const { memberHtml, adminHtml } = await readLaunchFiles();
  assert.equal(await existsRepo('dist', 'assets', 'app.js'), false);
  assert.match(memberHtml, /assets\/app-ia13\.js\?v=20260925-console2/);
  assert.match(adminHtml, /assets\/app-ia13\.js\?v=20260925-console2/);
  assert.doesNotMatch(memberHtml, /assets\/app\.js/);
  assert.doesNotMatch(adminHtml, /assets\/app\.js/);
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

test('회원 FOMO 화면에 봇·가짜·연출 티가 없다', async () => {
  const { memberHtml, appJs } = await readLaunchFiles();
  const fomoRuntime = await readRepo('dist', 'assets', 'fomo-bot-runtime-v2.js');
  assert.equal(memberHtml.includes('봇 연출'), false);
  assert.equal(appJs.includes('방금 피드 · 봇 연출'), false);
  assert.equal(appJs.includes('🤖 방금 피드'), false);
  assert.equal(appJs.includes('지금은 봇 연출을 꺼 두었어요'), false);
  assert.equal(appJs.includes('실제 최근 활동'), false);
  assert.equal(appJs.includes("action: 'real_activity'"), false);
  assert.match(memberHtml, /fomo-bot-runtime-v2\.js/);
  assert.match(fomoRuntime, /방금 들어온 크루/);
  assert.doesNotMatch(fomoRuntime, /실제 최근 활동|실제 업무 현황|최근 30분 동안 공개할 실제 활동이 없습니다/);
});

test('연출 슬라이더는 서버에 저장되고 회원은 집계만 읽는다', async () => {
  const { appJs, memberHtml, adminHtml } = await readLaunchFiles();
  const adminJs = await readRepo('dist', 'admin', 'admin.js');
  assert.match(memberHtml, /enableFinanceApi:\s*false/);
  assert.match(adminHtml, /enableFinanceApi:\s*false/);
  assert.match(adminJs, /save_motion_settings/);
  assert.match(adminJs, /get_motion_settings/);
  const adminOps = await readRepo('supabase', 'functions', '_shared', 'admin-ops.ts');
  assert.match(adminOps, /putduk_admin_motion_settings_save/);
  assert.match(adminOps, /putduk_admin_motion_settings_get/);
  assert.match(adminOps, /stored: "api"/);
  assert.match(adminJs, /연출 값을 서버에 저장하지 못했어요/);
  assert.equal(adminJs.includes('이 브라우저에 연출 값을 저장했어요'), false);
  const fomoRuntime = await readRepo('dist', 'assets', 'fomo-bot-runtime-v2.js');
  assert.doesNotMatch(appJs, /action: 'real_activity'/);
  assert.doesNotMatch(appJs, /hydrateCrewPulse/);
  assert.match(fomoRuntime, /from\('crew_pulse'\)/);
  assert.match(appJs, /renderFomoBoardPlaceholder/);
  assert.equal(appJs.includes("localStorage.getItem(MOTION_STORE_KEY)"), false);
  assert.equal(appJs.includes('putduk-admin-motion-v1'), false);
  assert.equal(appJs.includes('봇 연출'), false);
});

test('모바일 회원은 햄버거를 숨기고 사원증은 읽기 폭이다', async () => {
  const { appJs, appCss } = await readLaunchFiles();
  assert.match(appJs, /membership-page/);
  assert.match(appJs, /data-nav="referrals"/);
  assert.match(appJs, /라인 찾기/);
  assert.match(appJs, /const mobileMenu = isAdmin/);
  assert.match(appCss, /html\[data-mode="member"\] \.sidebar/);
  assert.match(appCss, /html\[data-mode="member"\] \.mobile-topbar \[data-menu="open"\]/);
  assert.match(appCss, /\.membership-page/);
  assert.match(appCss, /53\.98 \/ 85\.6/);
  assert.match(appCss, /padding-bottom:\s*calc\(88px/);
});

test('사원증 뒷면은 사원번호 아래 가로 안내다', async () => {
  const { appJs, appCss } = await readLaunchFiles();
  const frontStart = appJs.indexOf('id-face id-front');
  const backStart = appJs.indexOf('id-face id-back');
  assert.ok(frontStart > -1 && backStart > frontStart);
  const frontSlice = appJs.slice(frontStart, backStart);
  const backSlice = appJs.slice(backStart, backStart + 900);
  assert.equal(frontSlice.includes('id-legal'), false);
  assert.equal(frontSlice.includes('id-back-copy'), false);
  assert.ok(backSlice.indexOf('id-back-meta') < backSlice.indexOf('id-back-copy'), '사원번호가 안내 문장보다 위여야 한다');
  assert.match(appJs, /로그인하면 오늘 라인이 이 카드에 보여요/);
  assert.match(appCss, /\.id-face\.id-back \.id-face-body/);
  assert.match(appCss, /\.id-back-copy[\s\S]{0,240}word-break:\s*keep-all/);
  assert.match(appCss, /preserve-3d/);
  assert.match(appCss, /rotateY\(180deg\)/);
  assert.match(appCss, /backface-visibility:\s*hidden/);
  assert.equal(appJs.includes('id-front"${flipped'), false);
});

test('회원 지갑·내역은 카드형이고 입금 폼에 증빙 위치·안내 메모가 없다', async () => {
  const { appJs, appCss, memberHtml } = await readLaunchFiles();
  assert.equal(appJs.includes('증빙 위치'), false);
  assert.equal(appJs.includes('안내 메모'), false);
  assert.match(appJs, /등급·혜택/);
  assert.match(appJs, /function crewAttendance/);
  assert.match(appJs, /lastCrewPartnerId/);
  assert.match(appJs, /mobile-brand/);
  assert.match(appJs, /record-card/);
  assert.match(appCss, /\.mobile-brand-logo/);
  assert.match(appCss, /\.record-card/);
  assert.match(memberHtml, /enableWorkApi:\s*true/);
  assert.match(memberHtml, /enableFinanceApi:\s*false/);
  assert.doesNotMatch(memberHtml, /enableFinanceApi:\s*true/);
});

test('체험 카드는 지원금 소진 카피이고 일반 카드는 안심 한 줄이다', async () => {
  const { appJs } = await readLaunchFiles();
  assert.match(appJs, /지원금은 근무에 다 쓰이고 돌려주지 않아요/);
  assert.match(appJs, /일이 끝나면 원금과 수당이 잔액에 같이 반영돼요/);
  assert.match(appJs, /승인되면 지원금은 다 쓰이고 돌려주지 않아요/);
  assert.match(appJs, /반려돼도 지원금은 돌아가지 않아요/);
  assert.match(appJs, /반려되면 원금만 돌아와요/);
});

test('390 회원 시트는 탭바 위에 뜨고 원금·고액 확인이 있다', async () => {
  const { appJs, appCss } = await readLaunchFiles();
  assert.match(appCss, /--member-tabbar-stack/);
  assert.match(appCss, /html\[data-mode="member"\] \.modal-backdrop/);
  assert.match(appCss, /justify-content:\s*flex-end/);
  assert.match(appCss, /align-items:\s*center/);
  assert.match(appCss, /width:\s*min\(100%,\s*420px\)/);
  assert.match(appJs, /penalty-figures/);
  assert.match(appJs, /지금 업무잔액\(원금\)/);
  assert.match(appJs, /deposit-jump/);
  assert.match(appJs, /HIGH_JUMP_MIN = 3000000/);
  assert.match(appJs, /밀어 확정/);
  assert.match(appJs, /파일 고르기|사진 고르기/);
  assert.match(appJs, /formatChartTick/);
  assert.equal(appJs.includes('Math.round(value/1000)}k'), false);
});

test('회원·운영자 origin이 분리되고 목록 잔액이 세 칸이다', async () => {
  const { memberHtml, adminHtml, appJs, appCss } = await readLaunchFiles();
  const adminJs = await readRepo('dist', 'admin', 'admin.js');
  assert.match(memberHtml, /origin-split\.js/);
  assert.match(adminHtml, /origin-split\.js/);
  assert.match(memberHtml, /opsOrigin:\s*'https:\/\/ops\.hiptk\.app'/);
  assert.match(appJs, /REVIEW_WAIT_STATUSES/);
  assert.match(appJs, /검수 대기 업무/);
  assert.match(appJs, /확인 필요/);
  assert.match(appJs, /실물에 적힌 라벨 번호/);
  assert.match(appJs, /상품명·가격·옵션·배송/);
  assert.match(appJs, /checkpoint_work/);
  assert.match(appJs, /이 이메일로는 바로 가입되지 않았어요/);
  assert.match(appJs, /deposit_info_reveal/);
  assert.match(appJs, /보안 PIN 입력 후 입금 안내 확인/);
  assert.match(adminJs, /출금 가능/);
  assert.match(adminJs, /업무 진행/);
  assert.match(adminJs, /잠금/);
  assert.equal(adminJs.includes('>잔액<'), false);
  assert.match(appCss, /z-index:\s*400/);
  assert.match(appCss, /html\[data-theme="dark"\] \.toast/);
});

test('근무 제출은 서버로 답을 보내고 검수에 고른 보기가 있다', async () => {
  const { appJs, memberHtml, adminHtml } = await readLaunchFiles();
  const adminJs = await readRepo('dist', 'admin', 'admin.js');
  assert.match(memberHtml, /enableWorkApi:\s*true/);
  assert.match(memberHtml, /enableFinanceApi:\s*false/);
  assert.doesNotMatch(memberHtml, /enableFinanceApi:\s*true/);
  assert.match(adminHtml, /enableFinanceApi:\s*false/);
  assert.match(appJs, /memberFinanceRequest\('submit_work'/);
  assert.match(appJs, /checkpoint_work/);
  assert.match(appJs, /work_kind: 'catalog_listing'/);
  assert.match(appJs, /choice_id: choice/);
  assert.match(appJs, /inspect_answers:/);
  assert.match(appJs, /isInspectBundleComplete/);
  assert.doesNotMatch(appJs, /from\('task_runs'\)\s*\.update\(\{ status: 'submitted' \}\)/);
  assert.match(adminJs, /회원이 고른 보기/);
  assert.match(adminJs, /문제 사진도 제출 보기도 없으면/);
});

test('같은 오버레이는 다시 페이드하지 않고 부트는 인증 전에 바로 그린다', async () => {
  const { appJs, appCss, memberHtml, adminHtml } = await readLaunchFiles();
  const overlaySrc = await readRepo('src', 'ui', 'overlay-surface.mjs');
  const overlayCss = await readRepo('src', 'ui', 'overlay-surface.css');
  const overlayDistJs = await readRepo('dist', 'assets', 'overlay-surface.js');
  const overlayDistCss = await readRepo('dist', 'assets', 'overlay-surface.css');
  assert.match(overlaySrc, /export function overlaySurfaceKey\(/);
  assert.match(overlaySrc, /export function overlayPaintPlan\(/);
  assert.match(overlaySrc, /export function shouldPaintBootImmediately\(/);
  assert.match(overlaySrc, /REPLAY_LOCK_CUE_AFTER_START = false/);
  assert.match(overlaySrc, /WAIT_FOR_SUBMIT_CUT = false/);
  assert.equal(overlayDistCss.trim(), overlayCss.trim());
  assert.match(overlayDistJs, /window\.PutdukOverlaySurface/);
  assert.match(memberHtml, /overlay-surface\.css/);
  assert.match(memberHtml, /overlay-surface\.js/);
  assert.match(adminHtml, /overlay-surface\.js/);
  assert.match(appJs, /PutdukOverlaySurface/);
  assert.match(appJs, /function overlaySurfaceKey\(/);
  assert.match(appJs, /function patchLiveOverlay\(/);
  assert.match(appJs, /overlayPaintPlan/);
  assert.match(appJs, /shouldPaintBootImmediately/);
  assert.match(appJs, /overlayDismissed/);
  assert.match(appCss, /\.player-backdrop \.player-sheet \{ animation: none/);
  assert.match(overlayCss, /\.player-backdrop \.player-sheet \{ animation: none/);
  assert.match(appJs, /data-boot-shell="1"/);
  assert.match(appJs, /initializeAuth\(\)\.then\(\(\) => render\(\)\)/);
  assert.match(appJs, /PutdukIcons/);
  assert.equal(appJs.includes('data-lucide'), false);
  assert.equal(appJs.includes("memberFinanceRequest('lock_stake'"), false);
  assert.match(appJs, /hydrateSession\(data\.session\)/);
  assert.match(appJs, /syncChannelTalk\(\)/);
  assert.match(appJs, /open-channel-talk/);
  const channelTalk = await readRepo('dist', 'assets', 'channel-talk.js');
  assert.match(channelTalk, /cdn\.channel\.io\/plugin\/ch-plugin-web\.js/);
  assert.match(channelTalk, /PutdukChannelTalk/);
  assert.doesNotMatch(channelTalk, /memberHash/);
  assert.match(appJs, /chart\.umd\.min\.js/);
  assert.equal(appJs.includes('initializeAuth().then(() => render());\n  render();'), false);
  assert.equal(appJs.includes("motion.playWorkPhase(canvas, motionPartner(node), 'lock'"), false);
  assert.match(appJs, /document\.hidden\)[\s\S]{0,180}stopWorkPhase/);
  const motionEngine = await readRepo('src', 'motion', 'motion-engine.ts');
  const browserApi = await readRepo('src', 'motion', 'browser-api.ts');
  assert.match(motionEngine, /lastRect/);
  assert.match(motionEngine, /hints\.hidden \|\| !this\.visible/);
  assert.match(browserApi, /if \(document\.hidden\) stopWorkPhase/);
});

test('배포 헤더에 CSP가 있고 자동 정산 플래그는 꺼져 있다', async () => {
  const headers = await readRepo('dist', '_headers');
  const { memberHtml, adminHtml } = await readLaunchFiles();
  assert.match(headers, /Content-Security-Policy:/);
  assert.match(headers, /script-src 'self' 'unsafe-inline'/);
  assert.match(headers, /cdn\.channel\.io/);
  assert.match(headers, /frame-src 'self' https:\/\/\*\.channel\.io/);
  assert.doesNotMatch(headers, /cdn\.tailwindcss\.com/);
  assert.doesNotMatch(headers, /unpkg\.com/);
  assert.doesNotMatch(headers, /cdn\.jsdelivr\.net/);
  assert.doesNotMatch(headers, /unsafe-eval/);
  assert.match(headers, /gaugwamwceqdnqdqrxqg\.supabase\.co/);
  assert.match(headers, /worker-src 'self' blob:/);
  assert.match(memberHtml, /enableFinanceApi:\s*false/);
  assert.doesNotMatch(memberHtml, /enableFinanceApi:\s*true/);
  assert.match(adminHtml, /enableFinanceApi:\s*false/);
  assert.equal(await existsRepo('supabase', 'migrations', '20260918073245_putduk_fk_indexes_ops_security.sql'), true);
});

test('회원·운영 셸은 자체 스크립트와 캐시 우선 서비스워커를 쓴다', async () => {
  const { memberHtml, adminHtml, appJs } = await readLaunchFiles();
  const sw = await readRepo('dist', 'sw.js');
  const http = await readRepo('supabase', 'functions', '_shared', 'http.ts');
  const adminOps = await readRepo('supabase', 'functions', '_shared', 'admin-ops.ts');
  const memberFinance = await readRepo('supabase', 'functions', 'member-finance', 'index.ts');
  const adminControl = await readRepo('supabase', 'functions', 'admin-control', 'index.ts');
  assert.match(memberHtml, /vendor\/supabase\.min\.js/);
  assert.match(memberHtml, /ui-icons\.js/);
  assert.match(memberHtml, /channel-talk\.js/);
  assert.match(memberHtml, /channelPluginKey:\s*'a1b92284-6a36-41aa-9f00-4f4b084c4f47'/);
  assert.match(memberHtml, /data-boot-shell/);
  assert.doesNotMatch(memberHtml, /cdn\.tailwindcss/);
  assert.doesNotMatch(memberHtml, /unpkg\.com/);
  assert.doesNotMatch(adminHtml, /cdn\.tailwindcss/);
  assert.doesNotMatch(adminHtml, /channel-talk\.js/);
  assert.doesNotMatch(adminHtml, /channelPluginKey/);
  assert.match(adminHtml, /vendor\/supabase\.min\.js/);
  assert.match(sw, /putduk-sw-push-v1/);
  assert.match(sw, /showNotification/);
  assert.doesNotMatch(sw, /staleWhileRevalidate/);
  assert.doesNotMatch(sw, /cache\.addAll/);
  assert.match(memberHtml, /channel-talk\.js/);
  assert.match(http, /userFromVerifiedJwt/);
  assert.match(http, /export function clientIp/);
  assert.match(http, /true-client-ip/);
  assert.match(http, /x-real-ip/);
  assert.match(memberFinance, /clientIp\(request, info\)/);
  assert.match(memberFinance, /접속 기록을 남기지 못했습니다/);
  assert.match(memberFinance, /auth\.getUser/);
  assert.doesNotMatch(adminControl, /auth\.getUser/);
  assert.match(adminOps, /putduk_admin_list_roles/);
  assert.match(appJs, /memberFinanceRequest\('record_session'/);
  assert.match(appJs, /hydrateSession\([^)]*\{ light: true \}/);
});
