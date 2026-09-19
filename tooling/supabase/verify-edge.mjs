#!/usr/bin/env node
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { EDGE_FUNCTIONS, EXPECTED_PROJECT_REF, isPresent, loadEnvFiles } from "./lib/load-env.mjs";

const execFileAsync = promisify(execFile);
loadEnvFiles();
const projectRef = process.env.SUPABASE_PROJECT_REF || EXPECTED_PROJECT_REF;
const supabaseUrl = String(process.env.SUPABASE_URL || process.env.VITE_PUTDUK_SUPABASE_URL || `https://${EXPECTED_PROJECT_REF}.supabase.co`).replace(/\/$/, "");
const anon = process.env.SUPABASE_ANON_KEY || process.env.SUPABASE_PUBLISHABLE_KEY || process.env.VITE_PUTDUK_SUPABASE_PUBLISHABLE_KEY || "";

function parseFunctions(stdout) {
  try {
    const parsed = JSON.parse(stdout);
    return Array.isArray(parsed) ? parsed : parsed.functions || [];
  } catch {
    return [];
  }
}

const { stdout } = await execFileAsync("supabase", ["functions", "list", "--project-ref", projectRef, "-o", "json"], { encoding: "utf8" });
const listed = parseFunctions(stdout);
let failed = false;

for (const name of EDGE_FUNCTIONS) {
  const row = listed.find((item) => (item.slug || item.name) === name);
  const status = String(row?.status || "").toUpperCase();
  const version = row?.version ?? "?";
  const jwt = row?.verify_jwt;
  const jwtOk = name === "push-dispatch" ? jwt === false : jwt !== false;
  const ok = Boolean(row) && status === "ACTIVE" && jwtOk;
  if (!ok) failed = true;
  console.log(`${name}: ${ok ? "ACTIVE" : "FAIL"} version=${version} verify_jwt=${jwt === false ? "false" : "true"}`);
}

const unauthorizedOk = new Set([401, 403]);
for (const name of EDGE_FUNCTIONS) {
  const headers = { "Content-Type": "application/json" };
  if (isPresent(anon)) headers.apikey = anon;
  const body = name === "member-push" ? JSON.stringify({ action: "subscribe" }) : "{}";
  const response = await fetch(`${supabaseUrl}/functions/v1/${name}`, {
    method: "POST",
    headers,
    body
  });
  const ok = unauthorizedOk.has(response.status);
  if (!ok) failed = true;
  console.log(`${name} unauth_status: ${response.status}${ok ? "" : " FAIL"}`);
}

if (failed) process.exit(1);
console.log("Edge verify: PASS");
