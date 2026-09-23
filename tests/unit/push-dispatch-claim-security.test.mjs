import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, "../..");
const edge = fs.readFileSync(path.join(root, "supabase/functions/push-dispatch/index.ts"), "utf8");
const migration = fs.readFileSync(
  path.join(root, "supabase/migrations/20260923121500_harden_push_dispatch_claim.sql"),
  "utf8"
);

assert.match(edge, /dispatchToken/);
assert.match(edge, /p_dispatch_token/);
assert.match(migration, /dispatch_claimed_at/);
assert.match(migration, /dispatch_token uuid/);
assert.match(migration, /o\.dispatch_token is null/);
assert.match(migration, /interval '15 minutes'/);
assert.match(migration, /dispatch_token = p_dispatch_token/);

console.log("push-dispatch claim security contract: ok");
