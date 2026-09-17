import test from 'node:test';
import assert from 'node:assert/strict';
import { parseLedgerAmount, formatLedgerAmount, walletThreeFromBuckets } from '../../src/wallet/amounts.mjs';
import { maskEmail, maskPhone, maskPersonName, maskIp, maskBirthDate, canRevealMemberPii, maskMemberListPii } from '../../src/admin/pii-mask.mjs';
import { originGate, isOpsHost, resolveOpsOrigin } from '../../src/session/origin-split.mjs';
import { blocksNewStart, rewardUiKind, rewardUiLabel, sanitizeMemberNotice, isReviewWait } from '../../src/work/run-status.mjs';
import { gradeInspectAnswers, normalizeTypedLabel, inspectBundleItems } from '../../src/work/inspect-bundle.mjs';

test('없는 금액은 0원이 아니라 확인 필요다', () => {
  assert.equal(parseLedgerAmount(null), null);
  assert.equal(parseLedgerAmount(undefined), null);
  assert.equal(parseLedgerAmount(''), null);
  assert.equal(parseLedgerAmount(0), 0);
  assert.equal(formatLedgerAmount(null), '확인 필요');
  assert.equal(formatLedgerAmount(0), '0원');
  assert.equal(formatLedgerAmount(1970000), '1,970,000원');
  const three = walletThreeFromBuckets([
    { bucket: 'work_balance', currency: 'KRW', available_amount: 1970000, held_amount: 30000 },
    { bucket: 'available', currency: 'KRW', available_amount: 0, held_amount: 0 }
  ]);
  assert.equal(three.work, 1970000);
  assert.equal(three.workHeld, 30000);
  assert.equal(three.available, 0);
  assert.equal(three.support, null);
});

test('목록 개인정보는 마스킹하고 최고 운영자만 전체를 본다', () => {
  assert.equal(maskEmail('test@example.com'), 'te***@example.com');
  assert.equal(maskPhone('01012341234'), '010-****-1234');
  assert.equal(maskPhone('010-****-1234'), '010-****-1234');
  assert.equal(maskEmail('te***@example.com'), 'te***@example.com');
  assert.equal(maskPersonName('홍길동'), '홍*동');
  assert.equal(maskIp('203.0.113.77'), '203.***.***.77');
  assert.equal(maskBirthDate('1990-01-02'), '1990-**-**');
  assert.equal(canRevealMemberPii(['member_support']), false);
  assert.equal(canRevealMemberPii(['super_admin']), true);
  const masked = maskMemberListPii({ email: 'crew.trial@putduk.local', phone_e164: '+821012341234', legal_name: '홍길동' });
  assert.match(masked.email, /\*\*\*/);
  assert.match(masked.phone, /\*\*\*\*/);
  assert.equal(masked.legal_name, '홍*동');
});

test('회원·운영자 origin은 포트와 호스트로 분리한다', () => {
  assert.equal(isOpsHost('127.0.0.1', '4174'), true);
  assert.equal(isOpsHost('127.0.0.1', '4173'), false);
  const memberAdmin = originGate({ protocol: 'http:', hostname: '127.0.0.1', port: '4173', pathname: '/admin/', search: '', hash: '' }, 'admin');
  assert.equal(memberAdmin.action, 'redirect');
  assert.equal(memberAdmin.url, 'http://127.0.0.1:4174/admin/');
  const opsRoot = originGate({ protocol: 'http:', hostname: '127.0.0.1', port: '4174', pathname: '/', search: '', hash: '' }, 'member');
  assert.equal(opsRoot.action, 'redirect');
  assert.match(opsRoot.url, /\/admin\//);
  const prod = originGate({ protocol: 'https:', hostname: 'app.hiptk.app', port: '', pathname: '/admin/', search: '', hash: '' }, 'admin');
  assert.equal(prod.action, 'redirect');
  assert.equal(prod.url, 'https://ops.hiptk.app/admin/');
  assert.equal(resolveOpsOrigin({ protocol: 'https:', hostname: 'hiptk.app', port: '' }), 'https://ops.hiptk.app');
  const opsIndex = originGate({ protocol: 'http:', hostname: '127.0.0.1', port: '4174', pathname: '/index.html', search: '', hash: '' }, 'member');
  assert.equal(opsIndex.action, 'redirect');
  assert.match(opsIndex.url, /\/admin\//);
});

test('제출·검수 대기는 새 출근을 막고 예상 보상으로 표시한다', () => {
  assert.equal(isReviewWait('submitted'), true);
  assert.equal(blocksNewStart('submitted'), true);
  assert.equal(blocksNewStart('in_progress'), true);
  assert.equal(blocksNewStart('approved'), false);
  assert.equal(rewardUiKind({ status: 'submitted', reward_status: 'pending' }), 'review_wait');
  assert.equal(rewardUiLabel('review_wait'), '예상 보상 · 검수 대기');
  assert.equal(rewardUiKind({ status: 'approved', reward_status: 'posted' }), 'posted');
  assert.equal(sanitizeMemberNotice('운영자 안내·테스트 출금 가능으로 반영'), '검수 완료로 기록');
  assert.match(sanitizeMemberNotice('수당 0원이 출금 가능에 들어왔어요.'), /지갑에서 확인/);
  assert.equal(sanitizeMemberNotice('1,000,000.00원 · 운영자 안내·테스트'), '처리 기록이 있어요. 금액은 지갑에서 확인해요.');
  assert.match(sanitizeMemberNotice('원금 0원은 근무 잔액에, 수당 10,000,000원은 출금 가능에 반영됐어요.'), /검수 완료로 기록/);
});

test('실물 라벨 입력도 검수 정답으로 채점한다', () => {
  const runId = '11111111-1111-4111-8111-111111111111';
  const items = inspectBundleItems(runId);
  const typed = items.map((item) => item.targetCode);
  assert.equal(gradeInspectAnswers(runId, typed).ok, true);
  typed[0] = 'PDK-0000';
  assert.equal(gradeInspectAnswers(runId, typed).ok, false);
  assert.equal(normalizeTypedLabel('1234'), 'PDK-1234');
});
