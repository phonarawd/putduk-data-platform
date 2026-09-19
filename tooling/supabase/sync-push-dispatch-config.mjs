#!/usr/bin/env node
import { execFileSync } from "node:child_process";
import { EXPECTED_PROJECT_REF, isPresent, loadEnvFiles } from "./lib/load-env.mjs";

loadEnvFiles();
const projectRef = process.env.SUPABASE_PROJECT_REF || EXPECTED_PROJECT_REF;
const secret = String(process.env.PUTDUK_PUSH_DISPATCH_SECRET || "").trim();

if (!isPresent(secret)) {
  console.error("PUTDUK_PUSH_DISPATCH_SECRET: MISSING");
  process.exit(1);
}

const escaped = secret.replace(/'/g, "''");
const sql = `
insert into private.putduk_system_config (key, value, updated_at)
values ('push_dispatch_secret', '${escaped}', now())
on conflict (key) do update
  set value = excluded.value,
      updated_at = now();
`.trim();

execFileSync("supabase", ["db", "query", "--linked", sql], {
  encoding: "utf8",
  stdio: "inherit",
  env: { ...process.env, SUPABASE_PROJECT_REF: projectRef }
});

console.log("push_dispatch_secret → DB: SYNCED");
