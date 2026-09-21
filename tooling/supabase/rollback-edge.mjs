#!/usr/bin/env node
import { execFile } from "node:child_process";
import { existsSync } from "node:fs";
import { resolve } from "node:path";
import { promisify } from "node:util";
import { EDGE_FUNCTIONS, EXPECTED_PROJECT_REF, isPresent, loadEnvFiles } from "./lib/load-env.mjs";

const execFileAsync = promisify(execFile);
loadEnvFiles();

function argValue(name, fallback = "") {
  const index = process.argv.indexOf(name);
  return index >= 0 && process.argv[index + 1] ? process.argv[index + 1] : fallback;
}

const apply = process.argv.includes("--apply");
const deleteAbsent = process.argv.includes("--delete-absent");
const targetRoot = resolve(argValue("--target-root", process.cwd()));
const projectRef = String(process.env.SUPABASE_PROJECT_REF || EXPECTED_PROJECT_REF).trim();

if (projectRef !== EXPECTED_PROJECT_REF) {
  console.error("Rollback blocked: SUPABASE_PROJECT_REF does not match production project.");
  process.exit(1);
}
if (apply && !isPresent(process.env.SUPABASE_ACCESS_TOKEN)) {
  console.error("Rollback blocked: SUPABASE_ACCESS_TOKEN is missing.");
  process.exit(1);
}
if (!existsSync(resolve(targetRoot, "supabase", "config.toml"))) {
  console.error("Rollback blocked: target supabase/config.toml is missing.");
  process.exit(1);
}

function parseFunctions(stdout) {
  const parsed = JSON.parse(String(stdout || "[]"));
  return Array.isArray(parsed) ? parsed : Array.isArray(parsed.functions) ? parsed.functions : [];
}

async function listRemote() {
  const { stdout } = await execFileAsync(
    "supabase",
    ["functions", "list", "--project-ref", projectRef, "-o", "json"],
    { encoding: "utf8", cwd: targetRoot, env: process.env, maxBuffer: 4 * 1024 * 1024 }
  );
  return parseFunctions(stdout);
}

function remoteName(row) {
  return String(row?.slug || row?.name || "").trim();
}

const targetFunctions = EDGE_FUNCTIONS.filter((name) => existsSync(resolve(targetRoot, "supabase", "functions", name)));
const remoteBefore = await listRemote();
const remoteManaged = new Set(remoteBefore.map(remoteName).filter((name) => EDGE_FUNCTIONS.includes(name)));
const absentButDeployed = EDGE_FUNCTIONS.filter((name) => !targetFunctions.includes(name) && remoteManaged.has(name));

console.log(`Rollback target root: ${targetRoot}`);
console.log(`Target managed functions: ${targetFunctions.length}/${EDGE_FUNCTIONS.length}`);
console.log(`Managed remote functions to remove: ${absentButDeployed.length}`);

if (absentButDeployed.length && !deleteAbsent) {
  console.error(`Rollback blocked: target SHA does not contain deployed managed function(s): ${absentButDeployed.join(", ")}`);
  console.error("Re-run only after explicitly allowing managed-function deletion with --delete-absent.");
  process.exit(2);
}

if (!apply) {
  console.log("Rollback plan: DRY RUN (no Production changes). Add --apply to execute.");
  process.exit(0);
}

for (const name of targetFunctions) {
  console.log(`Deploy rollback function: ${name}`);
  await execFileAsync(
    "supabase",
    ["functions", "deploy", name, "--project-ref", projectRef],
    { encoding: "utf8", cwd: targetRoot, env: process.env, maxBuffer: 8 * 1024 * 1024 }
  );
}

for (const name of absentButDeployed) {
  console.log(`Delete managed function absent at target: ${name}`);
  await execFileAsync(
    "supabase",
    ["functions", "delete", name, "--project-ref", projectRef, "--yes"],
    { encoding: "utf8", cwd: targetRoot, env: process.env, maxBuffer: 4 * 1024 * 1024 }
  );
}

const remoteAfter = await listRemote();
const afterByName = new Map(remoteAfter.map((row) => [remoteName(row), row]));
let failed = false;

for (const name of EDGE_FUNCTIONS) {
  const shouldExist = targetFunctions.includes(name);
  const row = afterByName.get(name);
  const status = String(row?.status || "").toUpperCase();
  const ok = shouldExist ? Boolean(row) && status === "ACTIVE" : !row;
  if (!ok) failed = true;
  console.log(`${name}: ${ok ? "PASS" : "FAIL"} expected=${shouldExist ? "ACTIVE" : "ABSENT"} actual=${row ? status || "PRESENT" : "ABSENT"}`);
}

if (failed) process.exit(1);
console.log("Edge rollback reconciliation: PASS");
