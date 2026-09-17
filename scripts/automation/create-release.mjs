import { execFile } from 'node:child_process';
import { promisify } from 'node:util';

const execFileAsync = promisify(execFile);

const { stdout: log } = await execFileAsync('git', ['log', '-12', '--pretty=format:%h %s'], { cwd: process.cwd() });
const { stdout: sha } = await execFileAsync('git', ['rev-parse', 'HEAD'], { cwd: process.cwd() });

const notes = [
  '# 퍼뜩 릴리스 초안',
  '',
  `기준 커밋: ${sha.trim()}`,
  '',
  '## 최근 커밋',
  '',
  ...log.trim().split('\n').map((line) => `- ${line}`),
  '',
  '## 배포 전 확인',
  '',
  '- pnpm verify / test / test:e2e / test:a11y / security:scan 통과',
  '- enableWorkApi·enableFinanceApi 잠금 유지',
  '- GitHub Actions 성공',
  '- 비밀 키를 로그에 출력하지 않음',
  '',
  '이 스크립트는 GitHub Release를 만들지 않습니다. 게시하려면 운영자가 확인한 뒤 gh release create를 사용하세요.'
].join('\n');

console.log(notes);
