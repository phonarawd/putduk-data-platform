import { execFile } from 'node:child_process';
import { readdir, readFile } from 'node:fs/promises';
import { extname, join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { promisify } from 'node:util';

const execFileAsync = promisify(execFile);

// 차단 대상. phonarawd/putduk-data-platform 은 포함하지 않는다.
export const BLOCKED_REPOS = [
  { owner: 'phonarawd', name: 'AI-Profit-OS' },
  { owner: 'phonarawd', name: 'putduk-ops' },
  { owner: 'phonarawd', name: 'putduk-web' }
];

export const BLOCKED_DIR_NAMES = new Set(BLOCKED_REPOS.map((repo) => repo.name.toLowerCase()));

const SKIP_WALK_DIRS = new Set([
  'node_modules',
  '.git',
  '.worktrees',
  '.turbo',
  'playwright-report',
  'test-results',
  '.lighthouseci',
  '.pnpm-store',
  'coverage',
  'blob-report'
]);

const BINARY_EXT = new Set(['.png', '.jpg', '.jpeg', '.webp', '.gif', '.woff', '.woff2', '.ico']);

const ALLOWED_SCAN_PATHS = [
  'tooling/scripts/block-foreign-repos.mjs',
  'tests/unit/block-foreign-repos.test.mjs',
  'tooling/git/blocked-remotes.gitconfig'
];

const ALLOWED_SCAN_PREFIXES = ['.cursor/rules/', 'tooling/githooks/'];

function escapeRegExp(value) {
  return String(value).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

export function isBlockedDirName(name) {
  return BLOCKED_DIR_NAMES.has(String(name || '').toLowerCase());
}

export function shouldSkipWalkDir(name) {
  return SKIP_WALK_DIRS.has(name) || isBlockedDirName(name);
}

export function toPosix(value) {
  return String(value || '').replaceAll('\\', '/');
}

export function isAllowedScanPath(relativePosix) {
  const path = toPosix(relativePosix);
  if (ALLOWED_SCAN_PATHS.includes(path) || path === '.cursorignore') return true;
  return ALLOWED_SCAN_PREFIXES.some((prefix) => path.startsWith(prefix));
}

export function pathHasBlockedSegment(relativePosix) {
  return toPosix(relativePosix).split('/').some((part) => isBlockedDirName(part));
}

function repoBoundaryPattern(owner, name) {
  const nwo = `${escapeRegExp(owner)}/${escapeRegExp(name)}(?:\\.git)?`;
  const after = '(?=$|[^A-Za-z0-9._-])';
  return { nwo, after };
}

export function findBlockedReferences(text) {
  const source = String(text || '');
  const hits = [];
  for (const repo of BLOCKED_REPOS) {
    const { nwo, after } = repoBoundaryPattern(repo.owner, repo.name);
    const host = String.raw`(?:https?://(?:www\.)?github\.com/|git@github\.com:|ssh://(?:git@)?github\.com/|git://github\.com/|git\+https://github\.com/|git\+ssh://git@github\.com/)`;
    const api = String.raw`(?:https?://api\.github\.com/repos/|https?://raw\.githubusercontent\.com/|https?://codeload\.github\.com/)`;
    const patterns = [
      new RegExp(`${host}${nwo}${after}`, 'gi'),
      new RegExp(`${api}${nwo}${after}`, 'gi'),
      new RegExp(`(?:^|[^A-Za-z0-9._-])${nwo}${after}`, 'gi')
    ];
    for (const pattern of patterns) {
      pattern.lastIndex = 0;
      let match = pattern.exec(source);
      while (match) {
        hits.push({ repo: `${repo.owner}/${repo.name}`, match: match[0].trim() });
        if (match.index === pattern.lastIndex) pattern.lastIndex += 1;
        match = pattern.exec(source);
      }
    }
  }
  return hits;
}

async function resolveRoot(explicitRoot) {
  if (explicitRoot) return explicitRoot;
  try {
    const { stdout } = await execFileAsync('git', ['rev-parse', '--show-toplevel']);
    return stdout.trim();
  } catch {
    return process.cwd();
  }
}

async function walkFiles(root) {
  const files = [];
  const blockedDirs = [];

  async function walk(dir) {
    let entries = [];
    try {
      entries = await readdir(dir, { withFileTypes: true });
    } catch {
      return;
    }
    for (const entry of entries) {
      const fullPath = join(dir, entry.name);
      if (entry.isDirectory()) {
        if (isBlockedDirName(entry.name)) {
          blockedDirs.push(toPosix(relative(root, fullPath)));
          continue;
        }
        if (SKIP_WALK_DIRS.has(entry.name)) continue;
        await walk(fullPath);
        continue;
      }
      if (BINARY_EXT.has(extname(entry.name).toLowerCase())) continue;
      files.push(fullPath);
    }
  }

  await walk(root);
  return { files, blockedDirs };
}

async function gitLines(root, args) {
  try {
    const { stdout } = await execFileAsync('git', args, { cwd: root, maxBuffer: 16 * 1024 * 1024 });
    return stdout.split(/\r?\n/).map((line) => line.trim()).filter(Boolean);
  } catch {
    return [];
  }
}

async function isTrackedPath(root, relativePosix) {
  try {
    await execFileAsync('git', ['ls-files', '--error-unmatch', '--', relativePosix], { cwd: root });
    return true;
  } catch {
    return false;
  }
}

function pushHits(failures, location, hits) {
  for (const hit of hits) {
    failures.push(`${location}: 차단된 저장소 참조 ${hit.repo} (${hit.match})`);
  }
}

async function stagedNames(root) {
  try {
    const { stdout } = await execFileAsync('git', ['diff', '--cached', '--name-only', '-z'], {
      cwd: root,
      maxBuffer: 8 * 1024 * 1024
    });
    return stdout.split('\0').map(toPosix).filter(Boolean);
  } catch {
    return [];
  }
}

async function collectDirFindings(root, blockedDirs) {
  const failures = [];
  const warnings = [];
  for (const dirPath of blockedDirs) {
    const message = `차단된 레포 사본 경로(내용은 읽지 않음): ${dirPath}`;
    if (await isTrackedPath(root, dirPath)) {
      failures.push(`${message}. 추적 중이므로 커밋에서 제거해야 합니다.`);
    } else {
      warnings.push(message);
    }
  }
  return { failures, warnings };
}

export async function scanBlockedForeignRepos({ root: explicitRoot, staged = false } = {}) {
  const root = await resolveRoot(explicitRoot);
  const failures = [];
  const remotes = await gitLines(root, ['remote', '-v']);
  pushHits(failures, 'git remote', findBlockedReferences(remotes.join('\n')));

  const { files, blockedDirs } = await walkFiles(root);
  const dirFindings = await collectDirFindings(root, blockedDirs);
  failures.push(...dirFindings.failures);
  const warnings = dirFindings.warnings;

  if (staged) {
    const names = await stagedNames(root);
    for (const name of names) {
      if (pathHasBlockedSegment(name)) {
        failures.push(`스테이징된 차단 경로(내용은 읽지 않음): ${name}`);
        continue;
      }
      if (isAllowedScanPath(name)) continue;
      try {
        const { stdout } = await execFileAsync('git', ['diff', '--cached', '--no-color', '-U0', '--', name], {
          cwd: root,
          maxBuffer: 8 * 1024 * 1024
        });
        pushHits(failures, name, findBlockedReferences(stdout));
      } catch {
        // 차단 디렉터리 내용은 읽지 않는다.
      }
    }
    return { root, failures, warnings, blockedDirs };
  }

  for (const file of files) {
    const relativePosix = toPosix(relative(root, file));
    if (isAllowedScanPath(relativePosix) || pathHasBlockedSegment(relativePosix)) continue;
    let text = '';
    try {
      text = await readFile(file, 'utf8');
    } catch {
      continue;
    }
    pushHits(failures, relativePosix, findBlockedReferences(text));
  }

  return { root, failures, warnings, blockedDirs };
}

export async function applyLocalGitGuards(explicitRoot) {
  const root = await resolveRoot(explicitRoot);
  // 전역(--global)은 쓰지 않는다. 이 레포 .git/config 만 수정한다.
  await execFileAsync('git', ['config', '--local', 'include.path', '../tooling/git/blocked-remotes.gitconfig'], { cwd: root });
  await execFileAsync('git', ['config', '--local', 'core.hooksPath', 'tooling/githooks'], { cwd: root });
}

function isCli() {
  const self = fileURLToPath(import.meta.url);
  return Boolean(process.argv[1] && resolve(process.argv[1]) === self);
}

if (isCli()) {
  const staged = process.argv.includes('--staged');
  if (process.argv.includes('--apply-local-git')) {
    await applyLocalGitGuards();
    console.log('로컬 git include·hooksPath 적용 완료');
  }
  const { failures, warnings } = await scanBlockedForeignRepos({ staged });
  for (const warning of warnings) console.warn(warning);
  if (failures.length) {
    console.error('차단된 외부 저장소 가드 실패');
    for (const item of failures) console.error(`- ${item}`);
    process.exit(1);
  }
  console.log(staged ? '스테이징 가드 통과' : '차단 레포 가드 통과');
}
