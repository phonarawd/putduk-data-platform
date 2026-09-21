import test from 'node:test';
import assert from 'node:assert/strict';
import { readRepo } from '../helpers/repo.mjs';

test('Edge rollback은 대상 SHA에 없는 관리 함수를 silent skip하지 않는다', async () => {
  const [workflow, rollback] = await Promise.all([
    readRepo('.github/workflows/rollback.yml'),
    readRepo('tooling/supabase/rollback-edge.mjs')
  ]);

  assert.match(workflow, /delete_absent_functions/);
  assert.match(workflow, /path:\s*rollback-target/);
  assert.match(workflow, /rollback-edge\.mjs/);
  assert.match(workflow, /--delete-absent/);
  assert.doesNotMatch(workflow, /is not present at \$ROLLBACK_SHA; skipping/);

  assert.match(rollback, /Rollback plan: DRY RUN/);
  assert.match(rollback, /--apply/);
  assert.match(rollback, /--delete-absent/);
  assert.match(rollback, /functions", "delete/);
  assert.match(rollback, /expected=\$\{shouldExist \? "ACTIVE" : "ABSENT"\}/);
  assert.match(rollback, /EDGE_FUNCTIONS/);
});

test('Supabase Auth verifier는 Management API를 GET-only로 읽고 URL config만 판정한다', async () => {
  const auth = await readRepo('tooling/supabase/verify-auth-config.mjs');

  assert.match(auth, /\/v1\/projects\/\$\{projectRef\}\/config\/auth/);
  assert.match(auth, /method:\s*"GET"/);
  assert.doesNotMatch(auth, /method:\s*"PATCH"/);
  assert.doesNotMatch(auth, /method:\s*"POST"/);
  assert.match(auth, /config\?\.site_url/);
  assert.match(auth, /config\?\.uri_allow_list/);
  assert.match(auth, /PUTDUK_AUTH_REDIRECT_URLS/);
  assert.match(auth, /member and ops origins must differ/);
  assert.match(auth, /global\/host wildcard/);
  assert.doesNotMatch(auth, /console\.log\([^\n]*token/);
});
