(() => {
  'use strict';

  if (document.documentElement.dataset.mode !== 'admin') return;
  if (window.__PUTDUK_ADMIN_OVERVIEW_CONTRACT__) return;
  window.__PUTDUK_ADMIN_OVERVIEW_CONTRACT__ = '20260920-p2overview1';

  const admin = window.PUTDUK_ADMIN;
  const core = window.PUTDUK_ADMIN_CORE;
  if (!admin || typeof admin.renderPage !== 'function' || !core?.getState) return;

  const nativeRenderPage = admin.renderPage.bind(admin);
  const TERMINAL = new Set(['approved', 'rework', 'rejected']);

  function dayKey(value) {
    const date = value instanceof Date ? value : new Date(value || Date.now());
    if (Number.isNaN(date.getTime())) return '';
    try {
      return new Intl.DateTimeFormat('en-CA', {
        timeZone: 'Asia/Seoul',
        year: 'numeric',
        month: '2-digit',
        day: '2-digit'
      }).format(date);
    } catch (_) {
      return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
    }
  }

  function money(value) {
    const amount = Number(value || 0);
    return `${Math.round(Number.isFinite(amount) ? amount : 0).toLocaleString('ko-KR')}원`;
  }

  function overviewStats() {
    const state = core.getState() || {};
    const reviews = Array.isArray(state.adminReviews) ? state.adminReviews : [];
    const today = dayKey(new Date());
    const todayRows = reviews.filter((item) => dayKey(item?.updated_at || item?.completed_at || item?.created_at) === today);
    const processed = todayRows.filter((item) => TERMINAL.has(String(item?.status || '')));
    const approved = processed.filter((item) => item?.status === 'approved');
    const rejected = processed.filter((item) => item?.status === 'rejected');
    const rework = processed.filter((item) => item?.status === 'rework');
    const approvedReward = approved.reduce((sum, item) => sum + Number(item?.reward_amount || 0), 0);
    const pending = Number(state.adminReviewPendingCount || 0);
    const health = state.adminReviewError
      ? { label: '점검 필요', tone: 'warning' }
      : state.adminReviewLoading || state.adminMembersContract !== true
        ? { label: '확인 중', tone: 'loading' }
        : { label: '정상', tone: 'ok' };
    return { processed, approved, rejected, rework, approvedReward, pending, health };
  }

  function replaceStat(html, label, value, note) {
    const pattern = new RegExp(`(<div class="admin-stat"><p>${label}</p><strong>)(.*?)(</strong><span[^>]*>)(.*?)(</span></div>)`);
    return html.replace(pattern, `$1${value}$3${note}$5`);
  }

  function flowMarkup(stats) {
    const items = [
      ['오늘 처리', stats.processed.length, '승인·반려·재확인'],
      ['승인', stats.approved.length, '보상 확정'],
      ['반려', stats.rejected.length, '보상 미지급'],
      ['재확인', stats.rework.length, '추가 확인 필요'],
      ['현재 대기', stats.pending, '제출·검수 대기']
    ];
    return `<div class="admin-overview-flow" role="group" aria-label="오늘 검수 처리 현황" style="display:grid;grid-template-columns:repeat(auto-fit,minmax(110px,1fr));gap:10px;padding:14px 0 2px">${items.map(([label, value, note]) => `<div style="border:1px solid var(--line);border-radius:14px;padding:14px;background:var(--surface)"><span style="display:block;color:var(--muted);font-size:12px">${label}</span><strong style="display:block;font-size:24px;margin-top:4px">${value}</strong><small style="color:var(--muted)">${note}</small></div>`).join('')}</div>`;
  }

  function patchOverview(html) {
    if (typeof html !== 'string' || !html.includes('오늘의 운영 흐름')) return html;
    const stats = overviewStats();
    let next = replaceStat(html, '오늘 처리 업무', String(stats.processed.length), '승인·반려·재확인 완료 기준 · 한국시간');
    next = replaceStat(next, '오늘 확정 보상', money(stats.approvedReward), '오늘 승인 완료 기준 · 한국시간');
    next = next.replace(
      /<span class="status-badge">[\s\S]*?<\/span><\/div><div class="chart-wrap" style="padding:0;height:250px"><canvas id="adminChart" aria-label="운영 현황"><\/canvas><\/div>/,
      `<span class="status-badge" data-overview-health="${stats.health.tone}">${stats.health.label}</span></div>${flowMarkup(stats)}`
    );
    next = next.replace('서버에 기록된 업무 상태를 기준으로 확인합니다.', '한국시간 기준 오늘 완료된 검수와 현재 대기 상태를 구분해 보여 줍니다.');
    return next;
  }

  admin.renderPage = function putdukAdminOverviewContract(page) {
    const html = nativeRenderPage(page);
    return page === 'overview' ? patchOverview(html) : html;
  };
})();
