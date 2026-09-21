(() => {
  'use strict';
  if (document.documentElement.dataset.mode !== 'member') return;

  const config = window.PUTDUK_CONFIG || {};
  const detailUrl = config.memberTaskDetailUrl || (config.supabaseUrl ? `${config.supabaseUrl}/functions/v1/member-task-detail` : '');
  let client = null;
  let observer = null;
  let busyRunId = null;

  function esc(value) {
    return String(value ?? '').replace(/[&<>"']/g, (char) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#039;' }[char]));
  }

  function money(value, currency = 'KRW') {
    const amount = Number(value);
    if (!Number.isFinite(amount)) return '-';
    if (String(currency).toUpperCase() === 'KRW') return `${Math.round(amount).toLocaleString('ko-KR')}원`;
    return `${amount.toLocaleString('ko-KR')} ${currency}`;
  }

  function when(value) {
    if (!value) return '-';
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return '-';
    return date.toLocaleString('ko-KR', { year: 'numeric', month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit' });
  }

  function statusLabel(value) {
    const raw = String(value || '').toLowerCase();
    if (['submitted', 'under_review', 'review_pending'].includes(raw)) return '검수 대기';
    if (raw === 'approved') return '검수 완료';
    if (raw === 'rework') return '재작업';
    if (['rejected', 'reject'].includes(raw)) return '반려';
    if (['reserved', 'in_progress', 'checkpointed'].includes(raw)) return '진행 중';
    return value || '상태 확인 중';
  }

  function getClient() {
    if (client) return client;
    if (!window.supabase || !config.supabaseUrl || !config.supabasePublishableKey) return null;
    client = window.supabase.createClient(config.supabaseUrl, config.supabasePublishableKey, {
      auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: false }
    });
    return client;
  }

  async function session() {
    const api = getClient();
    if (!api) return null;
    const { data } = await api.auth.getSession();
    return data?.session || null;
  }

  async function historyRows() {
    const active = await session();
    const userId = active?.user?.id;
    if (!userId) return [];
    try {
      const raw = localStorage.getItem(`putduk-state-v2:${userId}`);
      const parsed = raw ? JSON.parse(raw) : null;
      return Array.isArray(parsed?.history) ? parsed.history : [];
    } catch (_) {
      return [];
    }
  }

  async function decorateHistory() {
    const rows = await historyRows();
    if (!rows.length) return;
    const cards = [...document.querySelectorAll('.record-card')];
    const tableRows = [...document.querySelectorAll('.record-table tbody tr')];
    rows.forEach((item) => {
      if (!item?.dbId || !item?.id) return;
      const needle = `문의 번호 ${item.id}`;
      [...cards, ...tableRows].forEach((element) => {
        if (!element.textContent?.includes(needle)) return;
        element.dataset.action = 'open-work-history';
        element.dataset.runId = item.dbId;
        element.classList.add('phase2-history-open');
        element.setAttribute('role', 'button');
        element.setAttribute('tabindex', '0');
        element.setAttribute('aria-label', `${needle} 업무 상세 보기`);
      });
    });
  }

  function closeModal() {
    document.getElementById('phase2WorkHistoryModal')?.remove();
    busyRunId = null;
  }

  function modalShell(body, loading = false) {
    closeModal();
    const overlay = document.createElement('div');
    overlay.id = 'phase2WorkHistoryModal';
    overlay.className = 'phase2-detail-overlay';
    overlay.innerHTML = `<section class="phase2-detail-modal" role="dialog" aria-modal="true" aria-labelledby="phase2DetailTitle">
      <div class="phase2-detail-head"><div><p class="phase2-detail-kicker">업무 내역</p><h2 id="phase2DetailTitle">${loading ? '업무 상세를 불러오는 중' : '업무 상세'}</h2></div><button type="button" class="phase2-detail-close" data-phase2-close aria-label="닫기">×</button></div>
      <div class="phase2-detail-body">${body}</div>
    </section>`;
    document.body.appendChild(overlay);
    overlay.querySelector('[data-phase2-close]')?.addEventListener('click', closeModal);
    overlay.addEventListener('click', (event) => { if (event.target === overlay) closeModal(); });
    document.addEventListener('keydown', function escClose(event) {
      if (event.key !== 'Escape' || !document.getElementById('phase2WorkHistoryModal')) return;
      closeModal();
      document.removeEventListener('keydown', escClose);
    });
  }

  function submissionHtml(submission) {
    if (!submission) return '<div class="phase2-empty">제출 기록이 없습니다.</div>';
    const payload = submission.answer_payload;
    if (!payload || (typeof payload === 'object' && !Object.keys(payload).length)) return '<div class="phase2-empty">제출 내용이 비어 있습니다.</div>';
    return `<pre class="phase2-json">${esc(JSON.stringify(payload, null, 2))}</pre>`;
  }

  function assetsHtml(assets) {
    const rows = Array.isArray(assets) ? assets : [];
    if (!rows.length) return '<div class="phase2-empty">등록된 업무 이미지가 없습니다.</div>';
    return `<div class="phase2-assets">${rows.map((asset) => {
      if (asset.kind === 'pdf') return `<a class="phase2-file-link" href="${esc(asset.url)}" target="_blank" rel="noopener noreferrer">증빙 PDF 열기</a>`;
      return `<figure class="phase2-image-wrap"><img data-work-image src="${esc(asset.url)}" alt="업무 또는 제출 이미지" loading="lazy" /><figcaption>업무 이미지</figcaption></figure>`;
    }).join('')}</div>`;
  }

  function reviewsHtml(rows) {
    const list = Array.isArray(rows) ? rows : [];
    if (!list.length) return '<div class="phase2-empty">검수 이력이 아직 없습니다.</div>';
    return `<ol class="phase2-timeline">${list.map((row) => `<li><strong>${esc(statusLabel(row.status || row.event_type))}</strong><span>${esc(when(row.created_at))}</span>${row.reason ? `<p>${esc(row.reason)}</p>` : ''}</li>`).join('')}</ol>`;
  }

  function settlementHtml(rows) {
    const list = Array.isArray(rows) ? rows : [];
    if (!list.length) return '<div class="phase2-empty">확정 원장 반영 내역이 없습니다.</div>';
    return `<div class="phase2-settlement">${list.map((row) => `<div><span>${esc(row.entry_type || row.bucket || '정산')}</span><strong>${esc(money(row.amount, row.currency))}</strong><small>${esc(when(row.created_at))}</small></div>`).join('')}</div>`;
  }

  function renderDetail(detail) {
    const run = detail?.task_run || {};
    const node = detail?.node || {};
    const partner = detail?.partner || {};
    const confirmed = (detail?.settlement || []).reduce((sum, row) => sum + (Number(row.amount) || 0), 0);
    modalShell(`<div class="phase2-summary">
      <div><span>협력사</span><strong>${esc(partner.display_name_ko || '협력사 확인 중')}</strong></div>
      <div><span>업무</span><strong>${esc(node.title_ko || '업무명 확인 중')}</strong></div>
      <div><span>문의 번호</span><strong>${esc(run.public_id || '-')}</strong></div>
      <div><span>현재 상태</span><strong>${esc(statusLabel(run.status))}</strong></div>
    </div>
    <section class="phase2-section"><h3>진행 시각</h3><dl class="phase2-dl"><div><dt>시작</dt><dd>${esc(when(run.started_at))}</dd></div><div><dt>제출</dt><dd>${esc(when(detail?.submission?.submitted_at))}</dd></div><div><dt>완료</dt><dd>${esc(when(run.completed_at))}</dd></div></dl></section>
    <section class="phase2-section"><h3>업무 내용</h3><p>${esc(node.question_prompt_ko || '업무 안내가 등록되어 있지 않습니다.')}</p>${assetsHtml(detail?.assets)}</section>
    <section class="phase2-section"><h3>내가 제출한 내용</h3>${submissionHtml(detail?.submission)}</section>
    <section class="phase2-section"><h3>검수 이력</h3>${reviewsHtml(detail?.review_history)}</section>
    <section class="phase2-section"><h3>정산</h3><div class="phase2-money-grid"><div><span>예상 수당</span><strong>${esc(money(run.reward_amount ?? node.stipend_krw))}</strong></div><div><span>확정 원장 합계</span><strong>${esc(money(confirmed))}</strong></div></div>${settlementHtml(detail?.settlement)}</section>`);
  }

  async function openDetail(runId) {
    if (!runId || busyRunId === runId) return;
    modalShell('<div class="phase2-loading">업무 기록을 안전하게 확인하고 있습니다.</div>', true);
    busyRunId = runId;
    try {
      const active = await session();
      if (!active?.access_token) throw new Error('로그인이 필요합니다.');
      if (!detailUrl) throw new Error('업무 상세 API 주소가 없습니다.');
      const response = await fetch(detailUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${active.access_token}`, apikey: config.supabasePublishableKey || '' },
        body: JSON.stringify({ action: 'task_detail', run_id: runId })
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok || payload.ok !== true || !payload.detail) throw new Error(payload.error || '업무 상세를 불러오지 못했습니다.');
      renderDetail(payload.detail);
    } catch (error) {
      modalShell(`<div class="phase2-error"><strong>업무 상세를 불러오지 못했습니다.</strong><p>${esc(error?.message || '잠시 후 다시 시도해 주세요.')}</p></div>`);
    } finally {
      busyRunId = null;
    }
  }

  function replaceBrokenImage(img, copy = '이미지를 불러오지 못했습니다') {
    if (!img || img.dataset.phase2Fallback === '1') return;
    img.dataset.phase2Fallback = '1';
    const box = document.createElement('div');
    box.className = 'phase2-image-fallback';
    box.textContent = copy;
    img.replaceWith(box);
  }

  document.addEventListener('error', (event) => {
    const img = event.target;
    if (img instanceof HTMLImageElement && (img.hasAttribute('data-work-image') || img.closest('.phase2-assets'))) replaceBrokenImage(img);
  }, true);

  document.addEventListener('click', (event) => {
    const target = event.target.closest?.('[data-action="open-work-history"]');
    if (!target) return;
    event.preventDefault();
    openDetail(target.dataset.runId);
  }, true);

  document.addEventListener('keydown', (event) => {
    if (event.key !== 'Enter' && event.key !== ' ') return;
    const target = event.target.closest?.('[data-action="open-work-history"]');
    if (!target) return;
    event.preventDefault();
    openDetail(target.dataset.runId);
  });

  function boot() {
    decorateHistory();
    const app = document.getElementById('app');
    if (!app || observer) return;
    observer = new MutationObserver(() => decorateHistory());
    observer.observe(app, { childList: true, subtree: true });
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot);
  else boot();
})();