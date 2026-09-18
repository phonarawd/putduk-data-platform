#!/usr/bin/env node
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { loadEnvFiles } from "../supabase/lib/load-env.mjs";

loadEnvFiles();
const root = process.cwd();
const sha = process.env.GITHUB_SHA || process.env.PUTDUK_DEPLOY_SHA || "";
const memberUrl = String(process.env.MEMBER_URL || process.env.MEMBER_DOMAIN || "https://app.hiptk.app").replace(/\/$/, "");
const opsUrl = String(process.env.OPS_URL || process.env.OPS_DOMAIN || "https://ops.hiptk.app").replace(/\/$/, "");
const member = memberUrl.startsWith("http") ? memberUrl : `https://${memberUrl}`;
const ops = opsUrl.startsWith("http") ? opsUrl : `https://${opsUrl}`;

function distOk() {
  const index = join(root, "dist/index.html");
  const admin = join(root, "dist/admin/index.html");
  const css = join(root, "dist/assets/app.css");
  const js = join(root, "dist/assets/app.js");
  const manifest = join(root, "dist/manifest.webmanifest");
  const sw = join(root, "dist/sw.js");
  return [index, admin, css, js, manifest, sw].every((file) => existsSync(file));
}

async function inspect(url) {
  const response = await fetch(url, { redirect: "follow" });
  const contentType = response.headers.get("content-type") || "";
  const body = await response.text();
  return {
    status: response.status,
    html: contentType.includes("text/html") && body.includes("퍼뜩"),
    contentType
  };
}

function leakScan() {
  const files = [
    "dist/index.html",
    "dist/admin/index.html",
    "dist/assets/app.js",
    "dist/admin/admin.js"
  ];
  const haystack = files.map((file) => {
    const full = join(root, file);
    return existsSync(full) ? readFileSync(full, "utf8") : "";
  }).join("\n");
  const forbidden = [
    "service_role",
    "SUPABASE_SERVICE_ROLE_KEY",
    "PUTDUK_PAYOUT_SECRET",
    "CLOUDFLARE_API_TOKEN",
    "SUPABASE_ACCESS_TOKEN",
    "sb_secret_"
  ];
  return forbidden.every((token) => !haystack.includes(token));
}

if (!distOk()) {
  console.error("Build output: FAIL");
  process.exit(1);
}
console.log("Build output: PASS");

const memberResult = await inspect(`${member}/`);
const opsResult = await inspect(`${ops}/admin/`);
console.log(`Member site: domain=${member} HTTP=${memberResult.status} html=${memberResult.html}`);
console.log(`Ops site: domain=${ops} HTTP=${opsResult.status} html=${opsResult.html}`);
if (sha) console.log(`commit_sha: ${sha}`);

const leak = leakScan();
console.log(`Secret leak scan: ${leak ? "PASS" : "FAIL"}`);

const ok = memberResult.status === 200 && memberResult.html && opsResult.status === 200 && opsResult.html && leak;
if (!ok) process.exit(1);
console.log("Cloudflare verify: PASS");
