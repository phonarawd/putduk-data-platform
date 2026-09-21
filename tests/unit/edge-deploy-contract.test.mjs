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

test('운영 Edge 9개는 PUTDUK_ALLOWED_ORIGINS allow-list 계약을 공유하고 Origin 반사형 CORS를 금지한다', async () => {
  const [checkEnv, syncSecrets, verifyEdge, sharedHttp] = await Promise.all([
    readRepo('tooling/supabase/check-env.mjs'),
    readRepo('tooling/supabase/sync-secrets.mjs'),
    readRepo('tooling/supabase/verify-edge.mjs'),
    readRepo('supabase/functions/_shared/http.ts')
  ]);

  assert.match(checkEnv, /PUTDUK_ALLOWED_ORIGINS/);
  assert.match(syncSecrets, /supabaseSecret\("PUTDUK_ALLOWED_ORIGINS"/);
  assert.match(verifyEdge, /PUTDUK_ALLOWED_ORIGINS/);
  assert.match(verifyEdge, /cors_allowed/);
  assert.match(verifyEdge, /cors_denied_reflection/);
  assert.match(sharedHttp, /PUTDUK_ALLOWED_ORIGINS/);
  assert.doesNotMatch(sharedHttp, /headers\.get\(["']origin["']\)\s*\|\|\s*["']\*["']/);

  for (const name of edgeFunctions) {
    const source = await readRepo(`supabase/functions/${name}/index.ts`);
    const importsSharedCors = /import\s*\{[^}]*\bcorsHeaders\b[^}]*\}\s*from\s*["']\.\.\/_shared\/http\.ts["']/.test(source);
    const hasLocalAllowlist = source.includes('PUTDUK_ALLOWED_ORIGINS');

    assert.equal(importsSharedCors || hasLocalAllowlist, true, `cors allow-list:${name}`);
    assert.doesNotMatch(source, /headers\.get\(["']origin["']\)\s*\|\|\s*["']\*["']/, `origin reflection:${name}`);
  }
});
