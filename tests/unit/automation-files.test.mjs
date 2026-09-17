import test from 'node:test';
import assert from 'node:assert/strict';
import { existsRepo, readRepo } from '../helpers/repo.mjs';

const required = [
  '.github/workflows/ci.yml',
  '.github/workflows/release.yml',
  '.github/workflows/supabase-deploy.yml',
  '.github/workflows/rollback.yml',
  'scripts/automation/release.mjs',
  'scripts/automation/health-check.mjs',
  'scripts/automation/create-release.mjs',
  'playwright.config.ts',
  'tests/e2e/member-shell.spec.ts',
  'tests/e2e/admin-shell.spec.ts',
  'tests/e2e/static-shell.test.mjs',
  'tests/unit/static-invariants.test.mjs',
  'tests/a11y/static-a11y.test.mjs',
  'lighthouserc.json'
];

test('핸드오프 15절 자동화·테스트 파일이 있다', async () => {
  for (const relativePath of required) {
    assert.equal(await existsRepo(...relativePath.split('/')), true, relativePath);
  }
});

test('루트 package.json에 검증 스크립트가 있다', async () => {
  const pkg = JSON.parse(await readRepo('package.json'));
  for (const name of ['verify', 'test', 'test:e2e', 'test:a11y', 'test:performance', 'security:scan', 'healthcheck', 'release:deploy']) {
    assert.equal(typeof pkg.scripts?.[name], 'string', name);
  }
});
