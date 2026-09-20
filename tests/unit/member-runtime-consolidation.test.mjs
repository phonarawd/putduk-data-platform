import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const core = fs.readFileSync(new URL('../../dist/assets/member-runtime-core.js', import.meta.url), 'utf8');
const p4 = fs.readFileSync(new URL('../../dist/assets/member-experience-p4.js', import.meta.url), 'utf8');
const catalog = fs.readFileSync(new URL('../../dist/assets/member-catalog-runtime.js', import.meta.url), 'utf8');
const trial = fs.readFileSync(new URL('../../dist/assets/trial-flow-guard.js', import.meta.url), 'utf8');
const index = fs.readFileSync(new URL('../../dist/index.html', import.meta.url), 'utf8');

test('member sidecars share one Supabase client and auth fan-out', () => {
  assert.equal((core.match(/createClient\(/g) || []).length, 1);
  assert.match(core, /window\.PUTDUK_MEMBER_RUNTIME = Object\.freeze/);
  assert.match(core, /function onAuthStateChange/);
  assert.doesNotMatch(p4, /window\.supabase\.createClient/);
  assert.doesNotMatch(catalog, /window\.supabase\.createClient/);
  assert.match(p4, /runtime\.onAuthStateChange/);
  assert.match(catalog, /runtime\.onAuthStateChange/);
});

test('Stage 6 and Stage 7 use the shared mutation observer hub', () => {
  assert.equal((core.match(/new MutationObserver/g) || []).length, 1);
  assert.doesNotMatch(p4, /new MutationObserver/);
  assert.doesNotMatch(catalog, /new MutationObserver/);
  assert.doesNotMatch(trial, /new MutationObserver/);
  assert.match(p4, /runtime\.observeMutations/);
  assert.match(catalog, /runtime\.observeMutations/);
  assert.match(trial, /runtime\?\.observeMutations/);
});

test('runtime core loads after Supabase and before member patch loaders', () => {
  const supabaseAt = index.indexOf('vendor/supabase.min.js');
  const coreAt = index.indexOf('member-runtime-core.js');
  const trialAt = index.indexOf('trial-flow-guard.js');
  assert.ok(supabaseAt >= 0 && supabaseAt < coreAt);
  assert.ok(coreAt < trialAt);
});

test('catalog pagination, generic fallback, and FOMO boundary remain intact', () => {
  assert.match(catalog, /const PAGE_SIZE = 12/);
  assert.match(catalog, /rows\.slice\(0, state\.visibleCount\)/);
  assert.match(catalog, /Existing legacy player stays visible when generic contract loading fails/);
  assert.doesNotMatch(core, /FOMO|synthetic|crowd|live slots/i);
});
