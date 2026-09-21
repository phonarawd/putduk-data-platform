#!/usr/bin/env node
import { readFileSync } from "node:fs";
import { join } from "node:path";

const root = process.cwd();
const requireTarget = process.argv.includes("--require-target");

const files = {
  memberHtml: "dist/index.html",
  adminHtml: "dist/admin/index.html",
  originSplit: "dist/assets/origin-split.js",
  robots: "dist/robots.txt",
  sitemap: "dist/sitemap.xml",
  middleware: "functions/_middleware.js"
};

function read(relativePath) {
  return readFileSync(join(root, relativePath), "utf8");
}

function parseOrigin(primary, secondary) {
  const raw = String(process.env[primary] || process.env[secondary] || "").trim();
  if (!raw) return "";
  const normalized = /^https?:\/\//i.test(raw) ? raw : `https://${raw}`;
  const url = new URL(normalized);
  if ((url.pathname && url.pathname !== "/") || url.search || url.hash) {
    throw new Error(`${primary}/${secondary} must be an origin without path, query, or hash`);
  }
  return `${url.protocol}//${url.host}`;
}

function visibleOrigins(text) {
  const matches = String(text).match(/https:\/\/[a-z0-9.-]+/gi) || [];
  return [...new Set(matches)].sort();
}

function expect(checks, label, condition) {
  checks.push({ label, ok: Boolean(condition) });
}

const sources = Object.fromEntries(Object.entries(files).map(([key, path]) => [key, read(path)]));

console.log("Domain inventory (release-critical files only)");
for (const [key, path] of Object.entries(files)) {
  const origins = visibleOrigins(sources[key]);
  console.log(`${path}: ${origins.length ? origins.join(", ") : "(no absolute origin literal)"}`);
}

let memberOrigin = "";
let opsOrigin = "";
try {
  memberOrigin = parseOrigin("MEMBER_URL", "MEMBER_DOMAIN");
  opsOrigin = parseOrigin("OPS_URL", "OPS_DOMAIN");
} catch (error) {
  console.error(`Domain cutover: FAIL (${error.message})`);
  process.exit(1);
}

if (!memberOrigin || !opsOrigin) {
  console.log("Domain cutover: PENDING (explicit MEMBER_URL/MEMBER_DOMAIN and OPS_URL/OPS_DOMAIN are required)");
  if (requireTarget) process.exit(2);
  process.exit(0);
}

if (!memberOrigin.startsWith("https://") || !opsOrigin.startsWith("https://")) {
  console.error("Domain cutover: FAIL (production member/ops origins must use https)");
  process.exit(1);
}
if (memberOrigin === opsOrigin) {
  console.error("Domain cutover: FAIL (member and ops origins must be different)");
  process.exit(1);
}

const memberHost = new URL(memberOrigin).hostname;
const opsHost = new URL(opsOrigin).hostname;
const checks = [];

expect(checks, "member canonical", sources.memberHtml.includes(`<link rel="canonical" href="${memberOrigin}/"`));
expect(checks, "member og:url", sources.memberHtml.includes(`<meta property="og:url" content="${memberOrigin}/"`));
expect(checks, "member JSON-LD", sources.memberHtml.includes(`${memberOrigin}/#organization`) && sources.memberHtml.includes(`${memberOrigin}/#website`));
expect(checks, "member runtime memberOrigin", sources.memberHtml.includes(`memberOrigin: '${memberOrigin}'`));
expect(checks, "member runtime opsOrigin", sources.memberHtml.includes(`opsOrigin: '${opsOrigin}'`));
expect(checks, "admin runtime memberOrigin", sources.adminHtml.includes(`memberOrigin: '${memberOrigin}'`));
expect(checks, "admin runtime opsOrigin", sources.adminHtml.includes(`opsOrigin: '${opsOrigin}'`));
expect(checks, "robots sitemap", sources.robots.includes(`Sitemap: ${memberOrigin}/sitemap.xml`));

const sitemapLocs = [...sources.sitemap.matchAll(/<loc>([^<]+)<\/loc>/g)].map((match) => match[1]);
expect(checks, "sitemap has URLs", sitemapLocs.length > 0);
expect(checks, "sitemap member origin", sitemapLocs.length > 0 && sitemapLocs.every((url) => url === `${memberOrigin}/` || url.startsWith(`${memberOrigin}/`)));

expect(checks, "origin split member host", sources.originSplit.includes(memberHost));
expect(checks, "origin split ops host", sources.originSplit.includes(opsHost));
expect(checks, "middleware member host", sources.middleware.includes(memberHost));
expect(checks, "middleware ops host", sources.middleware.includes(opsHost));

let failed = false;
for (const check of checks) {
  console.log(`${check.ok ? "PASS" : "FAIL"}: ${check.label}`);
  if (!check.ok) failed = true;
}

if (failed) {
  console.error(`Domain cutover: FAIL (member=${memberOrigin}, ops=${opsOrigin})`);
  process.exit(1);
}

console.log(`Domain cutover: PASS (member=${memberOrigin}, ops=${opsOrigin})`);
