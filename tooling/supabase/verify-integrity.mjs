#!/usr/bin/env node
import { execFile } from "node:child_process";
import { join } from "node:path";
import { promisify } from "node:util";
import { loadEnvFiles } from "./lib/load-env.mjs";

const execFileAsync = promisify(execFile);
const root = process.cwd();
loadEnvFiles(root);

const sqlFile = join(root, "tooling/supabase/verify-integrity.sql");
function extractJson(text) {
  const raw = String(text || "").trim();
  const start = raw.search(/[\[{]/);
  if (start < 0) throw new Error("json missing");
  return raw.slice(start);
}

let stdout;
try {
  ({ stdout } = await execFileAsync("supabase", ["db", "query", "--linked", "-o", "json", "--file", sqlFile], {
    encoding: "utf8",
    cwd: root
  }));
} catch (error) {
  console.error("무결성 SQL을 실행하지 못했습니다.");
  process.exit(1);
}

let row;
try {
  const parsed = JSON.parse(extractJson(stdout));
  const rows = Array.isArray(parsed) ? parsed : parsed.rows || parsed.result || [];
  row = rows[0] || {};
} catch {
  console.error("무결성 결과를 해석하지 못했습니다.");
  process.exit(1);
}

const checks = [
  ["payout_plaintext", 0],
  ["negative_available", 0],
  ["negative_held", 0],
  ["duplicate_wallet_bucket", 0],
  ["multiple_active_task_runs", 0],
  ["self_referral", 0],
  ["duplicate_invitee", 0],
  ["invalid_node_assignment", 0],
  ["invalid_brand_assignment", 0]
];

let failed = false;
for (const [name, expected] of checks) {
  const value = Number(row[name] ?? row[name.toUpperCase()] ?? -1);
  const ok = value === expected;
  if (!ok) failed = true;
  console.log(`${name}: ${value}${ok ? "" : " FAIL"}`);
}
console.log(`payout_encrypted: ${row.payout_encrypted ?? row.PAYOUT_ENCRYPTED ?? "?"}`);
console.log(`payout_total: ${row.payout_total ?? row.PAYOUT_TOTAL ?? "?"}`);

if (failed) {
  console.error("Integrity: FAIL");
  process.exit(1);
}
console.log("Integrity: PASS");
