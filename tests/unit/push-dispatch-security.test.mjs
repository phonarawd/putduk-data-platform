import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, "../..");
const edge = fs.readFileSync(path.join(root, "supabase/functions/push-dispatch/index.ts"), "utf8");
const webPush = fs.readFileSync(path.join(root, "supabase/functions/_shared/web-push.ts"), "utf8");
const migration = fs.readFileSync(
  path.join(root, "supabase/migrations/20260923120000_harden_push_dispatch_authorization.sql"),
  "utf8"
);

assert.match(edge, /putduk_push_authorize_dispatch/);
assert.match(edge, /putduk_push_mark_outbox_failed/);
assert.match(edge, /result\.failed > 0/);
assert.match(edge, /sent === 0 && result\.removed === 0/);
assert.match(webPush, /let failed = 0/);
assert.match(webPush, /failed \+= 1/);
assert.match(webPush, /return \{ sent, removed, failed \}/);
assert.match(migration, /create unique index if not exists push_outbox_notification_id_uidx/);
assert.match(migration, /revoke all on function public\.putduk_push_authorize_dispatch/);
assert.match(migration, /grant execute on function public\.putduk_push_authorize_dispatch[\s\S]*to service_role/);
assert.match(migration, /revoke all on function public\.putduk_push_mark_outbox_failed/);
assert.match(migration, /grant execute on function public\.putduk_push_mark_outbox_failed[\s\S]*to service_role/);

console.log("push-dispatch security contract: ok");
