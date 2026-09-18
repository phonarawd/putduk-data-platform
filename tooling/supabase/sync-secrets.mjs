#!/usr/bin/env node
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { randomBytes } from "node:crypto";
import { EXPECTED_PROJECT_REF, EXPECTED_REPO, isPresent, loadEnvFiles } from "./lib/load-env.mjs";

const execFileAsync = promisify(execFile);
const root = process.cwd();
loadEnvFiles(root);

const localEnvPath = join(root, ".env.cursor.local");
const repo = EXPECTED_REPO;
const projectRef = process.env.SUPABASE_PROJECT_REF || EXPECTED_PROJECT_REF;

function upsertLocal(name, value) {
  let text = "";
  try {
    text = readFileSync(localEnvPath, "utf8");
  } catch {
    text = "# Cursor 로컬 전용. Git에 올리지 않습니다.\n";
  }
  const line = `${name}=${value}`;
  const pattern = new RegExp(`^${name}=.*$`, "m");
  if (pattern.test(text)) text = text.replace(pattern, line);
  else text += `${text.endsWith("\n") || text.length === 0 ? "" : "\n"}${line}\n`;
  writeFileSync(localEnvPath, text, { encoding: "utf8", mode: 0o600 });
}

function ensurePayoutSecret() {
  if (isPresent(process.env.PUTDUK_PAYOUT_SECRET)) return { created: false };
  const value = randomBytes(48).toString("base64");
  process.env.PUTDUK_PAYOUT_SECRET = value;
  upsertLocal("PUTDUK_PAYOUT_SECRET", value);
  return { created: true };
}

async function ghSecret(name, value) {
  const dir = mkdtempSync(join(tmpdir(), "putduk-secret-"));
  const file = join(dir, ".env");
  try {
    writeFileSync(file, `${name}=${value}\n`, { encoding: "utf8", mode: 0o600 });
    await execFileAsync("gh", ["secret", "set", "-f", file, "--repo", repo], {
      encoding: "utf8"
    });
    console.log(`${name} → GitHub: SYNCED`);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

async function supabaseSecret(name, value) {
  const dir = mkdtempSync(join(tmpdir(), "putduk-sbsecret-"));
  const file = join(dir, ".env");
  try {
    writeFileSync(file, `${name}=${value}\n`, { encoding: "utf8", mode: 0o600 });
    await execFileAsync("supabase", ["secrets", "set", "--project-ref", projectRef, "--env-file", file], {
      encoding: "utf8"
    });
    console.log(`${name} → Supabase: SYNCED`);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

mkdirSync(root, { recursive: true });
const generated = ensurePayoutSecret();
if (generated.created) console.log("PUTDUK_PAYOUT_SECRET: CREATED");
else console.log("PUTDUK_PAYOUT_SECRET: EXISTS");

const payout = process.env.PUTDUK_PAYOUT_SECRET;
await ghSecret("PUTDUK_PAYOUT_SECRET", payout);
await supabaseSecret("PUTDUK_PAYOUT_SECRET", payout);

if (isPresent(process.env.SUPABASE_PROJECT_REF) || projectRef) {
  await ghSecret("SUPABASE_PROJECT_REF", projectRef);
}

if (isPresent(process.env.SUPABASE_ACCESS_TOKEN)) {
  const listed = await execFileAsync("gh", ["secret", "list", "--repo", repo], { encoding: "utf8" });
  if (!String(listed.stdout).includes("SUPABASE_ACCESS_TOKEN")) {
    await ghSecret("SUPABASE_ACCESS_TOKEN", process.env.SUPABASE_ACCESS_TOKEN);
  } else {
    console.log("SUPABASE_ACCESS_TOKEN → GitHub: EXISTS");
  }
}

if (isPresent(process.env.CLOUDFLARE_API_TOKEN)) {
  const listed = await execFileAsync("gh", ["secret", "list", "--repo", repo], { encoding: "utf8" });
  if (!String(listed.stdout).includes("CLOUDFLARE_API_TOKEN")) {
    await ghSecret("CLOUDFLARE_API_TOKEN", process.env.CLOUDFLARE_API_TOKEN);
  } else {
    console.log("CLOUDFLARE_API_TOKEN → GitHub: EXISTS");
  }
}

if (isPresent(process.env.CLOUDFLARE_ACCOUNT_ID)) {
  await ghSecret("CLOUDFLARE_ACCOUNT_ID", process.env.CLOUDFLARE_ACCOUNT_ID);
}
