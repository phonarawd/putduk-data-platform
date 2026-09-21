import test from 'node:test';
import assert from 'node:assert/strict';
import { readRepo } from '../helpers/repo.mjs';

const edgeFunctions = [
  'admin-control',
  'admin-phase5',
  'admin-master',
  'admin-work-asset',
  'member-finance',
  'member-push',
  'member-task-detail',
  'member-experience',
  'push-dispatch'
];

test('운영 Edge deploy/verify/rollback 계약이 모든 함수 디렉터리를 포함한다', async () => {
  const deploy = await readRepo('.github/workflows/supabase-deploy.yml');
  const rollback = await readRepo('.github/workflows/rollback.yml');
  const envLoader = await readRepo('tooling/supabase/lib/load-env.mjs');
  const config = await readRepo('supabase/config.toml');

  for (const name of edgeFunctions) {
    assert.match(deploy, new RegExp(`supabase functions deploy ${name.replace(/[.*+?^${}()|[\\]\\]/g, '\\$&')}`), `deploy:${name}`);
    assert.match(rollback, new RegExp(`\\b${name.replace(/[.*+?^${}()|[\\]\\]/g, '\\$&')}\\b`), `rollback:${name}`);
    assert.match(envLoader, new RegExp(`[\"']${name.replace(/[.*+?^${}()|[\\]\\]/g, '\\$&')}[\"']`), `verify:${name}`);
    assert.match(config, new RegExp(`\\[functions\\.${name.replace(/[.*+?^${}()|[\\]\\]/g, '\\$&')}\\]`), `config:${name}`);
  }

  assert.match(config, /\[functions\.push-dispatch\][\s\S]*?verify_jwt = false/);
  for (const name of edgeFunctions.filter((name) => name !== 'push-dispatch')) {
    const escaped = name.replace(/[.*+?^${}()|[\\]\\]/g, '\\$&');
    assert.match(config, new RegExp(`\\[functions\\.${escaped}\\]\\s*verify_jwt = true`), `verify_jwt:${name}`);
  }
});
