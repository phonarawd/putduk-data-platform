#!/usr/bin/env node
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { loadEnvFiles } from "../supabase/lib/load-env.mjs";

loadEnvFiles();
const root = process.cwd();
const sha = process.env.GITHUB_SHA || process.env.PUTDUK_DEPLOY_SHA || "";
const memberInput = String(process.env.MEMBER_URL || process.env.MEMBER_DOMAIN || "").trim();
const opsInput = String(process.env.OPS_URL || process.env.OPS_DOMAIN || "").trim();
if (!memberInput || !opsInput) {
  console.error("Cloudflare verify: FAIL (explicit production domains are required)");
  if (!memberInput) console.error("MEMBER_URL/MEMBER_DOMAIN: MISSING");
  if (!opsInput) console.error("OPS_URL/OPS_DOMAIN: MISSING");
  process.exit(1);
}
const memberUrl = memberInput.replace(/\/$/, "");
const opsUrl = opsInput.replace(/\/$/, "");
const pagesUrl = String(process.env.PAGES_PROJECT_URL || process.env.PAGES_URL || "https://putduk-git-preview.pages.dev").replace(/\/$/, "");
const member = memberUrl.startsWith("http") ? memberUrl : `https://${memberUrl}`;
const ops = opsUrl.startsWith("http") ? opsUrl : `https://${opsUrl}`;
const pages = pagesUrl.startsWith("http") ? pagesUrl : `https://${pagesUrl}`;

function distOk() {
  const index = join(root, "dist/index.html");
  const admin = join(root, "dist/admin/index.html");
  const css = join(root, "dist/assets/app.css");
  const js = join(root, "dist/assets/app-ia13.js");
  const manifest = join(root, "dist/manifest.webmanifest");
  const sw = join(root, "dist/sw.js");
  return [index, admin, css, js, manifest, sw].every((file) => existsSync(file));
}

function normalizeAssetRef(value) {
  try {
    const parsed = new URL(value, "https://putduk.invalid/");
    return `${parsed.pathname.replace(/^\/+/, "")}${parsed.search}`;
  } catch {
    return String(value || "").replace(/^\.\//, "").replace(/^\/+/, "");
  }
}

function htmlFingerprint(body) {
  const scripts = [...String(body || "").matchAll(/<script\b[^>]*\bsrc=["']([^"']+)["'][^>]*>/gi)]
    .map((match) => normalizeAssetRef(match[1]));
  const styles = [...String(body || "").matchAll(/<link\b[^>]*>/gi)]
    .map((match) => match[0])
    .filter((tag) => /\brel=["'][^"']*stylesheet[^"']*["']/i.test(tag))
    .map((tag) => tag.match(/\bhref=["']([^"']+)["']/i)?.[1] || "")
    .filter(Boolean)
    .map(normalizeAssetRef);
  const refs = [...new Set([...scripts, ...styles])].sort();
  return { scripts, styles, refs };
}

function fingerprintMatch(actual, expected) {
  const actualSet = new Set(actual.refs);
  const missing = expected.refs.filter((ref) => !actualSet.has(ref));
  return { matches: missing.length === 0, missing };
}

async function inspect(url, expectedBody = "") {
  const probe = new URL(url);
  probe.searchParams.set("putduk_verify", sha || String(Date.now()));
  const response = await fetch(probe, {
    redirect: "follow",
    cache: "no-store",
    headers: { "cache-control": "no-cache" }
  });
  const contentType = response.headers.get("content-type") || "";
  const body = await response.text();
  const fingerprint = htmlFingerprint(body);
  const expectedFingerprint = htmlFingerprint(expectedBody);
  const match = fingerprintMatch(fingerprint, expectedFingerprint);
  return {
    status: response.status,
    html: contentType.includes("text/html") && body.includes("퍼뜩"),
    contentType,
    fingerprint,
    matchesExpected: match.matches,
    missingRefs: match.missing
  };
}

function sameFingerprint(left, right) {
  return JSON.stringify(left.refs) === JSON.stringify(right.refs);
}

function leakScan() {
  const files = [
    "dist/index.html",
    "dist/admin/index.html",
    "dist/assets/app-ia13.js",
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

const memberExpected = readFileSync(join(root, "dist/index.html"), "utf8");
const opsExpected = readFileSync(join(root, "dist/admin/index.html"), "utf8");
const pagesResult = await inspect(`${pages}/`, memberExpected);
const memberResult = await inspect(`${member}/`, memberExpected);
const opsResult = await inspect(`${ops}/admin/`, opsExpected);
const memberMatchesPages = sameFingerprint(memberResult.fingerprint, pagesResult.fingerprint);

console.log(`Pages project: domain=${pages} HTTP=${pagesResult.status} html=${pagesResult.html} fingerprint=${pagesResult.matchesExpected ? "PASS" : "FAIL"}`);
console.log(`Member site: domain=${member} HTTP=${memberResult.status} html=${memberResult.html} fingerprint=${memberResult.matchesExpected ? "PASS" : "FAIL"}`);
console.log(`Member vs Pages fingerprint: ${memberMatchesPages ? "PASS" : "FAIL"}`);
console.log(`Ops site: domain=${ops} HTTP=${opsResult.status} html=${opsResult.html} fingerprint=${opsResult.matchesExpected ? "PASS" : "FAIL"}`);
if (!pagesResult.matchesExpected) console.error(`Pages missing refs: ${pagesResult.missingRefs.join(", ")}`);
if (!memberResult.matchesExpected) console.error(`Member missing refs: ${memberResult.missingRefs.join(", ")}`);
if (!memberMatchesPages) console.error("Split routing detected: member custom domain HTML differs from canonical Pages project HTML.");
if (!opsResult.matchesExpected) console.error(`Ops missing refs: ${opsResult.missingRefs.join(", ")}`);
if (sha) console.log(`commit_sha: ${sha}`);

const leak = leakScan();
console.log(`Secret leak scan: ${leak ? "PASS" : "FAIL"}`);

const ok = pagesResult.status === 200
  && pagesResult.html
  && pagesResult.matchesExpected
  && memberResult.status === 200
  && memberResult.html
  && memberResult.matchesExpected
  && memberMatchesPages
  && opsResult.status === 200
  && opsResult.html
  && opsResult.matchesExpected
  && leak;
if (!ok) process.exit(1);
console.log("Cloudflare verify: PASS");
