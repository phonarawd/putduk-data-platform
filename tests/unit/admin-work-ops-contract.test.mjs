import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const read = (path) => readFileSync(new URL(`../../${path}`, import.meta.url), "utf8");

const adminJs = read("dist/admin/admin.js");
const adminEdge = read("supabase/functions/admin-control/index.ts");
const migration = read("supabase/migrations/20260920230000_putduk_admin_assignment_duplicate_guard.sql");

assert.match(adminJs, /function settlementNote\(spec\)/);
assert.match(adminJs, /체험 지원금은 업무에 사용되고, 승인 시 체험 수당만 출금 가능에 들어와요/);
assert.match(adminJs, /승인 시 수당/);
assert.doesNotMatch(adminJs, /원금과 수당이 잔액에 같이 반영돼요/);

assert.match(adminEdge, /status === "published"/);
assert.match(adminEdge, /승인되어 회원에게 공개된 협력사 업무만 공개할 수 있습니다/);
assert.match(adminEdge, /published_by: status === "published" \? userId : null/);

assert.match(migration, /create unique index if not exists task_assignments_one_open_per_user_node_idx/i);
assert.match(migration, /where status in \('active', 'started'\)/i);
assert.match(migration, /pg_advisory_xact_lock\(/i);
assert.match(migration, /같은 회원에게 같은 업무가 이미 배정되어 있습니다/);
assert.match(migration, /status = 'expired'/);

console.log("admin-work-ops-contract: 통과");
