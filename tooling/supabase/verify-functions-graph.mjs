#!/usr/bin/env node
import { readFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";

const root = process.cwd();
const functionsRoot = join(root, "supabase/functions");
const entrypoints = [
  "admin-control/index.ts",
  "member-finance/index.ts"
];
const IMPORT_RE = /from\s+['"](\.\.?\/[^'"]+)['"]/g;

function resolveImport(fromFile, spec) {
  const base = resolve(dirname(fromFile), spec);
  if (base.endsWith(".ts") || base.endsWith(".js")) return base;
  return `${base}.ts`;
}

function walk(entry) {
  const files = new Set();
  const queue = [resolve(functionsRoot, entry)];
  while (queue.length) {
    const file = queue.pop();
    if (files.has(file)) continue;
    files.add(file);
    let source;
    try {
      source = readFileSync(file, "utf8");
    } catch {
      throw new Error(`누락된 의존 파일: ${file.replace(`${root}\\`, "").replace(`${root}/`, "")}`);
    }
    for (const match of source.matchAll(IMPORT_RE)) {
      const next = resolveImport(file, match[1]);
      if (next.startsWith(resolve(functionsRoot))) queue.push(next);
    }
  }
  return [...files];
}

let failed = false;
for (const entry of entrypoints) {
  try {
    const files = walk(entry);
    console.log(`${entry}: ${files.length} files`);
    for (const file of files) {
      const relative = file.slice(resolve(functionsRoot).length + 1).replaceAll("\\", "/");
      if (relative.includes("..")) {
        failed = true;
        console.error(`경로 이탈: ${relative}`);
      }
    }
  } catch (error) {
    failed = true;
    console.error(String(error.message || error));
  }
}

if (failed) process.exit(1);
console.log("Edge import graph: PASS");
