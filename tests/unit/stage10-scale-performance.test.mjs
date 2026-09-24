import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
const core = fs.readFileSync(new URL('../../dist/assets/member-runtime-core.js', import.meta.url), 'utf8');
const p4 = fs.readFileSync(new URL('../../dist/assets/member-experience-p4.js', import.meta.url), 'utf8');
const catalog = fs.readFileSync(new URL('../../dist/assets/member-catalog-runtime.js', import.meta.url), 'utf8');
const app = fs.readFileSync(new URL('../../dist/assets/app-ia13.js', import.meta.url), 'utf8');
const fomoBot = fs.readFileSync(new URL('../../dist/assets/fomo-bot-runtime.js', import.meta.url), 'utf8');
const css = fs.readFileSync(new URL('../../dist/assets/member-catalog-runtime.css', import.meta.url), 'utf8');
const stage4 = fs.readFileSync(new URL('../../supabase/migrations/20260921104500_putduk_120_work_catalog_seed.sql', import.meta.url), 'utf8');
const edge = fs.readFileSync(new URL('../../supabase/functions/member-experience/index.ts', import.meta.url), 'utf8');
const activityIndex = fs.readFileSync(new URL('../../supabase/migrations/20260920205033_stage10_task_runs_real_activity_index.sql', import.meta.url), 'utf8');

test('120 item catalog retains a 12-card DOM increment', () => {
  assert.equal((stage4.match(/^\(\d+,'/gm) || []).length, 120);
  assert.match(catalog, /const PAGE_SIZE = 12/);
  assert.match(catalog, /rows\.slice\(0, state\.visibleCount\)/);
  assert.match(css, /content-visibility:auto/);
});
test('Stage 6 and Stage 7 initial snapshot requests are coalesced', () => {
  assert.match(core, /snapshotPromise/);
  assert.match(core, /maxAgeMs = 2000/);
  assert.match(core, /snapshotToken !== token/);
  assert.match(core, /clearMemberExperienceCache\(\)/);
  assert.match(p4, /runtime\.getMemberExperience/);
  assert.match(catalog, /runtime\.getMemberExperience/);
  assert.doesNotMatch(p4, /JSON\.stringify\(\{ action: 'member_experience' \}\)/);
});
test('observer, client, auth, polling and realtime counts stay bounded', () => {
  assert.equal((core.match(/new MutationObserver/g) || []).length, 1);
  assert.equal((core.match(/createClient\(/g) || []).length, 1);
  assert.equal((core.match(/\.auth\.onAuthStateChange/g) || []).length, 1);
  assert.match(p4, /const POLL_MS = 30_000/);
  assert.doesNotMatch(app, /realActivityFetchedAt/);
  assert.doesNotMatch(app, /action: 'real_activity'/);
  assert.match(fomoBot, /from\('crew_pulse'\)/);
  assert.match(fomoBot, /4000/);
  assert.equal((app.match(/\.channel\(/g) || []).length, 1);
});
test('generic fallback, mobile sizing and privacy boundaries remain intact', () => {
  assert.match(catalog, /Existing legacy player stays visible when generic contract loading fails/);
  assert.match(css, /@media \(max-width:640px\)/);
  assert.match(css, /max-height:100dvh/);
  assert.doesNotMatch(core + p4 + catalog, /SUPABASE_SERVICE_ROLE_KEY|service_role/i);
});

test('real activity query uses only production task_run_status enum values', () => {
  assert.match(edge, /"review_pending"/);
  assert.doesNotMatch(edge, /"under_review"/);
});

test('real activity polling has a bounded partial index', () => {
  assert.match(activityIndex, /task_runs_real_activity_updated_idx/);
  assert.match(activityIndex, /updated_at desc/);
  assert.match(activityIndex, /review_pending/);
  assert.doesNotMatch(activityIndex, /under_review/);
});
