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
  for (const name of ['PUTDUK_TRIAL_EMAIL', 'PUTDUK_TRIAL_PASSWORD', 'PUTDUK_ADMIN_EMAIL', 'PUTDUK_ADMIN_PASSWORD']) {
    assert.match(spec, new RegExp(`process\\.env\\.${name}`));
  }
  assert.match(spec, /test\.skip\(!memberEmail \|\| !memberPassword/);
  assert.match(spec, /test\.skip\(!adminEmail \|\| !adminPassword/);
  assert.match(spec, /member-detail-modal/);
  assert.match(spec, /전체 휴대폰 번호 표시 중\|전체 번호는 최고관리자만 볼 수 있습니다/);
  assert.doesNotMatch(spec, /replace-with-(?:admin|trial)-password/);
});

test('회원 상세 PII 원문은 super_admin만 공개하고 member_support 접근권한과 분리된다', () => {
  const adminOps = read('supabase/functions/_shared/admin-ops.ts');
  assert.match(adminOps, /const memberRoles = \["super_admin", "member_support"\]/);
  assert.match(adminOps, /function canRevealMemberPii\(roles: string\[\]\): boolean \{\s*return roles\.includes\("super_admin"\);\s*\}/);
  assert.match(adminOps, /pii_access: revealPii/);
  assert.match(adminOps, /pii_masked: !revealPii/);
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
