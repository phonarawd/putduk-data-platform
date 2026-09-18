import test from 'node:test';
import assert from 'node:assert/strict';
import { readdir } from 'node:fs/promises';
import { readLaunchFiles, readRepo, repoPath } from '../helpers/repo.mjs';

function extractFunction(sql, qualifiedName) {
  const needle = `create or replace function ${qualifiedName}`;
  const start = sql.toLowerCase().lastIndexOf(needle);
  if (start < 0) return '';
  const rest = sql.slice(start);
  const end = rest.search(/\n\$\$;/);
  return end >= 0 ? rest.slice(0, end) : rest;
}

async function latestSqlDefining(qualifiedName) {
  const dir = repoPath('supabase', 'migrations');
  const files = (await readdir(dir)).filter((name) => name.endsWith('.sql')).sort();
  let last = '';
  for (const name of files) {
    const sql = await readRepo('supabase', 'migrations', name);
    if (sql.toLowerCase().includes(`create or replace function ${qualifiedName}`)) {
      last = sql;
    }
  }
  return last;
}

test('출근 이벤트는 BEFORE INSERT가 아니라 AFTER INSERT에서만 남긴다', async () => {
  const fix = await readRepo(
    'supabase',
    'migrations',
    '20260918160000_putduk_task_start_events_after_insert.sql'
  );
  assert.match(fix, /create or replace function private\.prepare_putduk_task_run/);
  assert.match(fix, /create or replace function private\.record_putduk_task_run_started/);
  assert.match(fix, /after insert on public\.task_runs/);
  assert.match(fix, /오늘 이용 가능한 업무 횟수를 모두 사용했어요\. 자정에 다시 채워져요\./);
  assert.match(fix, /private\.putduk_lock_stake/);

  const prepareBody = extractFunction(fix, 'private.prepare_putduk_task_run');
  assert.ok(prepareBody.includes('v_member_daily_limit'));
  assert.doesNotMatch(prepareBody, /insert into public\.task_events/);

  const afterBody = extractFunction(fix, 'private.record_putduk_task_run_started');
  assert.match(afterBody, /insert into public\.task_events/);
  assert.match(afterBody, /assignment_id/);
});

test('마지막 prepare_putduk_task_run 본문에는 task_events insert가 없다', async () => {
  const latest = await latestSqlDefining('private.prepare_putduk_task_run');
  assert.ok(latest, 'prepare_putduk_task_run 정의 마이그레이션이 있어야 한다');
  const prepareBody = extractFunction(latest, 'private.prepare_putduk_task_run');
  assert.ok(prepareBody.includes('return new'));
  assert.doesNotMatch(prepareBody, /insert into public\.task_events/);
});

test('회원 앱은 출근 기록 FK 실패를 쉬운 한글로 안내한다', async () => {
  const { appJs } = await readLaunchFiles();
  assert.match(appJs, /출근 기록을 저장하지 못했어요\. 잠시 후 다시 시도해 주세요\./);
  assert.match(appJs, /task_events/);
  assert.match(appJs, /23503/);
});
