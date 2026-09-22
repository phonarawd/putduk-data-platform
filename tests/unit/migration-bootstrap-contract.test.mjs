import test from 'node:test';
import assert from 'node:assert/strict';
import { readRepo, existsRepo, repoPath } from '../helpers/repo.mjs';
import { readdir } from 'node:fs/promises';

const migration27 = '20260917115001_seed_published_work_ladder_cards_v2.sql';
const bootstrapMigration = '20260922000000_reconcile_published_work_ladder_cards.sql';

test('migration 27은 dependency guard로 안전한 no-op 역할을 한다', async () => {
  const sql = await readRepo('supabase', 'migrations', migration27);

  // 함수 존재 여부 검사
  assert.match(sql, /putduk_admin_upsert_node/);
  assert.match(sql, /pg_proc/);
  assert.match(sql, /pronamespace.*public/);

  // 필수 컬럼 존재 여부 검사
  assert.match(sql, /information_schema\.columns/);
  assert.match(sql, /stake_krw/);
  assert.match(sql, /stipend_krw/);
  assert.match(sql, /tier_band/);
  assert.match(sql, /partner_slug/);
  assert.match(sql, /question_prompt_ko/);
  assert.match(sql, /question_image_path/);
  assert.match(sql, /choice_a_ko/);
  assert.match(sql, /choice_b_ko/);
  assert.match(sql, /daily_cap/);
  assert.match(sql, /requires_assign/);
  assert.match(sql, /is_trial/);

  // super_admin 데이터 의존성 검사
  assert.match(sql, /super_admin/);

  // dependency가 없으면 return (no-op)
  assert.match(sql, /then\s*\n\s*return;/);

  // 원래 시드 로직이 보존됨 (카드 데이터)
  assert.match(sql, /PDK-NODE-TRIAL-DHL/);
  assert.match(sql, /PDK-NODE-ULTRA-1UK-GXO/);

  // 원래 raise exception은 호환성 가드에 의해 return으로 대체됨
  // (super_admin이 없으면 실패 대신 skip)
  assert.match(sql, /if v_admin is null then/);
  assert.match(sql, /return;/);
});

test('migration 27은 dependency guard가 통과하면 원래 동작을 그대로 실행한다', async () => {
  const sql = await readRepo('supabase', 'migrations', migration27);

  // putduk_admin_upsert_node 호출이 보존됨
  assert.match(sql, /public\.putduk_admin_upsert_node/);

  // 13개 카드 JSON 배열이 보존됨
  const cardCount = (sql.match(/PDK-NODE-/g) || []).length;
  assert.ok(cardCount >= 13, `expected at least 13 PDK-NODE references, got ${cardCount}`);
});

test('canonical bootstrap migration이 migration 92 이후에 존재한다', async () => {
  const exists = await existsRepo('supabase', 'migrations', bootstrapMigration);
  assert.ok(exists, 'bootstrap migration file should exist');

  const files = (await readdir(repoPath('supabase', 'migrations')))
    .filter((f) => /^\d+_.*\.sql$/.test(f))
    .sort();

  const bootstrapIdx = files.indexOf(bootstrapMigration);
  assert.ok(bootstrapIdx > 0, 'bootstrap migration should be in the list');

  // migration 27보다 뒤에 있어야 함
  const idx27 = files.indexOf(migration27);
  assert.ok(bootstrapIdx > idx27, 'bootstrap migration must come after migration 27');

  // 마지막에 가까운 migration이어야 함 (index reconciliation 등 후속 migration 허용)
  assert.ok(bootstrapIdx >= files.length - 2, 'bootstrap migration should be last or near-last');
});

test('canonical bootstrap은 putduk_admin_upsert_node에 의존하지 않는다', async () => {
  const sql = await readRepo('supabase', 'migrations', bootstrapMigration);

  // 함수 호출이 없어야 함 (주석은 허용)
  assert.doesNotMatch(
    sql,
    /(?::=|select|perform)\s+public\.putduk_admin_upsert_node/i,
    'bootstrap migration must not call putduk_admin_upsert_node RPC'
  );
});

test('canonical bootstrap은 admin 인증에 의존하지 않는다', async () => {
  const sql = await readRepo('supabase', 'migrations', bootstrapMigration);

  // admin_roles 조회나 assert_admin 호출이 없어야 함
  assert.doesNotMatch(sql, /putduk_assert_admin/);
  assert.doesNotMatch(sql, /private\.admin_roles/);
  // SQL 코드에서 super_admin을 조회하지 않아야 함 (주석은 허용)
  assert.doesNotMatch(sql, /(?:select|from|where).*super_admin/i);
});

test('canonical bootstrap은 13종 카드를 idempotent하게 생성한다', async () => {
  const sql = await readRepo('supabase', 'migrations', bootstrapMigration);

  // 13개 public_id가 모두 포함됨
  const expectedIds = [
    'PDK-NODE-TRIAL-DHL',
    'PDK-NODE-SMALL-30-UPS',
    'PDK-NODE-SMALL-50-FDX',
    'PDK-NODE-SMALL-70-CJ',
    'PDK-NODE-SMALL-100-MSK',
    'PDK-NODE-MID-300-ALI',
    'PDK-NODE-MID-500-EBY',
    'PDK-NODE-MID-1000-GXO',
    'PDK-NODE-HIGH-3000-UPS',
    'PDK-NODE-HIGH-5000-FDX',
    'PDK-NODE-HIGH-10000-CJ',
    'PDK-NODE-ULTRA-3KW-MSK',
    'PDK-NODE-ULTRA-1UK-GXO',
  ];

  for (const id of expectedIds) {
    assert.match(sql, new RegExp(id), `bootstrap must include card ${id}`);
  }

  // on conflict (public_id) do nothing — production-safe idempotent
  // 운영자가 admin UI에서 수정한 카드 값을 덮어쓰지 않는다.
  // fresh DB에서는 카드가 없으므로 insert되고, production에서는 no-op.
  assert.match(sql, /on conflict \(public_id\) do nothing/i);

  // answer keys도 idempotent (do nothing)
  assert.match(sql, /node_answer_keys/);
  assert.match(sql, /on conflict \(node_id\) do nothing/i);
});

test('canonical bootstrap은 dev credential을 포함하지 않는다', async () => {
  const sql = await readRepo('supabase', 'migrations', bootstrapMigration);

  assert.doesNotMatch(sql, /dev-admin/i);
  assert.doesNotMatch(sql, /putduk-dev/i);
  assert.doesNotMatch(sql, /00000000-0000-0000-0000-000000000001/i);
  assert.doesNotMatch(sql, /auth\.users.*insert/i);
});

test('seed.sql이 존재하고 dev admin만 포함한다', async () => {
  const exists = await existsRepo('supabase', 'seed.sql');
  assert.ok(exists, 'seed.sql should exist');

  const sql = await readRepo('supabase', 'seed.sql');

  // dev admin이 포함됨
  assert.match(sql, /dev-admin@local\.putduk/);
  assert.match(sql, /putduk-dev-2026/);
  assert.match(sql, /00000000-0000-0000-0000-000000000001/);
  assert.match(sql, /super_admin/);
  assert.match(sql, /auth\.users/);
  assert.match(sql, /private\.admin_roles/);

  // 13개 카드 시드가 포함되지 않음
  assert.doesNotMatch(sql, /PDK-NODE-/);
  assert.doesNotMatch(sql, /putduk_admin_upsert_node/);
  assert.doesNotMatch(sql, /node_answer_keys/);
});

test('seed.sql은 idempotent하다', async () => {
  const sql = await readRepo('supabase', 'seed.sql');

  assert.match(sql, /on conflict \(id\) do nothing/i);
  assert.match(sql, /on conflict \(user_id\) do nothing/i);
});

test('migration 27과 bootstrap의 카드 데이터가 일치한다', async () => {
  const m27 = await readRepo('supabase', 'migrations', migration27);
  const bootstrap = await readRepo('supabase', 'migrations', bootstrapMigration);

  // 동일한 13개 public_id (중복 제거)
  const ids27 = [...new Set(m27.match(/PDK-NODE-[A-Z0-9-]+/g) || [])].sort();
  const idsBoot = [...new Set(bootstrap.match(/PDK-NODE-[A-Z0-9-]+/g) || [])].sort();

  assert.deepEqual(ids27, idsBoot, 'both migrations must reference the same card public_ids');

  // 동일한 파트너 slug 세트 (migration 27의 JSON에서 추출)
  const partners27 = [...new Set((m27.match(/"partner_slug":"([a-z]+)"/g) || [])
    .map((m) => m.match(/"partner_slug":"([a-z]+)"/)[1]))].sort();
  // bootstrap의 VALUES 절에서 partner_slug 추출
  const knownSlugs = ['dhl','ups','fedex','cj','maersk','alibaba','ebay','gxo'];
  const partnersBoot = [...new Set(knownSlugs.filter((s) => bootstrap.includes(`'${s}'`)))].sort();
  assert.deepEqual(partners27, partnersBoot, 'both migrations must reference the same partner slugs');
});
