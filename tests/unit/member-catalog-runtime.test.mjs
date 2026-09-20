import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const runtime = fs.readFileSync(new URL('../../dist/assets/member-catalog-runtime.js', import.meta.url), 'utf8');
const css = fs.readFileSync(new URL('../../dist/assets/member-catalog-runtime.css', import.meta.url), 'utf8');
const edge = fs.readFileSync(new URL('../../supabase/functions/member-experience/index.ts', import.meta.url), 'utf8');
const loader = fs.readFileSync(new URL('../../dist/assets/trial-flow-guard.js', import.meta.url), 'utf8');
const stage4 = fs.readFileSync(new URL('../../supabase/migrations/20260921104500_putduk_120_work_catalog_seed.sql', import.meta.url), 'utf8');

test('member catalog keeps only 12 items per increment', () => {
  assert.match(runtime, /const PAGE_SIZE = 12/);
  assert.match(runtime, /rows\.slice\(0, state\.visibleCount\)/);
  assert.match(runtime, /state\.visibleCount \+= PAGE_SIZE/);
  assert.match(runtime, /data-stage7-load-more/);
});

test('Stage 7 takes ownership of node grid so Stage 6 patcher cannot re-add the full list', () => {
  assert.match(runtime, /grid\.id === 'nodeGrid'\) grid\.id = 'stage7NodeGrid'/);
  assert.match(runtime, /grid\.innerHTML = shownRows\.map\(buildCard\)\.join/);
});

test('catalog cards use content visibility and keep existing start hook', () => {
  assert.match(css, /content-visibility:auto/);
  assert.match(runtime, /data-start-node=/);
});

test('generic RPC calls stay behind JWT protected Edge and service role server client', () => {
  assert.match(edge, /SUPABASE_SERVICE_ROLE_KEY/);
  assert.match(edge, /verifiedUserId\(request\)/);
  assert.match(edge, /admin\.rpc\("putduk_member_work_contract"/);
  assert.match(edge, /admin\.rpc\("putduk_member_submit_work_v2"/);
  assert.doesNotMatch(runtime, /SERVICE_ROLE|service_role/i);
});

test('member runtime submits the versioned generic contract and does not contain settlement code', () => {
  assert.match(runtime, /putduk\.work_submission\/1\.0/);
  assert.match(runtime, /schema_version: contract\.schema_version/);
  assert.match(runtime, /template_key: contract\.template_key/);
  assert.match(runtime, /template_version: contract\.template_version/);
  assert.doesNotMatch(runtime, /ledger_entries|wallet_accounts|settle|service_role/i);
});

test('generic contract failure falls back to legacy player', () => {
  assert.match(runtime, /Existing legacy player stays visible when generic contract loading fails/);
  assert.match(runtime, /if \(!contract \|\| contract\.available !== true\) return/);
});

test('Stage 7 loader sequences P4 before Stage 7 runtime', () => {
  assert.match(loader, /data-p4-member-experience/);
  assert.match(loader, /data-stage7-member-runtime/);
  assert.match(loader, /member-catalog-runtime\.js/);
});

test('Stage 4 catalog remains draft and disabled; Stage 7 does not publish it', () => {
  assert.match(stage4, /All nodes stay draft\/disabled/);
  assert.match(stage4, /catalog_status/);
  assert.match(stage4, /'draft'/);
  assert.match(stage4, /false/);
  assert.doesNotMatch(runtime, /update\s+public\.nodes|catalog_status\s*=\s*['"]published/i);
  assert.doesNotMatch(edge, /from\(["']nodes["']\).*update|catalog_status.*published/i);
});
