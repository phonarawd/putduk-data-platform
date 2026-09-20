import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { repoPath } from '../helpers/repo.mjs';

test('generic work engine migration은 MASTER 5-table 모델과 versioned contracts를 제공한다', async () => {
  const sql = await readFile(repoPath('supabase/migrations/20260921090000_putduk_generic_work_engine.sql'), 'utf8');
  for (const table of ['work_templates', 'work_template_versions', 'work_orders', 'task_run_items', 'task_run_answers']) {
    assert.match(sql, new RegExp(`private\\.${table}`));
  }
  assert.match(sql, /putduk\.work\/1\.0/);
  assert.match(sql, /putduk\.work_contract\/1\.0/);
  assert.match(sql, /putduk\.work_submission\/1\.0/);
  assert.match(sql, /putduk\.review\/1\.0/);
  assert.match(sql, /putduk\.stake_stipend\/1\.0/);
  assert.match(sql, /putduk_member_work_contract/);
  assert.match(sql, /putduk_member_submit_work_v2/);
  assert.match(sql, /validation_payload/);
  assert.match(sql, /member_payload/);
  assert.doesNotMatch(sql, /update\s+public\.wallet_accounts/i);
  assert.doesNotMatch(sql, /insert\s+into\s+private\.ledger_entries/i);
});

test('generic submit은 review/settlement를 우회하지 않는다', async () => {
  const sql = await readFile(repoPath('supabase/migrations/20260921090000_putduk_generic_work_engine.sql'), 'utf8');
  const submit = sql.slice(sql.indexOf('create or replace function public.putduk_member_submit_work_v2'));
  assert.match(submit, /status = 'submitted'/);
  assert.match(submit, /reward_status = 'pending'/);
  assert.doesNotMatch(submit, /putduk_release_stake/);
  assert.doesNotMatch(submit, /putduk_grant_stipend/);
  assert.doesNotMatch(submit, /putduk_apply_bucket_delta/);
});
