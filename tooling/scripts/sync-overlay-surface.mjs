import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const srcJs = join(root, 'src', 'ui', 'overlay-surface.mjs');
const srcCss = join(root, 'src', 'ui', 'overlay-surface.css');
const distDir = join(root, 'dist', 'assets');

const source = await readFile(srcJs, 'utf8');
const css = await readFile(srcCss, 'utf8');
const names = [];
for (const match of source.matchAll(/^export (?:async )?function (\w+)/gm)) names.push(match[1]);
for (const match of source.matchAll(/^export const (\w+)/gm)) names.push(match[1]);
const body = source.replace(/^export /gm, '');
const iife = [
  '(() => {',
  "  'use strict';",
  body.trimEnd(),
  `  window.PutdukOverlaySurface = { ${names.join(', ')} };`,
  '})();',
  ''
].join('\n');


await mkdir(distDir, { recursive: true });
await writeFile(join(distDir, 'overlay-surface.js'), iife, 'utf8');
await writeFile(join(distDir, 'overlay-surface.css'), css.endsWith('\n') ? css : `${css}\n`, 'utf8');
console.log('오버레이 표면 소스를 dist/assets에 동기화했습니다.');
