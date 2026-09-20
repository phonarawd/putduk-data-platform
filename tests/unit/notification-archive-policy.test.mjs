import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const migrationUrl = new URL('../../supabase/migrations/20260920191000_putduk_notification_member_archive.sql', import.meta.url);

async function migrationSql() {
  return readFile(migrationUrl, 'utf8');
}

test('알림 정화는 원본 삭제 대신 회원 비노출 보관 상태를 사용한다', async () => {
  const sql = await migrationSql();
  assert.match(sql, /member_hidden_at\s+timestamptz/i);
  assert.match(sql, /member_hidden_reason\s+text/i);
  assert.match(sql, /member_hidden_at\s+is\s+null/i);
  assert.doesNotMatch(sql, /delete\s+from\s+public\.notifications/i);
});

test('회원은 알림 읽음 시각만 수정할 수 있다', async () => {
  const sql = await migrationSql();
  assert.match(sql, /revoke\s+update\s+on\s+public\.notifications\s+from\s+authenticated/i);
  assert.match(sql, /grant\s+update\s*\(\s*read_at\s*\)\s+on\s+public\.notifications\s+to\s+authenticated/i);
});

test('회원 조회와 읽음 갱신 모두 숨긴 알림을 차단한다', async () => {
  const sql = await migrationSql();
  const hiddenGuards = sql.match(/member_hidden_at\s+is\s+null/gi) || [];
  assert.ok(hiddenGuards.length >= 3);
  assert.match(sql, /create\s+policy\s+notifications_select_own/i);
  assert.match(sql, /create\s+policy\s+notifications_update_own/i);
});
