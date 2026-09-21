import test from 'node:test';
import assert from 'node:assert/strict';
import { readRepo } from '../helpers/repo.mjs';

test('member index의 리터럴 줄바꿈 표기와 Phase 3 wiring을 정리한다', async () => {
  const html = await readRepo('dist', 'index.html');

  assert.equal(html.includes('\\n'), false);
  assert.match(html, /phase3-wallet-ux\.css\?v=20260921-phase3/);
  assert.match(html, /phase3-wallet-ux\.js\?v=20260921-phase3/);
  assert.ok(html.indexOf('phase3-wallet-ux.js?v=20260921-phase3') > html.indexOf('finance-flow-ux.js?v=20260920-p1finance1'));
});

test('지갑 빈 상태는 현재 원장 탭에 맞는 문구를 사용한다', async () => {
  const runtime = await readRepo('dist', 'assets', 'phase3-wallet-ux.js');

  assert.match(runtime, /아직 지갑 내역이 없어요/);
  assert.match(runtime, /아직 입금 내역이 없어요/);
  assert.match(runtime, /아직 출금 내역이 없어요/);
  assert.match(runtime, /selectedLedgerTab/);
  assert.match(runtime, /aria-selected/);
  assert.match(runtime, /data-ledger-tab/);
});

test('출금 안내는 이모지 대신 짧은 구조화 문구와 실제 출금 정책을 사용한다', async () => {
  const runtime = await readRepo('dist', 'assets', 'phase3-wallet-ux.js');
  const css = await readRepo('dist', 'assets', 'phase3-wallet-ux.css');

  assert.match(runtime, /출금 전에 확인하세요/);
  assert.match(runtime, /운영자가 확인 후 지급 처리/);
  assert.match(runtime, /원금 출금 자체로 회원 등급·혜택·라인은 바뀌지 않아요/);
  assert.match(runtime, /남은 업무잔액이 필요한 보증금보다 적으면 해당 업무는 새로 시작할 수 없어요/);
  assert.doesNotMatch(runtime, /[💬💸🏦⚠✅🔒]/u);
  assert.match(css, /phase3-withdraw-guide-row/);
  assert.match(css, /@media \(max-width:640px\)/);
});

test('Phase 3 wallet UX는 금융 요청과 서버 상태를 직접 수정하지 않는다', async () => {
  const runtime = await readRepo('dist', 'assets', 'phase3-wallet-ux.js');

  for (const token of ['member-finance', 'supabase', 'localStorage', 'sessionStorage', 'fetch(']) {
    assert.equal(runtime.includes(token), false, `${token} must stay outside Phase 3 wallet presentation runtime`);
  }
});
