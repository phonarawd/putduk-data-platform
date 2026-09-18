// 회원 종 알림. 안 읽음 숫자와 도착 안내는 서버 read_at 기준.

export function noticeDisplayText(title, body, sanitize) {
  const clean = typeof sanitize === 'function' ? sanitize : (value) => String(value || '').replace(/\s+/g, ' ').trim();
  const bodyText = clean(body);
  const titleText = clean(title);
  return bodyText || titleText || '📬 새 안내가 도착했어요.';
}

export function mapNoticeRow(row, sanitize, formatTime) {
  const title = noticeDisplayText(row?.title, '', sanitize);
  const text = noticeDisplayText(row?.title, row?.body, sanitize);
  const time = typeof formatTime === 'function' ? formatTime(row?.created_at) : '';
  return {
    id: row?.id,
    title: title === '📬 새 안내가 도착했어요.' ? '안내' : title,
    text,
    time,
    type: row?.notification_type || row?.type || 'info',
    read: Boolean(row?.read_at || row?.read)
  };
}

export function unreadNoticeCount(notices) {
  return (notices || []).filter((item) => item && !item.read).length;
}

export function noticeBadgeLabel(count) {
  const n = Math.max(0, Number(count) || 0);
  if (n <= 0) return '';
  return n > 99 ? '99+' : String(n);
}

export function arrivedUnreadNotice(previousIds, notices) {
  const seen = previousIds instanceof Set ? previousIds : new Set(previousIds || []);
  return (notices || []).find((item) => item && item.id && !item.read && !seen.has(item.id)) || null;
}

export function arrivedNoticeToast(item) {
  if (item?.type === 'work') return '📬 새 근무가 배정됐어요. 라인 찾기에서 확인해 주세요.';
  return '📬 새 안내가 도착했어요. 종을 눌러 확인해 주세요.';
}
