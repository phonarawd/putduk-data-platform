import test from 'node:test';
import assert from 'node:assert/strict';
import { pickClientIp, sanitizeClientIp, isPrivateClientIp } from '../../src/session/client-ip.mjs';
import { readLaunchFiles, readRepo } from '../helpers/repo.mjs';

test('접속 주소는 공개 IP를 고르고 포트·사설망은 버린다', () => {
  assert.equal(sanitizeClientIp('203.0.113.77:443'), '203.0.113.77');
  assert.equal(sanitizeClientIp('::ffff:203.0.113.77'), '203.0.113.77');
  assert.equal(sanitizeClientIp('[2001:db8::1]:443'), '2001:db8::1');
  assert.equal(sanitizeClientIp('unknown'), null);
  assert.equal(isPrivateClientIp('10.0.0.8'), true);
  assert.equal(isPrivateClientIp('203.0.113.77'), false);
  assert.equal(pickClientIp({
    'x-forwarded-for': '10.1.1.1, 203.0.113.77'
  }, '127.0.0.1'), '203.0.113.77');
  assert.equal(pickClientIp({
    'cf-connecting-ip': '198.51.100.9',
    'x-forwarded-for': '10.1.1.1'
  }), '198.51.100.9');
});

test('출근 확인·근무 전표는 애니메이션 없이 배정카드·영수증이다', async () => {
  const { appJs, appCss } = await readLaunchFiles();
  const startBody = appJs.slice(appJs.indexOf('function renderStartConfirm'), appJs.indexOf('function renderResultOverlay'));
  const resultBody = appJs.slice(appJs.indexOf('function renderResultOverlay'), appJs.indexOf('function renderOnboarding'));
  const grantBody = appJs.slice(appJs.indexOf('onboard-grant'), appJs.indexOf('function renderMemberTabbar'));
  const nodeBody = appJs.slice(appJs.indexOf('function renderNodeCard'), appJs.indexOf('function renderTimeline'));
  assert.equal(startBody.includes('id="startMotionCanvas"'), false);
  assert.equal(resultBody.includes('id="resultMotionCanvas"'), false);
  assert.match(startBody, /업무 배정/);
  assert.match(resultBody, /근무 완료 전표/);
  assert.match(resultBody, /운영자 검수가 완료됐어요/);
  assert.match(resultBody, /검수 완료 영수증/);
  assert.match(grantBody, /업무 지원금 \$\{money\(grant\)\}은 근무에 쓰여요/);
  assert.match(grantBody, /체험 수당 3천원은 USDT로만 출금가능해요/);
  assert.match(appJs, /수당 \$\{money\(pay\)\}/);
  assert.match(nodeBody, /compact-node/);
  assert.match(nodeBody, /남은 자리/);
  assert.equal(nodeBody.includes('끝나면 수당'), false);
  assert.equal(nodeBody.includes('settleNote'), false);
  assert.match(appCss, /\.grant-copy/);
  assert.match(appCss, /\.receipt-modal/);
  assert.match(appCss, /\.assign-kicker/);
});

test('운영자 잔액 조정은 칸을 골라 서버에 보낸다', async () => {
  const { appJs } = await readLaunchFiles();
  const adminOps = await readRepo('supabase', 'functions', '_shared', 'admin-ops.ts');
  const migration = await readRepo('supabase', 'migrations', '20260918200000_putduk_session_ip_and_adjust_bucket.sql');
  assert.match(appJs, /name="bucket"/);
  assert.match(appJs, /reason: values\.reason,\s*bucket/);
  assert.match(adminOps, /normalizeAdjustBucket/);
  assert.match(adminOps, /p_bucket: bucket/);
  assert.match(migration, /v_bucket := 'available'/);
  assert.match(migration, /on conflict \(user_id\) do update/);
});
