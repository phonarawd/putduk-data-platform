import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const edge = fs.readFileSync(path.join(root, "supabase/functions/push-dispatch/index.ts"), "utf8");
const migration = fs.readFileSync(
  path.join(root, "supabase/migrations/20260923123000_restore_push_dispatch_legacy_contract_v2.sql"),
  "utf8"
);

assert.match(edge, /putduk_push_authorize_dispatch/);
assert.match(edge, /putduk_push_mark_outbox_failed/);
assert.match(edge, /result\.failed > 0/);
assert.match(migration, /dispatch_claimed_at/);
assert.match(migration, /dispatch_token = gen_random_uuid/);
assert.match(migration, /o\.dispatch_token is null/);
assert.match(migration, /interval '15 minutes'/);
assert.match(migration, /revoke all on function public\.putduk_push_authorize_dispatch/);
assert.match(migration, /to service_role/);

console.log("push-dispatch security contract: ok");
