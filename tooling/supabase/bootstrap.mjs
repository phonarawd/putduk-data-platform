#!/usr/bin/env node
import { spawnSync } from "node:child_process";
import { EXPECTED_PROJECT_REF, loadEnvFiles } from "./lib/load-env.mjs";

loadEnvFiles();
const apply = process.argv.includes("--apply");
const reencrypt = process.argv.includes("--reencrypt");
const deployEdge = process.argv.includes("--deploy-edge");

function run(script, extraArgs = []) {
  const result = spawnSync(process.execPath, [script, ...extraArgs], {
    stdio: "inherit",
    cwd: process.cwd(),
    env: process.env
  });
  if (result.status !== 0) process.exit(result.status || 1);
}

console.log(`project_ref: ${EXPECTED_PROJECT_REF}`);
run("tooling/supabase/check-env.mjs");
run("tooling/supabase/check-auth.mjs");
run("tooling/supabase/verify-functions-graph.mjs");

if (apply) {
  run("tooling/supabase/sync-secrets.mjs");
}

const drift = spawnSync(process.execPath, ["tooling/supabase/verify-migrations.mjs"], {
  stdio: "inherit",
  cwd: process.cwd(),
  env: process.env
});
if (drift.status === 1) process.exit(1);

if (apply && (drift.status === 2 || drift.status === 0)) {
  const push = spawnSync("supabase", ["db", "push", "--linked", "--yes"], {
    stdio: "inherit",
    cwd: process.cwd(),
    env: process.env
  });
  if (push.status !== 0) process.exit(push.status || 1);
  run("tooling/supabase/verify-migrations.mjs");
}

if (deployEdge) {
  for (const name of ["admin-control", "member-finance"]) {
    const deployed = spawnSync("supabase", ["functions", "deploy", name, "--project-ref", EXPECTED_PROJECT_REF], {
      stdio: "inherit",
      cwd: process.cwd(),
      env: process.env
    });
    if (deployed.status !== 0) process.exit(deployed.status || 1);
  }
}

if (reencrypt) run("tooling/supabase/reencrypt-payout.mjs");
if (apply || deployEdge) run("tooling/supabase/verify-edge.mjs");
if (apply) run("tooling/supabase/verify-integrity.mjs");

console.log("Bootstrap: PASS");
