import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { loadEnvFiles } from '../../tooling/supabase/lib/load-env.mjs';

const execFileAsync = promisify(execFile);
const root = process.cwd();
const deployRequested = process.argv.includes('--deploy');

loadEnvFiles(root);

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

console.log('\n로컬 검증을 모두 통과했습니다. 이 스크립트는 커밋·푸시를 하지 않습니다.');

if (!deployRequested) {
  console.log('배포를 원하면 비밀이 준비된 환경에서 pnpm release:deploy -- --deploy 를 사용하세요.');
  process.exit(0);
}

const required = [
  'CLOUDFLARE_API_TOKEN',
  'CLOUDFLARE_ACCOUNT_ID'
];
const missing = required.filter((name) => !process.env[name]);
if (missing.length) {
  console.error(`배포 비밀이 없습니다: ${missing.join(', ')}`);
  process.exit(1);
}

const project = process.env.CLOUDFLARE_PAGES_PROJECT
  || process.env.CLOUDFLARE_MEMBER_PROJECT
  || 'putduk-data-platform';
process.env.CLOUDFLARE_PAGES_PROJECT = project;

await run('Cloudflare Pages 배포', 'pnpm', ['exec', 'wrangler', 'pages', 'deploy', 'dist', '--project-name', project, '--branch', 'main'], {
  shell: true
});
await run('Cloudflare 운영 URL 검증', node, ['tooling/cloudflare/verify-deployment.mjs']);
