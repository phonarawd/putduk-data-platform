// 로컬 env 파일을 읽되, 값은 로그에 남기지 않는다.

import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";

export const EXPECTED_PROJECT_REF = "gaugwamwceqdnqdqrxqg";
export const EXPECTED_REPO = "phonarawd/putduk-data-platform";
export const EDGE_FUNCTIONS = [
  "admin-control",
  "admin-phase5",
  "admin-master",
  "admin-work-asset",
  "member-finance",
  "member-push",
  "member-task-detail",
  "member-experience",
  "push-dispatch"
];

const ENV_FILES = [".env", ".env.local", ".env.production.local", ".env.cursor.local"];

export function isPresent(value) {
  const text = String(value || "").trim();
  return Boolean(text) && !text.includes("replace-with");
}

export function parseEnvFile(filePath) {
  if (!existsSync(filePath)) return null;
  const parsed = {};
  const text = readFileSync(filePath, "utf8");
  for (const line of text.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const index = trimmed.indexOf("=");
    if (index < 0) continue;
    const key = trimmed.slice(0, index).trim();
    let value = trimmed.slice(index + 1);
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    parsed[key] = value;
  }
  return parsed;
}

export function loadEnvFiles(root = process.cwd()) {
  const foundFiles = [];
  const merged = {};
  for (const file of ENV_FILES) {
    const fullPath = join(root, file);
    const parsed = parseEnvFile(fullPath);
    if (!parsed) continue;
    foundFiles.push(file);
    Object.assign(merged, parsed);
  }
  for (const [key, value] of Object.entries(merged)) {
    if (!isPresent(process.env[key]) && isPresent(value)) {
      process.env[key] = value;
    }
  }
  return { foundFiles, keys: Object.keys(merged) };
}

export function keyStatus(name) {
  return isPresent(process.env[name]) ? "FOUND" : "MISSING";
}

export function requiredEnv(names) {
  return names.filter((name) => !isPresent(process.env[name]));
}
