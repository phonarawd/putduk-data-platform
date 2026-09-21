import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';

const read = (path) => readFileSync(new URL(`../../${path}`, import.meta.url), 'utf8');

test('Phase 6 Playwright 게이트는 로그인 원인 5종과 로그아웃 캐시 정리를 다룬다', () => {
  const spec = read('tests/e2e/release-auth.spec.ts');
  for (const code of ['invalid_credentials', 'email_not_confirmed', 'user_banned', 'over_request_rate_limit', 'unexpected_failure']) {
    assert.match(spec, new RegExp(code));
  }
  assert.match(spec, /putduk-state-v2:/);
  assert.match(spec, /hasMemberState/);
  assert.match(spec, /sidebar-open/);
  assert.match(spec, /modal-open/);
  assert.match(spec, /overlay-open/);
  assert.match(spec, /expect\(snapshot\.path\)\.toBe\('\/'\)/);
});

test('live gate는 기존 환경변수만으로 자격증명을 받고 값 자체를 저장하지 않는다', () => {
  const spec = read('tests/e2e/release-live.spec.ts');
  for (const name of ['PUTDUK_TRIAL_EMAIL', 'PUTDUK_TRIAL_PASSWORD', 'PUTDUK_ADMIN_EMAIL', 'PUTDUK_ADMIN_PASSWORD', 'PUTDUK_E2E_MEMBER_PUBLIC_ID']) {
    assert.match(spec, new RegExp(`process\\.env\\.${name}`));
  }
  assert.match(spec, /test\.skip\(!memberEmail \|\| !memberPassword/);
  assert.match(spec, /test\.skip\(!adminEmail \|\| !adminPassword/);
  assert.match(spec, /test\.skip\(!adminMemberPublicId/);
  assert.match(spec, /member-detail-modal/);
  assert.match(spec, /전체 휴대폰 번호 표시 중\|전체 번호는 최고관리자만 볼 수 있습니다/);
  assert.doesNotMatch(spec, /replace-with-(?:admin|trial)-password/);
});

test('live admin gate는 전용 테스트 사원번호 검색 결과만 열고 첫 회원을 임의 선택하지 않는다', () => {
  const spec = read('tests/e2e/release-live.spec.ts');
  const doc = read('docs/v0.2.0-phase6-release-gates.md');

  assert.match(spec, /#memberSearchInput/);
  assert.match(spec, /#memberSearchForm/);
  assert.match(spec, /page\.locator\('tr', \{ hasText: adminMemberPublicId \}\)\.first\(\)/);
  assert.match(spec, /testMemberRow\.getByText\(adminMemberPublicId, \{ exact: true \}\)/);
  assert.match(spec, /testMemberRow\.locator\('\[data-action="member-detail"\]'\)/);
  assert.doesNotMatch(spec, /page\.locator\('\[data-action="member-detail"\]'\)\.first\(\)/);
  assert.match(doc, /회원 목록의 첫 번째 행을 임의로 열지 않는다/);
  assert.match(doc, /PUTDUK_E2E_MEMBER_PUBLIC_ID/);
});

test('live gate는 사업 상태를 변경하지 않고 인증·PII 경계만 확인한다', () => {
  const spec = read('tests/e2e/release-live.spec.ts');
  const forbiddenBusinessMutations = [
    'start_task',
    'submit_work',
    'review_task',
    'adjust_balance',
    'approve_withdrawal',
    'complete_withdrawal',
    'reject_withdrawal',
    'approve_deposit',
    'create_assignment',
    'update_assignment',
    'support_grant',
    'referral_reward'
  ];
  for (const action of forbiddenBusinessMutations) {
    assert.equal(spec.includes(action), false, action);
  }
  assert.doesNotMatch(spec, /phone_e164|legal_name|birth_date|last_login_ip/);
  assert.doesNotMatch(spec, /page\.request\.(?:post|put|patch|delete)/);
});

test('회원 상세 PII 원문은 super_admin만 공개하고 member_support 접근권한과 분리된다', () => {
  const adminOps = read('supabase/functions/_shared/admin-ops.ts');
  assert.match(adminOps, /const memberRoles = \["super_admin", "member_support"\]/);
  assert.match(adminOps, /function canRevealMemberPii\(roles: string\[\]\): boolean \{\s*return roles\.includes\("super_admin"\);\s*\}/);
  assert.match(adminOps, /pii_access: revealPii/);
  assert.match(adminOps, /pii_masked: !revealPii/);
});

test('super_admin 원문 PII 열람은 audit side effect를 남기고 문서가 이를 허용 범위로 고정한다', () => {
  const adminOps = read('supabase/functions/_shared/admin-ops.ts');
  const doc = read('docs/v0.2.0-phase6-release-gates.md');

  assert.match(adminOps, /if \(revealPii\) \{[\s\S]*await appendAudit\(/);
  assert.match(adminOps, /"회원 개인정보 열람"/);
  assert.match(adminOps, /fields: \["phone_e164", "email", "legal_name", "birth_date", "last_login_ip"\]/);
  assert.match(doc, /사업 상태 mutation 0, 인증\/보안 감사 side effect만 허용/);
  assert.match(doc, /Production write 0/);
});

test('관리자 회원 상세는 92dvh 제한과 modal-body 내부 스크롤을 유지한다', () => {
  const css = read('dist/admin/admin.css');
  assert.match(css, /\.member-detail-modal[\s\S]*max-height: min\(92dvh, 920px\)/);
  assert.match(css, /\.member-detail-modal \.modal-body[\s\S]*overflow-y: auto/);
});

test('Phase 6 실행 스크립트와 아키텍처 문서는 Render를 새 런타임으로 도입하지 않는다', () => {
  const pkg = JSON.parse(read('package.json'));
  const ci = read('.github/workflows/ci.yml');
  const doc = read('docs/v0.2.0-phase6-release-gates.md');
  assert.equal(pkg.scripts['test:e2e:release'], 'pnpm exec playwright test tests/e2e/release-auth.spec.ts tests/e2e/release-live.spec.ts');
  assert.equal(pkg.devDependencies?.['@playwright/test'], '1.63.0');
  assert.match(ci, /pnpm exec playwright install --with-deps chromium/);
  assert.match(ci, /pnpm exec playwright test tests\/e2e\/release-auth\.spec\.ts/);
  assert.doesNotMatch(ci, /pnpm exec playwright test tests\/e2e\/release-live\.spec\.ts/);
  assert.equal(existsSync(new URL('../../render.yaml', import.meta.url)), false);
  assert.equal(existsSync(new URL('../../Render.yaml', import.meta.url)), false);
  assert.equal(existsSync(new URL('../../wrangler.toml', import.meta.url)), true);
  assert.equal(existsSync(new URL('../../supabase/functions', import.meta.url)), true);
  assert.match(doc, /별도 Render 백엔드를 추가할 기술적 근거 없음/);
  assert.match(doc, /live gate가 실제로 실행되지 않았다면 \*\*SKIP\/미실행\*\*/);
});
