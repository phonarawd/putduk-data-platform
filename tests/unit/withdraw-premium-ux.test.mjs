import test from 'node:test';
import assert from 'node:assert/strict';
import { readRepo } from '../helpers/repo.mjs';

test('출금 모달은 금액 hierarchy를 withdraw-hero 카드로 보여준다', async () => {
  const appJs = await readRepo('dist', 'assets', 'app-ia13.js');
  const appCss = await readRepo('dist', 'assets', 'app.css');

  assert.match(appJs, /withdraw-hero/);
  assert.match(appJs, /withdraw-chip/);
  assert.match(appJs, /withdraw-hero-figures/);
  assert.match(appJs, /출금가능 \(수당\)/);
  assert.match(appJs, /업무잔액 \(원금\)/);
  assert.match(appJs, /신청 가능 합계/);
  assert.match(appCss, /\.withdraw-hero \{/);
  assert.match(appCss, /\.withdraw-chip \{/);
  assert.match(appCss, /\.penalty-figures\.withdraw-preview \{/);
});

test('출금 모달은 수당/원금 구분 칩과 안심 문구를 kind별로 그린다', async () => {
  const appJs = await readRepo('dist', 'assets', 'app-ia13.js');

  assert.match(appJs, /원금 포함 출금/);
  assert.match(appJs, /수당만 출금/);
  assert.match(appJs, /chipTone = principal \? 'gold' : 'emerald'/);
  assert.match(appJs, /원금은 업무잔액에 그대로 남아요\. 수당만 신청해요\./);
  assert.match(appJs, /회원 등급은 출금 자체로 변경되지 않아요\./);
});

test('출금 신청 버튼과 원금 확인 문구는 쉬운 한글을 쓴다', async () => {
  const appJs = await readRepo('dist', 'assets', 'app-ia13.js');

  assert.match(appJs, /type="submit">출금 신청</);
  assert.doesNotMatch(appJs, /신청하고 처리 중으로/);
  assert.doesNotMatch(appJs, /이해하고 신청/);
  assert.match(appJs, /data-action="confirm-principal">출금 정보 입력</);
});

test('원금 확인 모달은 폐지된 강등 정책 문구를 소스에서 제거한다', async () => {
  const appJs = await readRepo('dist', 'assets', 'app-ia13.js');

  assert.doesNotMatch(appJs, /등급은 내려가요\. 예: 선임은 라인으로/);
  assert.doesNotMatch(appJs, /근무 잔액이 0원이 되면 그 라인은 바로 닫혀요/);
  assert.doesNotMatch(appJs, /우선 집기·주간 근무 자리·전담 라인은 빠지고/);
  assert.doesNotMatch(appJs, /등급과 라인이 내려가는 출금/);
  assert.doesNotMatch(appJs, /data-modal="withdraw-principal"[^`]*demoteMotionCanvas/);
});

test('원금 확인 모달은 실제 잔액 계약 문구로 대체한다', async () => {
  const appJs = await readRepo('dist', 'assets', 'app-ia13.js');

  assert.match(appJs, /운영자가 확인한 뒤 지급 처리하고, 출금 자체로 회원 등급을 낮추지 않아요\./);
  assert.match(appJs, /지금 업무잔액\(원금\)/);
  assert.match(appJs, /완료된 원금만큼 업무잔액이 줄어요\. 원금 출금 자체로 회원 등급이나 라인을 낮추지 않아요\./);
  assert.match(appJs, /출금 완료 후 남은 업무잔액이 필요한 보증금보다 적으면 해당 업무는 새로 시작할 수 없어요\./);
});

test('지갑·도움말·혜택 안내의 원금 출금 문구는 실제 정책을 따른다', async () => {
  const appJs = await readRepo('dist', 'assets', 'app-ia13.js');

  assert.doesNotMatch(appJs, /보증금까지 신청하면 대기 없이 바로 지급하고, 등급·라인은 내려가요/);
  assert.doesNotMatch(appJs, /보증금까지 신청하면 대기 일수 없이 바로 지급하고, 등급과 라인은 내려가요/);
  assert.doesNotMatch(appJs, /강등·혜택 안내/);
  assert.match(appJs, /완료된 원금만큼 업무잔액이 줄어요\. 회원 등급은 출금 자체로 변경되지 않아요\./);
  assert.match(appJs, /등급·혜택 보기/);
});

test('출금 Premium UX는 FOMO·봇 보호 설정을 수정하지 않는다', async () => {
  const appJs = await readRepo('dist', 'assets', 'app-ia13.js');
  const css = await readRepo('dist', 'assets', 'app.css');
  // app-ia13의 FOMO 보호 계약(어드민 motion 설정 기본값)은 그대로 존재해야 한다.
  for (const protectedName of ['bot_enabled', 'crowd_min', 'crowd_max', 'burn_per_minute']) {
    assert.ok(appJs.includes(protectedName), `app-ia13.js에 ${protectedName} FOMO 계약이 사라졌어요`);
  }
  assert.doesNotMatch(css, /bot_enabled|crowd_min|crowd_max|burn_per_minute|crew_pulse/);
});
