#!/usr/bin/env node
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { loadEnvFiles, keyStatus, isPresent } from "../supabase/lib/load-env.mjs";

const execFileAsync = promisify(execFile);
loadEnvFiles();

const token = process.env.CLOUDFLARE_API_TOKEN;
const expectedProject = process.env.CLOUDFLARE_PAGES_PROJECT
  || process.env.CLOUDFLARE_MEMBER_PROJECT
  || "putduk-data-platform";

function report(label, ok, detail = "") {
  console.log(`${label}: ${ok ? "PASS" : "FAIL"}${detail ? ` (${detail})` : ""}`);
  return ok;
}

if (!isPresent(token)) {
  report("Cloudflare auth", false, "CLOUDFLARE_API_TOKEN missing");
  process.exit(1);
}

const accountsRes = await fetch("https://api.cloudflare.com/client/v4/accounts?per_page=50", {
  headers: { Authorization: `Bearer ${token}` }
});
if (!accountsRes.ok) {
  report("Cloudflare auth", false, `accounts ${accountsRes.status}`);
  process.exit(1);
}
const accountsJson = await accountsRes.json();
const accounts = accountsJson.result || [];
const accountId = process.env.CLOUDFLARE_ACCOUNT_ID || accounts[0]?.id || "";
report("Cloudflare auth", true);
report("Account detected", Boolean(accountId));
if (accountId && !process.env.CLOUDFLARE_ACCOUNT_ID) {
  process.env.CLOUDFLARE_ACCOUNT_ID = accountId;
}

let pagesType = "unknown";
if (accountId) {
  const pagesRes = await fetch(`https://api.cloudflare.com/client/v4/accounts/${accountId}/pages/projects`, {
    headers: { Authorization: `Bearer ${token}` }
  });
  if (pagesRes.ok) {
    const pagesJson = await pagesRes.json();
    const projects = pagesJson.result || [];
    const found = projects.find((row) => row.name === expectedProject);
    pagesType = found ? "Pages" : projects.length ? "Pages (project missing)" : "Pages (none)";
    report("Pages project", Boolean(found), expectedProject);
  } else {
    report("Pages project", false, `status ${pagesRes.status}`);
  }
}
console.log(`Pages/Workers detected: ${pagesType}`);
console.log(`CLOUDFLARE_API_TOKEN: ${keyStatus("CLOUDFLARE_API_TOKEN")}`);
console.log(`CLOUDFLARE_ACCOUNT_ID: ${keyStatus("CLOUDFLARE_ACCOUNT_ID")}`);

if (isPresent(process.env.CLOUDFLARE_ACCOUNT_ID)) {
  const dir = mkdtempSync(join(tmpdir(), "putduk-cf-"));
  const file = join(dir, ".env");
  try {
    writeFileSync(file, `CLOUDFLARE_ACCOUNT_ID=${process.env.CLOUDFLARE_ACCOUNT_ID}\n`, { encoding: "utf8", mode: 0o600 });
    await execFileAsync("gh", ["secret", "set", "-f", file, "--repo", "phonarawd/putduk-data-platform"], { encoding: "utf8" });
    console.log("CLOUDFLARE_ACCOUNT_ID → GitHub: SYNCED");
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

await execFileAsync("gh", ["variable", "set", "CLOUDFLARE_PAGES_PROJECT", "--repo", "phonarawd/putduk-data-platform", "--body", expectedProject], { encoding: "utf8" });
await execFileAsync("gh", ["variable", "set", "CLOUDFLARE_MEMBER_PROJECT", "--repo", "phonarawd/putduk-data-platform", "--body", expectedProject], { encoding: "utf8" });
await execFileAsync("gh", ["variable", "set", "MEMBER_DOMAIN", "--repo", "phonarawd/putduk-data-platform", "--body", "app.hiptk.app"], { encoding: "utf8" });
await execFileAsync("gh", ["variable", "set", "OPS_DOMAIN", "--repo", "phonarawd/putduk-data-platform", "--body", "ops.hiptk.app"], { encoding: "utf8" });
console.log("GitHub Variables: SYNCED");
