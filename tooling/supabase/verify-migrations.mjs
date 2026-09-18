#!/usr/bin/env node
import { execFile } from "node:child_process";
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { promisify } from "node:util";
import { EXPECTED_PROJECT_REF, loadEnvFiles } from "./lib/load-env.mjs";

const execFileAsync = promisify(execFile);
const root = process.cwd();
loadEnvFiles(root);

const aliases = JSON.parse(readFileSync(join(root, "tooling/supabase/migration-aliases.json"), "utf8"));
const localDir = join(root, "supabase/migrations");

function localMigrations() {
  return readdirSync(localDir)
    .filter((name) => /^\d+_.*\.sql$/.test(name))
    .map((name) => {
      const match = name.match(/^(\d+)_(.+)\.sql$/);
      return { version: match[1], name: match[2], file: name };
    })
    .sort((a, b) => a.version.localeCompare(b.version));
}

async function remoteMigrations() {
  const attempts = [
    ["db", "query", "--linked", "-o", "json", "select version, name from supabase_migrations.schema_migrations order by version"],
    ["db", "query", "--linked", "-o", "json", "select version from supabase_migrations.schema_migrations order by version"]
  ];
  let lastError;
  for (const args of attempts) {
    try {
      const { stdout } = await execFileAsync("supabase", args, { encoding: "utf8", cwd: root });
      const jsonText = extractJson(stdout);
      const parsed = JSON.parse(jsonText);
      const rows = Array.isArray(parsed) ? parsed : parsed.rows || parsed.result || [];
      return rows.map((row) => ({
        version: String(row.version || row.VERSION || ""),
        name: String(row.name || row.NAME || "")
      })).filter((row) => row.version);
    } catch (error) {
      lastError = error;
    }
  }
  throw lastError || new Error("remote migrations unavailable");
}

function extractJson(text) {
  const raw = String(text || "").trim();
  const start = raw.search(/[\[{]/);
  if (start < 0) throw new Error("json missing");
  return raw.slice(start);
}

function equivalentVersions(name) {
  return new Set(aliases.name_equivalent?.[name] || []);
}

function isRemoteHistory(version, name) {
  return (aliases.remote_history_only || []).some((row) => row.version === version && (!name || row.name === name));
}

const local = localMigrations();
let remote;
try {
  remote = await remoteMigrations();
} catch (error) {
  console.error("운영 마이그레이션 이력을 읽지 못했습니다.");
  process.exit(1);
}

const localVersions = new Set(local.map((row) => row.version));
const remoteVersions = new Set(remote.map((row) => row.version));
const remoteByName = new Map();
for (const row of remote) remoteByName.set(row.name, row.version);

const unapplied = [];
const nameEquivalentPending = [];
for (const row of local) {
  if (remoteVersions.has(row.version)) continue;
  const remoteVersion = remoteByName.get(row.name);
  const aliasesForName = equivalentVersions(row.name);
  if (remoteVersion && (aliasesForName.has(row.version) || aliasesForName.has(remoteVersion))) {
    nameEquivalentPending.push({ local: row.version, remote: remoteVersion, name: row.name });
    continue;
  }
  unapplied.push(row.version);
}

const unexpectedRemote = [];
for (const row of remote) {
  if (localVersions.has(row.version)) continue;
  if (isRemoteHistory(row.version, row.name)) continue;
  const aliasesForName = equivalentVersions(row.name);
  if (aliasesForName.has(row.version)) continue;
  unexpectedRemote.push(row.version);
}

console.log(`project_ref_expected: ${EXPECTED_PROJECT_REF}`);
console.log(`local_count: ${local.length}`);
console.log(`remote_count: ${remote.length}`);
if (unapplied.length) console.log(`github_unapplied: ${unapplied.join(",")}`);
if (nameEquivalentPending.length) {
  console.log(`name_equivalent: ${nameEquivalentPending.map((row) => `${row.name}:${row.remote}->${row.local}`).join(",")}`);
}
if (unexpectedRemote.length) console.log(`remote_only_unexpected: ${unexpectedRemote.join(",")}`);

if (unexpectedRemote.length) {
  console.error("Migration drift: FAIL");
  process.exit(1);
}

if (unapplied.length) {
  console.log("Migration drift: UNAPPLIED");
  process.exit(2);
}

console.log("Migration drift: PASS");
