#!/usr/bin/env node
/**
 * putduk-premium.png(앱 로고)에서 PWA 홈 화면 아이콘 PNG를 다시 만듭니다.
 */
import { execFileSync } from "node:child_process";
import { existsSync } from "node:fs";
import { join } from "node:path";

const root = process.cwd();
const source = join(root, "dist/icons/putduk-premium.png");
const background = "#0b0b0c";

if (!existsSync(source)) {
  console.error("sync-pwa-icons: dist/icons/putduk-premium.png 없음");
  process.exit(1);
}

for (const size of [180, 192, 512]) {
  const output = join(root, `dist/icons/icon-${size}.png`);
  execFileSync(
    "pnpm",
    [
      "dlx",
      "sharp-cli",
      "-i",
      source,
      "-o",
      output,
      "resize",
      String(size),
      String(size),
      "--fit",
      "contain",
      "--background",
      background
    ],
    { stdio: "inherit", shell: true }
  );
  console.log(`sync-pwa-icons: icon-${size}.png`);
}

console.log("sync-pwa-icons: 통과");
