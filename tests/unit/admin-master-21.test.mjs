import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const ia = fs.readFileSync(new URL('../../dist/admin/admin-master-ia.js', import.meta.url), 'utf8');
const app = fs.readFileSync(new URL('../../dist/assets/app-ia13.js', import.meta.url), 'utf8');
const html = fs.readFileSync(new URL('../../dist/admin/index.html', import.meta.url), 'utf8');
const migration = fs.readFileSync(new URL('../../supabase/migrations/20260921120000_putduk_admin_master_21.sql', import.meta.url), 'utf8');
const edge = fs.readFileSync(new URL('../../supabase/functions/admin-master/index.ts', import.meta.url), 'utf8');

const labels = [
  { id: 'overview', label: '전체 현황' },
  { id: 'members', label: '회원 관리' },
  { id: 'operations', label: '업무 운영' },
  { id: 'reviews', label: '업무 검수' },
  { id: 'finance', label: '입출금 처리' },
  { id: 'notifications', label: '공지·알림' },
  { id: 'settings', label: '설정·기타 운영' }
];

test('admin sidebar keeps exactly seven core menus and master no longer replaces them', () => {
  for (const item of labels) assert.match(app, new RegExp(`id: '${item.id}', label: '${item.label}'`));
  assert.match(app, /isAdmin \? \[/);
  assert.doesNotMatch(ia, /const MASTER_MENU = \[/);
  assert.doesNotMatch(ia, /replaceSidebar/);
  assert.doesNotMatch(ia, /운영 메뉴 · 21개/);
  assert.match(ia, /page === 'operations'/);
  assert.match(ia, /page === 'settings'/);
});

test('admin gateway is switched to admin-master without changing member endpoints', () => {
  assert.match(html, /functions\/v1\/admin-master/);
  assert.match(html, /memberOrigin: 'https:\/\/app\.hiptk\.app'/);
});

test('funding foundation is private and settlement tables are not altered', () => {
  assert.match(migration, /private\.partner_funding_pools/);
  assert.match(migration, /private\.partner_budget_allocations/);
  assert.match(migration, /private\.partner_budget_ledger/);
  assert.doesNotMatch(migration, /alter table\s+(public\.)?wallet_accounts/i);
  assert.doesNotMatch(migration, /alter table\s+private\.ledger_entries/i);
});

test('synthetic FOMO storage is protected from Stage 5 writes', () => {
  for (const name of ['crew_pulse','burn_per_minute','crowd_min','crowd_max']) {
    assert.doesNotMatch(migration, new RegExp(`(?:insert|update|delete|alter)[\\s\\S]{0,80}${name}`, 'i'));
    assert.doesNotMatch(edge, new RegExp(`(?:insert|update|delete)[\\s\\S]{0,80}${name}`, 'i'));
  }
  assert.match(ia, /Stage 9에서 실제값 기반으로 전환/);
});

test('admin content and audit are server-backed through verified edge boundary', () => {
  assert.match(edge, /putduk_admin_has_role/);
  assert.match(edge, /putduk_admin_append_audit/);
  assert.match(edge, /list_master_ops/);
  assert.match(edge, /save_admin_content/);
  assert.match(edge, /save_funding/);
});

test('screen preview is explicitly local-only and never invokes a money action', () => {
  assert.match(ia, /실제 지갑과 원장은 변경하지 않습니다/);
  const preview = ia.slice(ia.indexOf('function renderPreview'), ia.indexOf('function renderLandingMetrics'));
  assert.doesNotMatch(preview, /adjust_balance|withdraw|deposit|ledger|adminRequest\(/);
});

test('Stage 5 foreign keys have covering indexes', () => {
  const fk = fs.readFileSync(new URL('../../supabase/migrations/20260921120500_putduk_admin_master_fk_indexes.sql', import.meta.url), 'utf8');
  for (const index of [
    'partner_funding_pools_created_by_idx','partner_funding_pools_updated_by_idx','partner_budget_allocations_updated_by_idx',
    'partner_budget_ledger_actor_id_idx','admin_content_items_created_by_idx','admin_content_items_updated_by_idx'
  ]) assert.match(fk, new RegExp(index));
});
