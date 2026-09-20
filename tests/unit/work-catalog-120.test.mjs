import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

import {
  CATALOG_120_SCHEMA,
  WORK_CATALOG_120,
  buildCatalogWorkDefinition,
  catalogSemanticBasis
} from '../../src/work/catalog-120.mjs';

const ALLOWED_COMPONENTS = new Set(['text', 'digits', 'integer', 'boolean', 'choice']);

function unique(values) {
  return new Set(values).size === values.length;
}

test('MASTER catalog contains exactly 120 distinct tasks in 12 groups of 10', () => {
  assert.equal(CATALOG_120_SCHEMA, 'putduk.catalog/1.0');
  assert.equal(WORK_CATALOG_120.length, 120);
  assert.deepEqual(WORK_CATALOG_120.map((task) => task.ordinal), Array.from({ length: 120 }, (_, index) => index + 1));

  const groups = new Map();
  for (const task of WORK_CATALOG_120) {
    groups.set(task.category_code, (groups.get(task.category_code) || 0) + 1);
  }
  assert.equal(groups.size, 12);
  for (const count of groups.values()) assert.equal(count, 10);

  for (const field of ['template_key', 'public_id', 'title_ko', 'purpose_ko', 'reward_krw', 'stake_krw', 'estimated_seconds']) {
    assert.equal(unique(WORK_CATALOG_120.map((task) => task[field])), true, `${field} must be unique`);
  }
});

test('MASTER semantic basis is unique without using title or arbitrary per-task IDs', () => {
  const bases = WORK_CATALOG_120.map((task) => catalogSemanticBasis(task));
  assert.equal(unique(bases), true);

  const fingerprints = bases.map((basis) => createHash('md5').update(basis).digest('hex'));
  assert.equal(unique(fingerprints), true);

  for (const task of WORK_CATALOG_120) {
    assert.doesNotMatch(task.input_kind, /^[a-l]_\d{3}/i);
    assert.doesNotMatch(task.validation_rule, /^[a-l]\.\d{3}/i);
  }
});

test('all 120 definitions use the common work engine contract and meaningful metadata', () => {
  for (const task of WORK_CATALOG_120) {
    assert.ok(ALLOWED_COMPONENTS.has(task.component_type), `${task.template_key}: component`);
    assert.ok(task.input_kind.includes(':'), `${task.template_key}: input schema`);
    assert.ok(task.validation_rule.length >= 8, `${task.template_key}: validation rule`);
    assert.ok(task.evidence_policy_key.endsWith('.v1'), `${task.template_key}: evidence policy`);
    assert.ok(['auto_exact', 'operator_spot_check', 'dual_review'].includes(task.review_mode), `${task.template_key}: review mode`);
    assert.ok(task.estimated_seconds >= 30 && task.estimated_seconds <= 5400);
    assert.ok(task.reward_krw > 0 && task.stake_krw === task.reward_krw * 10);

    const definition = buildCatalogWorkDefinition(task);
    assert.equal(definition.schema_version, 'putduk.work/1.0');
    assert.equal(definition.template_key, task.template_key);
    assert.equal(definition.components.length, 1);
    assert.equal(definition.components[0].type, task.component_type);
    assert.equal(definition.components[0].validation.mode, 'equals_expected');
    assert.equal(definition.components[0].validation.rule, task.validation_rule);
    assert.equal(definition.workflow.steps[0].repeat, 'items');
    assert.deepEqual(definition.workflow.steps[0].component_keys, ['answer']);
    assert.equal(definition.review.mode, task.review_mode);
    assert.equal(definition.catalog_meta.publication_state, 'draft');

    if (task.component_type === 'choice') {
      assert.ok(Array.isArray(definition.components[0].options));
      assert.ok(definition.components[0].options.length >= 2);
    }
  }
});

test('specific MASTER tasks expose domain options instead of placeholder A/B/C', () => {
  const byOrdinal = new Map(WORK_CATALOG_120.map((task) => [task.ordinal, task]));
  assert.deepEqual(byOrdinal.get(5).component_extra.options.map((row) => row.label_ko), ['문앞', '경비실', '기타']);
  assert.deepEqual(byOrdinal.get(9).component_extra.options.map((row) => row.label_ko), ['미배송', '주소불명', '수취거부', '파손']);
  assert.deepEqual(byOrdinal.get(91).component_extra.options.map((row) => row.label_ko), ['배송조회', '배송지연', '분실', '주소변경']);
  assert.match(byOrdinal.get(52).validation_rule, /할인율/);
  assert.match(byOrdinal.get(59).validation_rule, /기준환율/);
  assert.match(byOrdinal.get(116).validation_rule, /변환계수/);
});

test('public catalog source does not contain server-only fixture or expected answers', async () => {
  const source = await readFile(new URL('../../src/work/catalog-120.mjs', import.meta.url), 'utf8');
  assert.doesNotMatch(source, /\bexpected_answer\b/);
  assert.doesNotMatch(source, /\bexpected_payload\b/);
  assert.doesNotMatch(source, /\bmember_payload\b/);
  assert.doesNotMatch(source, /validation_payload/);
});

test('Stage 4 migrations are draft-only and enforce duplicate fingerprints', async () => {
  const paths = [
    '../../supabase/migrations/20260921103000_putduk_work_catalog_fingerprint.sql',
    '../../supabase/migrations/20260921103500_putduk_work_catalog_metadata_helpers.sql',
    '../../supabase/migrations/20260921104000_putduk_work_catalog_fixture_helper.sql',
    '../../supabase/migrations/20260921104200_putduk_work_catalog_internal_source.sql',
    '../../supabase/migrations/20260921104500_putduk_120_work_catalog_seed.sql'
  ];
  const chunks = await Promise.all(paths.map((path) => readFile(new URL(path, import.meta.url), 'utf8')));
  const sql = chunks.join('\n');
  const [fingerprint, , fixture, source, seed] = chunks;

  assert.match(fingerprint, /work_template_versions_semantic_fingerprint_uidx/);
  assert.match(fingerprint, /putduk_work_definition_fingerprint/);
  assert.match(source, /'putduk-internal-catalog'/);
  assert.match(seed, /catalog_status='draft'/);
  assert.match(seed, /enabled=false/);
  assert.match(fixture, /putduk_catalog_fixture/);

  const seedRows = seed.match(/^\(\d+,'[^']+','[^']+','[a-z_]+'\)/gm) || [];
  assert.equal(seedRows.length, 120);

  assert.doesNotMatch(sql, /insert\s+into\s+public\.wallet_accounts/i);
  assert.doesNotMatch(sql, /update\s+public\.wallet_accounts/i);
  assert.doesNotMatch(sql, /insert\s+into\s+private\.ledger_entries/i);
  assert.doesNotMatch(sql, /update\s+private\.ledger_entries/i);
  assert.doesNotMatch(sql, /putduk_member_lock_stake\s*\(/i);
  assert.doesNotMatch(sql, /crew_pulse/i);
});
