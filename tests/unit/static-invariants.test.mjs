import test from 'node:test';
import assert from 'node:assert/strict';
import { existsRepo, readLaunchFiles, readRepo } from '../helpers/repo.mjs';

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

test('핸드오프에 적힌 정적 출시 파일이 있다', async () => {
  for (const relativePath of requiredFiles) {
    assert.equal(await existsRepo(...relativePath.split('/')), true, relativePath);
  }
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
  assert.equal(memberHtml.includes('봇 연출'), false);
  assert.equal(appJs.includes('방금 피드 · 봇 연출'), false);
  assert.equal(appJs.includes('🤖 방금 피드'), false);
  assert.equal(appJs.includes('지금은 봇 연출을 꺼 두었어요'), false);
  assert.match(appJs, /방금 들어온 크루/);
  assert.match(appJs, /방금 라인/);
  assert.match(appJs, /FOMO_FEED_SLOTS = 4/);
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
  assert.match(appJs, /from\('crew_pulse'\)/);
  assert.match(appJs, /hydrateCrewPulse/);
  assert.match(appJs, /live,crowd_min,crowd_max,burn_per_minute/);
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
  assert.match(appCss, /\.id-face\[hidden\]/);
  assert.match(appCss, /display:\s*none\s*!important/);
  assert.equal(appCss.includes('.id-face.id-back { transform:rotateY(180deg); }'), false);
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
  assert.match(appJs, /penalty-figures/);
  assert.match(appJs, /지금 업무잔액\(원금\)/);
  assert.match(appJs, /deposit-jump/);
  assert.match(appJs, /HIGH_JUMP_MIN = 3000000/);
  assert.match(appJs, /밀어 확정/);
  assert.match(appJs, /사진 고르기/);
  assert.match(appJs, /formatChartTick/);
  assert.equal(appJs.includes('Math.round(value/1000)}k'), false);
});

test('근무 제출은 서버로 답을 보내고 검수에 고른 보기가 있다', async () => {
  const { appJs, memberHtml, adminHtml } = await readLaunchFiles();
  const adminJs = await readRepo('dist', 'admin', 'admin.js');
  assert.match(memberHtml, /enableWorkApi:\s*true/);
  assert.match(memberHtml, /enableFinanceApi:\s*false/);
  assert.doesNotMatch(memberHtml, /enableFinanceApi:\s*true/);
  assert.match(adminHtml, /enableFinanceApi:\s*false/);
  assert.match(appJs, /memberFinanceRequest\('submit_work'/);
  assert.match(appJs, /choice_id: choice/);
  assert.doesNotMatch(appJs, /from\('task_runs'\)\s*\.update\(\{ status: 'submitted' \}\)/);
  assert.match(adminJs, /회원이 고른 보기/);
  assert.match(adminJs, /문제 사진도 제출 보기도 없으면/);
});
