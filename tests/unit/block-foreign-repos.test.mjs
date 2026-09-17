import test from 'node:test';
import assert from 'node:assert/strict';
import { readRepo, existsRepo } from '../helpers/repo.mjs';
import {
  findBlockedReferences,
  isAllowedScanPath,
  isBlockedDirName,
  pathHasBlockedSegment,
  shouldSkipWalkDir
} from '../../tooling/scripts/block-foreign-repos.mjs';

test('차단 URL·짧은 이름은 잡고 현재 레포는 통과한다', () => {
  const blocked = [
    'https://github.com/phonarawd/AI-Profit-OS.git',
    'git@github.com:phonarawd/putduk-ops',
    'https://api.github.com/repos/phonarawd/putduk-web/contents/README.md',
    'phonarawd/AI-Profit-OS'
  ].join('\n');
  const hits = findBlockedReferences(blocked);
  assert.equal(hits.some((hit) => hit.repo === 'phonarawd/AI-Profit-OS'), true);
  assert.equal(hits.some((hit) => hit.repo === 'phonarawd/putduk-ops'), true);
  assert.equal(hits.some((hit) => hit.repo === 'phonarawd/putduk-web'), true);

  const allowed = findBlockedReferences('https://github.com/phonarawd/putduk-data-platform.git\nputduk_ops_finance');
  assert.equal(allowed.length, 0);
  assert.equal(findBlockedReferences('phonarawd/putduk-ops-extra').length, 0);
});

test('차단 디렉터리만 건너뛰고 현재 프로젝트 경로는 연다', () => {
  assert.equal(isBlockedDirName('putduk-ops'), true);
  assert.equal(isBlockedDirName('AI-Profit-OS'), true);
  assert.equal(isBlockedDirName('putduk-data-platform'), false);
  assert.equal(shouldSkipWalkDir('putduk-web'), true);
  assert.equal(shouldSkipWalkDir('supabase'), false);
  assert.equal(pathHasBlockedSegment('vendor/AI-Profit-OS/src/app.ts'), true);
  assert.equal(pathHasBlockedSegment('supabase/functions/_shared/admin-ops.ts'), false);
  assert.equal(isAllowedScanPath('.cursor/rules/blocked-foreign-repos.mdc'), true);
  assert.equal(isAllowedScanPath('docs/architecture.md'), false);
});

test('항상 적용 규칙과 로컬 git 차단 파일이 있다', async () => {
  assert.equal(await existsRepo('.cursor', 'rules', 'blocked-foreign-repos.mdc'), true);
  assert.equal(await existsRepo('tooling', 'git', 'blocked-remotes.gitconfig'), true);
  assert.equal(await existsRepo('tooling', 'githooks', 'pre-commit'), true);
  const rule = await readRepo('.cursor', 'rules', 'blocked-foreign-repos.mdc');
  assert.match(rule, /alwaysApply:\s*true/);
  assert.match(rule, /plugin-github-github/);
  const gitconfig = await readRepo('tooling', 'git', 'blocked-remotes.gitconfig');
  assert.match(gitconfig, /insteadOf = https:\/\/github\.com\/phonarawd\/AI-Profit-OS/);
  assert.match(gitconfig, /insteadOf = https:\/\/github\.com\/phonarawd\/putduk-ops/);
  assert.match(gitconfig, /insteadOf = https:\/\/github\.com\/phonarawd\/putduk-web/);
  const hook = await readRepo('tooling', 'githooks', 'pre-commit');
  assert.match(hook, /block-foreign-repos\.mjs --staged/);
});
