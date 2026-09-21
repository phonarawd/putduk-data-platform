import test from 'node:test';
import assert from 'node:assert/strict';
import { readRepo } from '../helpers/repo.mjs';

const expectedAliases = {
  putduk_p0_fk_indexes: ['20260921013000', '20260920163207'],
  putduk_generic_work_engine: ['20260921090000', '20260920171138'],
  putduk_generic_work_engine_rpc_security: ['20260921091500', '20260920171505'],
  putduk_work_catalog_fingerprint: ['20260921103000', '20260920173805'],
  putduk_work_catalog_metadata_helpers: ['20260921103500', '20260920173839'],
  putduk_work_catalog_fixture_helper: ['20260921104000', '20260920173943'],
  putduk_work_catalog_internal_source: ['20260921104200', '20260920174003'],
  putduk_120_work_catalog_seed: ['20260921104500', '20260920174201'],
  putduk_admin_master_21: ['20260921120000', '20260920183928'],
  putduk_admin_master_fk_indexes: ['20260921120500', '20260920184116'],
  putduk_member_experience_snapshot: ['20260921133000', '20260920190731']
};

test('v0.2.0 이전 Production 적용 migration은 alias로 흡수하고 Phase 1은 신규로 남긴다', async () => {
  const aliases = JSON.parse(await readRepo('tooling/supabase/migration-aliases.json'));

  for (const [name, versions] of Object.entries(expectedAliases)) {
    assert.deepEqual(aliases.name_equivalent?.[name], versions, name);
  }

  assert.equal(aliases.name_equivalent?.phase1_kst_day_boundary, undefined);
  assert.equal(
    (aliases.remote_history_only || []).some((row) => row.name === 'phase1_kst_day_boundary'),
    false
  );
});

test('migration verifier는 same-name version aliases를 drift가 아닌 equivalent로 처리한다', async () => {
  const verifier = await readRepo('tooling/supabase/verify-migrations.mjs');

  assert.match(verifier, /remoteByName\.get\(row\.name\)/);
  assert.match(verifier, /aliasesForName\.has\(row\.version\)/);
  assert.match(verifier, /aliasesForName\.has\(remoteVersion\)/);
  assert.match(verifier, /nameEquivalentPending\.push/);
  assert.match(verifier, /Migration drift: UNAPPLIED/);
});
