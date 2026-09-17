import { glob } from 'node:fs/promises';
import { finished } from 'node:stream/promises';
import { run } from 'node:test';
import { spec } from 'node:test/reporters';
import { resolve } from 'node:path';

const pattern = process.argv[2] || 'tests/**/*.test.mjs';
const files = (await Array.fromAsync(glob(pattern, { cwd: process.cwd() })))
  .map((file) => resolve(process.cwd(), file))
  .sort();

if (!files.length) {
  console.error(`테스트 파일이 없습니다: ${pattern}`);
  process.exit(1);
}

let failed = 0;
const stream = run({ files, concurrency: true });
stream.on('test:fail', () => {
  failed += 1;
});
stream.compose(spec()).pipe(process.stdout);
await finished(stream);
process.exit(failed ? 1 : 0);
