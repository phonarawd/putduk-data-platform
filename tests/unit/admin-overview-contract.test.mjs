import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const src = readFileSync('dist/admin/admin-overview-contract.js', 'utf8');
const html = readFileSync('dist/admin/index.html', 'utf8');

assert.match(src, /Asia\/Seoul/, 'business-day comparison must use Korea time');
assert.match(src, /TERMINAL = new Set\(\['approved', 'rework', 'rejected'\]\)/, 'processed KPI must exclude pending states');
assert.match(src, /오늘 처리 업무/, 'processed KPI must be patched');
assert.match(src, /오늘 확정 보상/, 'approved reward KPI must be patched');
assert.match(src, /현재 대기/, 'flow summary must show current pending separately');
assert.match(src, /adminChart/, 'legacy misleading chart must be replaced');
assert.doesNotMatch(src, /bot_enabled|crowd_min|crowd_max|burn_per_minute|crew_pulse/, 'protected FOMO settings must stay untouched');
assert.match(html, /admin-overview-contract\.js\?v=20260920-p2overview1/, 'admin overview contract asset must be loaded');

console.log('admin overview contract: 8/8 PASS');
