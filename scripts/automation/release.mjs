import { execFile } from 'node:child_process';
import { promisify } from 'node:util';

const execFileAsync = promisify(execFile);
const root = process.cwd();

async function run(name, command, args, options = {}) {
  console.log(`\n▶ ${name}`);
  try {
    const { stdout, stderr } = await execFileAsync(command, args, {
      cwd: root,
      env: process.env,
      maxBuffer: 4 * 1024 * 1024,
      ...options
    });
    if (stdout?.trim()) console.log(stdout.trim());
    if (stderr?.trim()) console.log(stderr.trim());
  } catch (error) {
    if (error.stdout) console.log(String(error.stdout));
    if (error.stderr) console.error(String(error.stderr));
    throw new Error(`${name} 실패`);
  }
}

const node = process.execPath;

await run('정적 검증', node, ['tooling/scripts/verify-static.mjs']);
await run('타입·문법', node, ['tooling/scripts/typecheck.mjs']);
await run('단위 테스트', node, ['tooling/scripts/run-node-tests.mjs', 'tests/unit/**/*.test.mjs']);
await run('백엔드 가드 테스트', node, ['tooling/scripts/putduk-backend-guards.test.mjs']);
await run('E2E 정적 셸', node, ['tooling/scripts/run-node-tests.mjs', 'tests/e2e/**/*.test.mjs']);
await run('접근성 정적 검사', node, ['tooling/scripts/run-node-tests.mjs', 'tests/a11y/**/*.test.mjs']);
await run('보안 검사', node, ['tooling/scripts/security-scan.mjs']);
await run('성능 설정 검사', node, ['tooling/scripts/run-performance.mjs']);
await run('헬스체크', node, ['scripts/automation/health-check.mjs']);
await run('도메인 cutover gate', node, ['tooling/cloudflare/domain-cutover-audit.mjs', '--require-target']);

console.log('\n릴리스 사전 검증을 통과했습니다.');
console.log('Supabase 운영 변경은 MCP/CLI Path A로 먼저 적용·검증합니다.');
console.log('Cloudflare 운영 배포는 GitHub main push를 Pages Git Integration이 직접 감지합니다.');
console.log('이 스크립트는 Cloudflare API Token을 사용해 직접 배포하지 않습니다.');
