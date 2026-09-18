import test from 'node:test';
import assert from 'node:assert/strict';
import { memberCatalogVisible, sortMemberCatalog, assignedNodeIdSet, ULTRA_STAKE } from '../../src/work/member-catalog.mjs';
import {
  noticeDisplayText,
  mapNoticeRow,
  unreadNoticeCount,
  noticeBadgeLabel,
  arrivedUnreadNotice,
  arrivedNoticeToast
} from '../../src/work/member-notices.mjs';
import { sanitizeMemberNotice } from '../../src/work/run-status.mjs';
import { readLaunchFiles } from '../helpers/repo.mjs';

test('운영자 배정 칸은 초고액·사다리 숨김을 건너뛴다', () => {
  const assignedIds = assignedNodeIdSet([{ node_id: 'ultra-1' }]);
  const ultra = { id: 'ultra-1', requiresAssign: true, tierBand: '초고액', enabled: true, stake: ULTRA_STAKE };
  const hiddenUltra = { id: 'ultra-2', requiresAssign: true, tierBand: '초고액', enabled: true, stake: ULTRA_STAKE };
  const lockedMid = { id: 'mid-1', enabled: true, stake: 1000000 };
  assert.equal(memberCatalogVisible(ultra, { assignedIds, stake: ULTRA_STAKE, work: 0 }), true);
  assert.equal(memberCatalogVisible(hiddenUltra, { assignedIds, stake: ULTRA_STAKE, work: 0 }), false);
  assert.equal(memberCatalogVisible(lockedMid, { assignedIds, stake: 1000000, work: 0, maxDone: 0 }), false);
  const sorted = [lockedMid, ultra].sort((a, b) => sortMemberCatalog(a, b, assignedIds, (node) => node.stake));
  assert.equal(sorted[0].id, 'ultra-1');
});

test('알림은 본문이 비어도 남고 안 읽음 숫자를 센다', () => {
  assert.equal(noticeDisplayText('운영자 안내', '', sanitizeMemberNotice), '📬 새 안내가 도착했어요.');
  const rows = [
    mapNoticeRow({ id: 'a', title: '근무 배정', body: '라인에 도착했어요.', notification_type: 'work', read_at: null }, sanitizeMemberNotice, () => '지금'),
    mapNoticeRow({ id: 'b', title: '읽은 안내', body: '확인했어요.', read_at: '2026-09-18T00:00:00Z' }, sanitizeMemberNotice, () => '어제')
  ];
  assert.equal(rows[0].read, false);
  assert.equal(unreadNoticeCount(rows), 1);
  assert.equal(noticeBadgeLabel(1), '1');
  assert.equal(noticeBadgeLabel(120), '99+');
  const arrived = arrivedUnreadNotice(new Set(['b']), rows);
  assert.equal(arrived.id, 'a');
  assert.match(arrivedNoticeToast(arrived), /라인 찾기/);
});

test('회원 화면은 종 숫자·읽음 처리·배정 조회를 실제로 쓴다', async () => {
  const { appJs, appCss } = await readLaunchFiles();
  assert.match(appJs, /from\('task_assignments'\)/);
  assert.match(appJs, /node\.assigned/);
  assert.match(appJs, /notice-badge/);
  assert.match(appJs, /read_at/);
  assert.match(appJs, /mark-notices-read/);
  assert.match(appJs, /postgres_changes/);
  assert.match(appCss, /\.notice-badge/);
  assert.match(appCss, /\.notice-row\.is-unread/);
});
