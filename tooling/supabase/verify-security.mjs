#!/usr/bin/env node
import { spawnSync } from "node:child_process";
import { EXPECTED_PROJECT_REF, loadEnvFiles } from "./lib/load-env.mjs";

loadEnvFiles();
const result = spawnSync("supabase", [
  "db",
  "advisors",
  "--linked",
  "--type",
  "security",
  "--fail-on",
  "error",
  "-o",
  "json"
], {
  encoding: "utf8",
  cwd: process.cwd(),
  env: process.env
});

if (result.stdout?.trim()) {
  try {
    const parsed = JSON.parse(result.stdout);
    const rows = Array.isArray(parsed) ? parsed : parsed.lints || parsed.advisors || [];
    for (const row of rows) {
      const level = String(row.level || row.severity || "").toUpperCase();
      const name = row.name || row.title || "advisor";
      if (name === "auth_leaked_password_protection" || String(row.title || "").includes("Leaked Password Protection")) {
        console.log(`advisor_warn_ignored: ${name}`);
        continue;
      }
      console.log(`advisor: ${level} ${name}`);
    }
  } catch {
    console.log("advisor_raw_parsed: no");
  }
}

if (result.status !== 0) {
  console.error("Security advisors: FAIL");
  process.exit(result.status || 1);
}
console.log(`project_ref: ${EXPECTED_PROJECT_REF}`);
console.log("Security advisors: PASS (error-level only; leaked password protection is documented separately)");
