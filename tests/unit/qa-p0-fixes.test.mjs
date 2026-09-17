import test from 'node:test';
import assert from 'node:assert/strict';
import { parseLedgerAmount, formatLedgerAmount, walletThreeFromBuckets } from '../../src/wallet/amounts.mjs';
import { maskEmail, maskPhone, maskPersonName, maskIp, maskBirthDate, canRevealMemberPii, maskMemberListPii } from '../../src/admin/pii-mask.mjs';
import { originGate, isOpsHost, resolveOpsOrigin } from '../../src/session/origin-split.mjs';
import { blocksNewStart, rewardUiKind, rewardUiLabel, sanitizeMemberNotice, isReviewWait } from '../../src/work/run-status.mjs';
import { gradeInspectAnswers, normalizeTypedLabel, inspectBundleItems } from '../../src/work/inspect-bundle.mjs';
import { readLaunchFiles, readRepo } from '../helpers/repo.mjs';

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

test('운영자·회원 모달 하단 버튼은 스크롤 폴드 밖으로 잘리지 않는다', async () => {
  const { appCss } = await readLaunchFiles();
  assert.match(appCss, /html\[data-mode="admin"\] \.modal-actions \{[\s\S]{0,120}position:\s*sticky/);
  assert.match(appCss, /html\[data-mode="member"\] \.modal-actions \{[\s\S]{0,120}position:\s*sticky/);
  assert.match(appCss, /\.modal\.cinematic-modal \.modal-actions \{\s*flex:\s*0 0 auto/);
});

test('PIN 감사 기록은 영문 이벤트를 한국어 라벨로 보여준다', async () => {
  const adminJs = await readRepo('dist', 'admin', 'admin.js');
  assert.match(adminJs, /function pinEventLabel/);
  assert.match(adminJs, /function pinScopeLabel/);
  assert.match(adminJs, /pin_fail:\s*'PIN 입력 실패'/);
  assert.match(adminJs, /pinEventLabel\(item\.event\)/);
  assert.match(adminJs, /pinScopeLabel\(item\.scope\)/);
});

test('업무 카드 공개 중지 문구는 화면마다 다르지 않고, 내부 슬러그는 목록에 드러나지 않는다', async () => {
  const { appJs } = await readLaunchFiles();
  const adminJs = await readRepo('dist', 'admin', 'admin.js');
  assert.match(adminJs, /'회원 공개 중지'/);
  assert.match(appJs, /'회원 공개 중지'/);
  assert.equal(appJs.includes("'회원 비공개'"), false);
  assert.doesNotMatch(adminJs, /esc\(node\.publicId \|\| node\.level \|\| ''\)/);
});

test('잔액 입금·차감은 최종 확인 단계를 거친 뒤에만 서버에 반영된다', async () => {
  const { appJs } = await readLaunchFiles();
  assert.match(appJs, /data-phase="entry"/);
  assert.match(appJs, /data-phase="confirm"/);
  assert.match(appJs, /confirmAmount/);
  assert.match(appJs, /back-balance-adjust/);
});

test('회원 화면은 실행 ID를 실행번호로 크게 내걸지 않고, 대시보드 히어로에는 로그아웃 버튼이 없다', async () => {
  const { appJs } = await readLaunchFiles();
  assert.equal(appJs.includes('실행번호'), false);
  assert.match(appJs, /문의 번호/);
  assert.match(appJs, /accountButton = authState\.session\s*\n\s*\? ''/);
});

test('등급·혜택 상단은 이율 문구 대신 다음 등급 안내를, 하단에 작게 이율 문구를 둔다', async () => {
  const { appJs } = await readLaunchFiles();
  assert.match(appJs, /다음 등급 조건은 곧 안내돼요/);
  assert.doesNotMatch(appJs, /지금 등급은 \$\{esc\(current\.label\)\}이에요\. 이율이나 이자는 없어요/);
  assert.match(appJs, /이 등급·혜택은 근무 기회를 나누는 기준이에요\. 이율이나 이자는 없어요/);
});
