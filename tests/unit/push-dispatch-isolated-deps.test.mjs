import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const edge = fs.readFileSync(path.join(root, "supabase/functions/push-dispatch/index.ts"), "utf8");
const helper = fs.readFileSync(path.join(root, "supabase/functions/push-dispatch/_shared.ts"), "utf8");
assert.match(edge, /putduk_push_authorize_dispatch/);
assert.match(edge, /p_dispatch_token/);
assert.match(edge, /result\.failed > 0/);
assert.match(helper, /failed \+= 1/);
console.log("push-dispatch isolated dependency contract: ok");
