#!/usr/bin/env node
import { execFile } from "node:child_process";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { promisify } from "node:util";
import { encryptPayoutSecret, isPayoutCiphertext } from "../../src/security/payout-crypto.mjs";
import { isPresent, loadEnvFiles } from "./lib/load-env.mjs";

const execFileAsync = promisify(execFile);
loadEnvFiles();
const secret = process.env.PUTDUK_PAYOUT_SECRET;
if (!isPresent(secret)) {
  console.error("PUTDUK_PAYOUT_SECRET 가 없습니다.");
  process.exit(1);
}

function extractJson(text) {
  const raw = String(text || "").trim();
  const start = raw.search(/[\[{]/);
  if (start < 0) throw new Error("json missing");
  return raw.slice(start);
}

async function query(sql) {
  const { stdout } = await execFileAsync("supabase", ["db", "query", "--linked", "-o", "json", sql], {
    encoding: "utf8"
  });
  const parsed = JSON.parse(extractJson(stdout));
  return Array.isArray(parsed) ? parsed : parsed.rows || parsed.result || [];
}

function sqlLiteral(value) {
  return `'${String(value).replaceAll("'", "''")}'`;
}

function isPlain(value) {
  const text = String(value || "").trim();
  return Boolean(text) && !isPayoutCiphertext(text);
}

const rows = await query("select id, account_number, usdt_address, encrypted_value from private.payout_destinations");
let encrypted = 0;
let failed = 0;
const statements = [];

for (const row of rows) {
  const sets = [];
  try {
    if (isPlain(row.account_number)) sets.push(`account_number = ${sqlLiteral(await encryptPayoutSecret(row.account_number, secret))}`);
    if (isPlain(row.usdt_address)) sets.push(`usdt_address = ${sqlLiteral(await encryptPayoutSecret(row.usdt_address, secret))}`);
    if (isPlain(row.encrypted_value)) sets.push(`encrypted_value = ${sqlLiteral(await encryptPayoutSecret(row.encrypted_value, secret))}`);
    if (!sets.length) continue;
    statements.push(`update private.payout_destinations set ${sets.join(", ")} where id = ${sqlLiteral(row.id)}::uuid;`);
    encrypted += 1;
  } catch {
    failed += 1;
  }
}

if (statements.length) {
  const dir = mkdtempSync(join(tmpdir(), "putduk-reenc-"));
  const file = join(dir, "update.sql");
  try {
    writeFileSync(file, `${statements.join("\n")}\n`, { encoding: "utf8", mode: 0o600 });
    await execFileAsync("supabase", ["db", "query", "--linked", "--file", file], { encoding: "utf8" });
  } catch {
    failed += statements.length;
    encrypted = 0;
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

const verified = await query("select account_number, usdt_address, encrypted_value from private.payout_destinations");
let remaining = 0;
for (const row of verified) {
  if (isPlain(row.account_number) || isPlain(row.usdt_address) || isPlain(row.encrypted_value)) remaining += 1;
}

console.log(`total: ${rows.length}`);
console.log(`encrypted: ${encrypted}`);
console.log(`remaining_plaintext: ${remaining}`);
console.log(`failed: ${failed}`);
if (remaining !== 0 || failed !== 0) process.exit(1);
