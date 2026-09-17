import { readFile, access } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const helpersDir = dirname(fileURLToPath(import.meta.url));
export const repoRoot = join(helpersDir, '..', '..');

export function repoPath(...parts) {
  return join(repoRoot, ...parts);
}

export async function readRepo(...parts) {
  return readFile(repoPath(...parts), 'utf8');
}

export async function existsRepo(...parts) {
  try {
    await access(repoPath(...parts));
    return true;
  } catch {
    return false;
  }
}

export async function readLaunchFiles() {
  const [memberHtml, adminHtml, appJs, appCss, manifest] = await Promise.all([
    readRepo('dist', 'index.html'),
    readRepo('dist', 'admin', 'index.html'),
    readRepo('dist', 'assets', 'app.js'),
    readRepo('dist', 'assets', 'app.css'),
    readRepo('dist', 'manifest.webmanifest')
  ]);
  return { memberHtml, adminHtml, appJs, appCss, manifest };
}
