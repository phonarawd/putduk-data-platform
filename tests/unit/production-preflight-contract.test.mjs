import test from 'node:test';
import assert from 'node:assert/strict';
import { readRepo } from '../helpers/repo.mjs';

test('Phase 1 KST migration은 공급량 count와 advisory lock을 같은 KST 날짜에 묶는다', async () => {
  const sql = await readRepo('supabase/migrations/20260921102905_phase1_kst_day_boundary.sql');

  assert.equal((sql.match(/created_at >= v_kst_day_start/g) || []).length, 2);
  assert.equal(
    (sql.match(/v_kst_day_start := date_trunc\('day', v_now at time zone 'Asia\/Seoul'\) at time zone 'Asia\/Seoul'/g) || []).length,
    1
  );
  assert.match(sql, /to_char\(v_now at time zone 'Asia\/Seoul', 'YYYY-MM-DD'\)/);
  assert.doesNotMatch(sql, /created_at >= date_trunc\('day', v_now\)/);
  assert.doesNotMatch(sql, /to_char\(v_now, 'YYYY-MM-DD'\)/);
});

test('Production release 순서는 migration 검증/적용/재검증 뒤 Edge와 static으로 진행한다', async () => {
  const doc = await readRepo('docs/v0.2.0-production-preflight.md');

  const migrationPreflight = doc.indexOf('**Phase 1 migration preflight**');
  const migrationApply = doc.indexOf('**Phase 1 migration 적용**');
  const postMigration = doc.indexOf('**Post-migration read-only verification**');
  const cors = doc.indexOf('**Supabase Edge CORS 준비**');
  const edgeDeploy = doc.indexOf('**Edge Function 배포**');
  const staticChange = doc.indexOf('**Static/runtime domain 변경**');
  const staticDeploy = doc.indexOf('**Cloudflare static deploy / smoke**');
  const live = doc.indexOf('**Dedicated live auth E2E**');

  for (const [label, position] of Object.entries({ migrationPreflight, migrationApply, postMigration, cors, edgeDeploy, staticChange, staticDeploy, live })) {
    assert.notEqual(position, -1, label);
  }

  assert.ok(migrationPreflight < migrationApply);
  assert.ok(migrationApply < postMigration);
  assert.ok(postMigration < cors);
  assert.ok(cors < edgeDeploy);
  assert.ok(edgeDeploy < staticChange);
  assert.ok(staticChange < staticDeploy);
  assert.ok(staticDeploy < live);

  assert.match(doc, /20260921102905/);
  assert.match(doc, /member-task-detail/);
  assert.match(doc, /admin-work-asset/);
  assert.match(doc, /[Pp]roduction money\/task mutation은 하지 않는다/);
});
