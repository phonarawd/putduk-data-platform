#!/usr/bin/env node
import { loadEnvFiles, keyStatus } from "./lib/load-env.mjs";

loadEnvFiles();

const keys = [
  "SUPABASE_ACCESS_TOKEN",
  "SUPABASE_PROJECT_REF",
  "PUTDUK_PAYOUT_SECRET",
  "SUPABASE_DB_PASSWORD",
  "SUPABASE_URL",
  "SUPABASE_SERVICE_ROLE_KEY",
  "CLOUDFLARE_API_TOKEN",
  "CLOUDFLARE_ACCOUNT_ID",
  "CLOUDFLARE_ZONE_ID",
  "CLOUDFLARE_PAGES_PROJECT"
];

console.log("=== KEY STATUS ===");
for (const key of keys) {
  console.log(`${key}: ${keyStatus(key)}`);
}
