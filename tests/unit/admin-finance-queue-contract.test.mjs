import fs from 'node:fs';
import assert from 'node:assert/strict';

const source = fs.readFileSync(new URL('../../dist/admin/admin-finance-queue-guard.js', import.meta.url), 'utf8');
const migration = fs.readFileSync(new URL('../../supabase/migrations/20260920214500_putduk_admin_finance_queue_contract.sql', import.meta.url), 'utf8');
const index = fs.readFileSync(new URL('../../dist/admin/index.html', import.meta.url), 'utf8');

const tests = [
  ['입금 증빙은 비공개 60초 preview API를 통해 확인', () => {
    assert.match(source, /preview_private_file/);
    assert.match(source, /purpose: 'deposit_proof'/);
    assert.match(source, /비공개 저장소의 60초 임시 주소/);
  }],
  ['증빙 없는 입금은 UI와 DB 모두 승인 차단', () => {
    assert.match(source, /입금 증빙이 없는 요청은 승인할 수 없어요/);
    assert.match(migration, /trg_putduk_deposit_approval_proof/);
    assert.match(migration, /입금 증빙을 먼저 확인해 주세요/);
    assert.match(migration, /deposit-proof\/.*new\.user_id/);
  }],
  ['증빙을 실제로 연 요청만 승인 가능', () => {
    assert.match(source, /function proofChecked\(id\)/);
    assert.match(source, /approved && !proofChecked\(id\)/);
    assert.match(source, /입금 증빙을 먼저 열어 직접 확인한 뒤 승인해 주세요/);
    assert.match(source, /approving && \(!hasProof \|\| !proofChecked\(id\)\)/);
  }],
  ['데스크톱과 모바일 모두 증빙 버튼을 같은 action-row에 삽입', () => {
    assert.match(source, /function ensureProofButton\(actionRow, item\)/);
    assert.match(source, /querySelectorAll\(`\[data-finance-action=\"review_deposit\"/);
    assert.match(source, /ensureProofButton\(button\.closest\('\.action-row'\), item\)/);
  }],
  ['KRW와 USDT 금액 표시를 구분', () => {
    assert.match(source, /currency === 'USDT'/);
    assert.match(source, /maximumFractionDigits: 8/);
    assert.match(source, /toLocaleString\('ko-KR'/);
  }],
  ['원금 포함 출금은 반려 경로가 없음', () => {
    assert.match(source, /원금 포함 출금은 반려할 수 없어요/);
    assert.match(source, /if \(isPrincipal\(item\)\) button\.remove\(\)/);
  }],
  ['모바일 출금에도 지급정보 확인 버튼 제공', () => {
    assert.match(source, /function ensureMobileRevealButton\(item, card\)/);
    assert.match(source, /button\.closest\('\.admin-mobile-card'\)/);
    assert.match(source, /reveal\.dataset\.action = 'reveal-withdrawal-destination'/);
  }],
  ['지급정보 확인 뒤 실제 송금 완료만 확정', () => {
    assert.match(source, /지급정보를 먼저 확인하고 실제 송금을 완료한 뒤/);
    assert.match(source, /송금 완료 표시/);
    assert.match(source, /revealedId !== id/);
  }],
  ['금융·KYC 처리 버튼은 요청 중 중복 실행 방지', () => {
    assert.match(source, /const busy = new Set\(\)/);
    assert.match(source, /isBusy\('deposit'/);
    assert.match(source, /isBusy\('withdrawal'/);
    assert.match(source, /isBusy\('kyc'/);
  }],
  ['KYC 처리 후 버튼 문구를 정상 복원', () => {
    assert.match(source, /button\.textContent = working \? '처리 중…' : \(button\.dataset\.action === 'kyc-approve' \? '승인' : '반려'\)/);
  }],
  ['KYC 서버는 처리 전 상태를 row lock 후 검증', () => {
    assert.match(migration, /for update;/i);
    assert.match(migration, /not in \('submitted', 'review_pending'\)/);
    assert.match(migration, /count\(distinct document_kind\)/i);
  }],
  ['관리자 index에서 finance guard 로드', () => assert.match(index, /admin-finance-queue-guard\.js\?v=20260920-p2finance1/)],
  ['보호된 FOMO 설정을 건드리지 않음', () => {
    for (const forbidden of ['bot_enabled', 'crowd_min', 'crowd_max', 'burn_per_minute', 'crew_pulse']) {
      assert.ok(!source.includes(forbidden));
      assert.ok(!migration.includes(forbidden));
    }
  }]
];

let passed = 0;
for (const [name, run] of tests) {
  run();
  passed += 1;
  console.log(`PASS ${name}`);
}
console.log(`PASS ${passed}/${tests.length}`);
