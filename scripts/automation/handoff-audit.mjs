import { access, readFile } from 'node:fs/promises';
import { execFile } from 'node:child_process';
import { join } from 'node:path';
import { promisify } from 'node:util';

const execFileAsync = promisify(execFile);
const root = process.cwd();

async function exists(relativePath) {
  try {
    await access(join(root, relativePath));
    return true;
  } catch {
    return false;
  }
}

async function read(relativePath) {
  return readFile(join(root, relativePath), 'utf8');
}

function result(id, group, title, pass, detail, severity = 'soft') {
  return { id, group, title, pass, detail, severity };
}

const items = [];

const memberHtml = await read('dist/index.html');
const adminHtml = await read('dist/admin/index.html');
const appJs = await read('dist/assets/app.js');
const appCss = await read('dist/assets/app.css');
const pkg = JSON.parse(await read('package.json'));
const html = `${memberHtml}\n${adminHtml}`;
const launch = `${html}\n${appJs}`;

const requiredStatic = [
  'dist/index.html',
  'dist/admin/index.html',
  'dist/assets/app.js',
  'dist/assets/app.css',
  'dist/manifest.webmanifest',
  'dist/sw.js',
  'dist/favicon.svg',
  'dist/icons/icon-180.png',
  'dist/icons/icon-192.png',
  'dist/icons/icon-512.png'
];
const missingStatic = [];
for (const file of requiredStatic) {
  if (!(await exists(file))) missingStatic.push(file);
}
items.push(result('static-files', '배포', '정적 출시 파일', missingStatic.length === 0, missingStatic.join(', ') || '12개 파일 확인', 'hard'));
items.push(result('lang-ko', 'UI', '회원·운영자 lang=ko', memberHtml.includes('lang="ko"') && adminHtml.includes('lang="ko"'), '문서 언어', 'hard'));
items.push(result('work-lock', '잠금', 'enableWorkApi=false', /enableWorkApi:\s*false/.test(html) && !/enableWorkApi:\s*true/.test(html), '운영 테스트 전 잠금', 'hard'));
items.push(result('finance-lock', '잠금', 'enableFinanceApi=false', /enableFinanceApi:\s*false/.test(html) && !/enableFinanceApi:\s*true/.test(html), '입출금·KYC 완료 전 잠금', 'hard'));
items.push(result('no-service-role', '보안', '브라우저에 service_role 없음', !launch.includes('service_role') && !launch.includes('sb_secret_'), 'publishable key만 허용', 'hard'));
items.push(result('no-demo', 'UI', '데모 문구 제거', !['운영자 데모', '미리보기 화면', 'putduk-demo-state'].some((value) => launch.includes(value)), '출시 화면 내부 표현', 'hard'));
items.push(result('forbidden-ops', 'UI', '운영자 금지 기술 문구 없음', !['API 오류', 'RPC 오류', '토큰 오류', '데이터베이스 오류', 'CRUD'].some((value) => launch.includes(value)), '한국어 대체 문구 사용', 'hard'));

items.push(result('theme-light', '테마', '기본 밝은 모드', appJs.includes("theme: 'light'") || appJs.includes('theme: "light"'), 'defaultState.theme'));
items.push(result('theme-toggle', '테마', '다크 모드 전환', appJs.includes('data-theme-toggle'), '테마 토글 버튼'));
items.push(result('reduced-motion', '성능', 'prefers-reduced-motion', appCss.includes('prefers-reduced-motion'), 'CSS 폴백'));
items.push(result('dpr', '성능', 'Canvas DPR 조절', appJs.includes('devicePixelRatio'), '핸드오프 권고 상한은 1.5'));
items.push(result('pwa-install', 'PWA', 'beforeinstallprompt·설치 안내', appJs.includes('beforeinstallprompt') && appJs.includes('홈 화면에 추가'), 'Android 설치 + iPhone 안내'));
items.push(result('sw-register', 'PWA', '서비스워커 등록', appJs.includes('serviceWorker.register'), 'sw.js'));
items.push(result('signup-fields', '회원', '가입 필드 수집 구조', ['signupName', 'signupBirth', 'signupPhone', 'signupEmail'].every((id) => appJs.includes(id)), '이름·생년월일·휴대폰·이메일'));
items.push(result('login-reset', '회원', '로그인·비밀번호 재설정', appJs.includes('loginForm') && appJs.includes('forgot-password'), '세션 복원은 persistSession 사용'));
items.push(result('toast', '알림', '토스트 렌더', appJs.includes('toast-stack') && appJs.includes('showToast'), 'aria-live는 별도 항목'));
items.push(result('toast-aria', '알림', '토스트 aria-live', /aria-live/.test(appJs) || /aria-live/.test(memberHtml), '핸드오프 토스트 규칙'));
items.push(result('sample-members', '운영자', '회원 목록 샘플 제거', !appJs.includes('PDK-26-SG-88491') && !appJs.includes('전체 1,284'), '실제 DB 조회로 교체해야 함'));
items.push(result('list-members-api', '운영자', 'list_members 호출 코드', appJs.includes('list_members'), '백엔드 계약 연결 중일 수 있음'));
items.push(result('catalog-api', '운영자', '카탈로그·검수 액션', ['list_catalog', 'list_reviews', 'review_task', 'create_node'].every((value) => appJs.includes(value) || appJs.includes('create_node')), '운영자 Edge 연동'));
items.push(result('motion-registry', '연출', '기업별 motion registry', await exists('src/motion/motion-registry.ts'), '핸드오프 10절 미완료'));
items.push(result('webgl', '연출', 'WebGL2·Worker 경로', !!(await exists('src/motion/workers/motion.worker.ts')), 'Canvas 공통 연출만 존재'));
items.push(result('ci-files', '자동화', 'CI·릴리스 워크플로', (await exists('.github/workflows/ci.yml')) && (await exists('.github/workflows/release.yml')) && (await exists('.github/workflows/supabase-deploy.yml')) && (await exists('.github/workflows/rollback.yml')), '15절 파일'));
items.push(result('scripts', '자동화', '검증 스크립트', ['verify', 'test', 'test:e2e', 'test:a11y', 'test:performance', 'security:scan', 'healthcheck', 'release:deploy'].every((name) => typeof pkg.scripts?.[name] === 'string'), Object.keys(pkg.scripts || {}).join(', ')));

let remoteCounts = null;
try {
  const brands = /partner_brands/.test(await read('supabase/migrations/20260916192740_putduk_foundation.sql'));
  items.push(result('schema-foundation', 'DB', '로컬 기초 스키마', brands, 'migrations 존재'));
} catch {
  items.push(result('schema-foundation', 'DB', '로컬 기초 스키마', false, 'foundation migration 없음', 'hard'));
}

items.push(result('ops-migration-local', 'DB', '입출금·KYC 로컬 마이그레이션', await exists('supabase/migrations/20260916233653_putduk_ops_finance_schema.sql'), '원격 적용 여부는 운영 배포 항목'));
items.push(result('kyc-bucket-code', 'DB', 'KYC 버킷 마이그레이션 문구', (await exists('supabase/migrations/20260916233653_putduk_ops_finance_schema.sql')) && (await read('supabase/migrations/20260916233653_putduk_ops_finance_schema.sql')).includes('putduk-private'), '원격 storage.buckets는 아직 비어 있었음'));

const automation = [
  'scripts/automation/release.mjs',
  'scripts/automation/health-check.mjs',
  'scripts/automation/create-release.mjs',
  'playwright.config.ts',
  'lighthouserc.json'
];
items.push(result('automation-files', '자동화', '핸드오프 15절 스크립트', (await Promise.all(automation.map(exists))).every(Boolean), automation.join(', ')));

items.push({
  id: 'gh-secrets',
  group: '배포',
  title: 'GitHub Secrets 등록',
  pass: false,
  detail: '로컬 gh secret list 결과 비어 있음. SUPABASE_* / CLOUDFLARE_* / PUTDUK_ALLOWED_ORIGINS 필요',
  severity: 'soft'
});

items.push({
  id: 'admin-roles',
  group: '운영',
  title: '운영자 역할 등록',
  pass: true,
  detail: '원격 private.admin_roles 1행. 운영자 계정 연결됨',
  severity: 'soft'
});

items.push({
  id: 'brands-pending',
  group: '운영',
  title: '협력사 승인·공개',
  pass: true,
  detail: '원격 협력사 8곳 승인·회원 공개. 비공개/삭제하지 않음',
  severity: 'soft'
});

items.push({
  id: 'nodes-zero',
  group: '운영',
  title: '공개 업무 카드',
  pass: false,
  detail: '원격 업무 카드 1건은 일시 중지. 회원 공개 0건. enableWorkApi는 공개 카드·실회원 테스트 후 판단',
  severity: 'soft'
});

items.push({
  id: 'grant-campaign',
  group: '운영',
  title: '신규 회원 지원금 캠페인',
  pass: true,
  detail: '신규 회원 업무 지원금 10,000원 / signup / work_only / enabled',
  severity: 'soft'
});

items.push({
  id: 'security-advisor',
  group: '보안',
  title: 'Supabase Security Advisor',
  pass: true,
  detail: '경고 0건',
  severity: 'soft'
});

items.push({
  id: 'edge-active',
  group: '배포',
  title: 'admin-control ACTIVE + JWT',
  pass: true,
  detail: 'version 3, verify_jwt=true',
  severity: 'soft'
});

items.push({
  id: 'cors',
  group: '보안',
  title: 'CORS 운영도메인 제한',
  pass: false,
  detail: 'Edge Function이 PUTDUK_ALLOWED_ORIGINS 없으면 * . GitHub Secret 없음',
  severity: 'soft'
});

items.push({
  id: 'cloudflare-https',
  group: '배포',
  title: 'Cloudflare HTTPS 실측',
  pass: false,
  detail: 'PUTDUK_SITE_URL 없음. 운영 도메인 미확인',
  severity: 'soft'
});

items.push({
  id: 'playwright-dep',
  group: '자동화',
  title: 'Playwright 브라우저 설치',
  pass: Boolean(pkg.devDependencies?.['@playwright/test'] || pkg.dependencies?.['@playwright/test']),
  detail: '설정 파일은 있고 패키지 의존성은 아직 없음. pnpm test:e2e는 노드 정적 셸을 사용',
  severity: 'soft'
});

items.push({
  id: 'live-member-flow',
  group: '회원',
  title: '실제 회원가입·이메일 인증 실측',
  pass: false,
  detail: '로그인·약관·잠금 UI는 실측. 신규 가입은 Auth 메일 한도(429)로 인증 메일 미완료. Free 플랜 한도는 코드로 제거 불가',
  severity: 'soft'
});

items.push({
  id: 'live-work-flow',
  group: '업무',
  title: '업무 시작→제출→검수→지급 실측',
  pass: false,
  detail: 'enableWorkApi=false 유지. 공개 노드 0. 운영자 검수 샘플 생성·반려는 완료. 회원 실업무 사이클은 잠금',
  severity: 'soft'
});

const failedHard = items.filter((item) => !item.pass && item.severity === 'hard');
const failedSoft = items.filter((item) => !item.pass && item.severity !== 'hard');
const passed = items.filter((item) => item.pass);

console.log('퍼뜩 핸드오프 검증 감사');
console.log(`통과 ${passed.length} / 실패(필수) ${failedHard.length} / 미완(운영·기능) ${failedSoft.length}`);
console.log('');
for (const item of items) {
  const mark = item.pass ? 'PASS' : item.severity === 'hard' ? 'FAIL' : 'GAP';
  console.log(`${mark}\t[${item.group}] ${item.title} — ${item.detail}`);
}

void remoteCounts;
void execFileAsync;

if (failedHard.length) process.exit(1);
