#!/usr/bin/env node
import { EXPECTED_PROJECT_REF, isPresent, loadEnvFiles } from "./lib/load-env.mjs";

loadEnvFiles();

const projectRef = String(process.env.SUPABASE_PROJECT_REF || EXPECTED_PROJECT_REF).trim();
const token = String(process.env.SUPABASE_ACCESS_TOKEN || "").trim();
const memberRaw = String(process.env.MEMBER_URL || process.env.MEMBER_DOMAIN || "").trim();
const opsRaw = String(process.env.OPS_URL || process.env.OPS_DOMAIN || "").trim();
const expectedRedirectRaw = String(process.env.PUTDUK_AUTH_REDIRECT_URLS || "").trim();

function originOnly(raw, label) {
  const candidate = /^https?:\/\//i.test(raw) ? raw : `https://${raw}`;
  let url;
  try { url = new URL(candidate); } catch { throw new Error(`${label} must be a valid URL/domain.`); }
  if (url.protocol !== "https:") throw new Error(`${label} must use HTTPS.`);
  if (url.username || url.password || url.search || url.hash) throw new Error(`${label} must be origin-only.`);
  if (url.pathname !== "/") throw new Error(`${label} must not contain a path.`);
  return url.origin;
}

function redirectEntry(raw, allowedOrigins) {
  const value = String(raw || "").trim();
  if (!value || value === "*" || /^https:\/\/\*/i.test(value)) throw new Error("Auth redirect entries must not use a global/host wildcard.");
  let url;
  try { url = new URL(value); } catch { throw new Error(`Invalid Auth redirect URL: ${value}`); }
  if (url.protocol !== "https:" || url.username || url.password || url.search || url.hash) {
    throw new Error(`Auth redirect must be an HTTPS URL/pattern without query/hash: ${value}`);
  }
  if (!allowedOrigins.has(url.origin)) throw new Error(`Auth redirect uses an unapproved origin: ${url.origin}`);
  return value.replace(/\/$/, url.pathname === "/" ? "" : "/");
}

if (projectRef !== EXPECTED_PROJECT_REF) {
  console.error("Auth config verify: FAIL (unexpected Supabase project ref)");
  process.exit(1);
}
if (!isPresent(token)) {
  console.error("Auth config verify: FAIL (SUPABASE_ACCESS_TOKEN missing)");
  process.exit(1);
}
if (!memberRaw || !opsRaw || !expectedRedirectRaw) {
  console.error("Auth config verify: FAIL (MEMBER_URL/MEMBER_DOMAIN, OPS_URL/OPS_DOMAIN, PUTDUK_AUTH_REDIRECT_URLS are required)");
  process.exit(1);
}

let memberOrigin;
let opsOrigin;
let expectedRedirects;
try {
  memberOrigin = originOnly(memberRaw, "member origin");
  opsOrigin = originOnly(opsRaw, "ops origin");
  if (memberOrigin === opsOrigin) throw new Error("member and ops origins must differ.");
  const allowedOrigins = new Set([memberOrigin, opsOrigin]);
  expectedRedirects = expectedRedirectRaw.split(",").map((value) => redirectEntry(value, allowedOrigins));
  if (!expectedRedirects.length) throw new Error("At least one Auth redirect URL is required.");
  for (const origin of allowedOrigins) {
    if (!expectedRedirects.some((entry) => entry === origin || entry.startsWith(`${origin}/`))) {
      throw new Error(`Auth redirect list must cover ${origin}.`);
    }
  }
} catch (error) {
  console.error(`Auth config verify: FAIL (${error.message})`);
  process.exit(1);
}

const response = await fetch(`https://api.supabase.com/v1/projects/${projectRef}/config/auth`, {
  method: "GET",
  headers: { Authorization: `Bearer ${token}`, Accept: "application/json" }
});
if (!response.ok) {
  console.error(`Auth config verify: FAIL (Management API HTTP ${response.status})`);
  process.exit(1);
}

const config = await response.json();
const actualSiteRaw = String(config?.site_url ?? "").trim();
const actualRedirectRaw = String(config?.uri_allow_list ?? "").trim();
let actualSite;
try {
  actualSite = originOnly(actualSiteRaw, "Auth site_url");
} catch {
  console.error("Auth site_url: FAIL");
  process.exit(1);
}

const actualRedirects = actualRedirectRaw
  ? actualRedirectRaw.split(",").map((value) => value.trim()).filter(Boolean)
  : [];
const expectedSet = new Set(expectedRedirects);
const actualSet = new Set(actualRedirects);
const missing = expectedRedirects.filter((entry) => !actualSet.has(entry));
const unexpected = actualRedirects.filter((entry) => !expectedSet.has(entry));

let failed = false;
if (actualSite !== memberOrigin) failed = true;
if (missing.length || unexpected.length) failed = true;

console.log(`Auth site_url: ${actualSite === memberOrigin ? "PASS" : "FAIL"}`);
console.log(`Auth redirect allow-list count: expected=${expectedRedirects.length} actual=${actualRedirects.length}`);
console.log(`Auth redirect missing: ${missing.length}`);
console.log(`Auth redirect unexpected: ${unexpected.length}`);

if (failed) process.exit(1);
console.log("Auth config verify: PASS");
