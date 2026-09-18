#!/usr/bin/env node
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { EXPECTED_PROJECT_REF, EXPECTED_REPO, loadEnvFiles, keyStatus } from "./lib/load-env.mjs";

const execFileAsync = promisify(execFile);
loadEnvFiles();
let failed = false;

function report(label, ok, detail = "") {
  if (!ok) failed = true;
  console.log(`${label}: ${ok ? "PASS" : "FAIL"}${detail ? ` (${detail})` : ""}`);
}

async function run(command, args) {
  try {
    const { stdout, stderr } = await execFileAsync(command, args, { encoding: "utf8" });
    return { ok: true, stdout: String(stdout || ""), stderr: String(stderr || "") };
  } catch (error) {
    return { ok: false, stdout: String(error.stdout || ""), stderr: String(error.stderr || error.message || "") };
  }
}

const gh = await run("gh", ["auth", "status"]);
report("GitHub authenticated", gh.ok);

const repo = await run("gh", ["repo", "view", "--json", "nameWithOwner", "-q", ".nameWithOwner"]);
const repoName = (repo.stdout || "").trim();
report("correct repository", repoName === EXPECTED_REPO, repoName || "missing");

const supabase = await run("supabase", ["projects", "list", "-o", "json"]);
let projectOk = false;
if (supabase.ok) {
  try {
    const parsed = JSON.parse(supabase.stdout);
    const projects = Array.isArray(parsed) ? parsed : parsed.projects || [];
    projectOk = projects.some((row) => row.ref === EXPECTED_PROJECT_REF || row.id === EXPECTED_PROJECT_REF);
  } catch {
    projectOk = supabase.stdout.includes(EXPECTED_PROJECT_REF);
  }
}
report("Supabase authenticated", supabase.ok);
report("correct Supabase project", projectOk, EXPECTED_PROJECT_REF);

console.log(`SUPABASE_PROJECT_REF: ${keyStatus("SUPABASE_PROJECT_REF")}`);
console.log(`SUPABASE_ACCESS_TOKEN: ${keyStatus("SUPABASE_ACCESS_TOKEN")}`);
console.log(`PUTDUK_PAYOUT_SECRET: ${keyStatus("PUTDUK_PAYOUT_SECRET")}`);

if (failed) process.exit(1);
