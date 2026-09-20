(() => {
  'use strict';
  if (document.documentElement.dataset.mode !== 'admin') return;

  const esc = (value) => String(value ?? '').replace(/[&<>"']/g, (c) => ({ '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#039;' }[c]));
  const when = (value) => value ? new Date(value).toLocaleString('ko-KR') : '없음';
  const typeLabel = (value) => ({ actual_automatic:'실제 자동 집계', operator_confirmed:'운영자 확인값', goal:'목표값' }[value] || value);
  const reviewLabel = (value) => value === 'verified_member' ? '동의 확인된 실제 후기' : '이용 예시';
  const core = () => window.PUTDUK_ADMIN_CORE || null;

  async function load(silent = false) {
    const api = core();
    if (!api) return;
    api.patchState({ adminLandingLoading: true, adminLandingError: null });
    try {
      const result = await api.adminRequest('list_landing_content', {});
      api.patchState({ adminLandingMetrics: result.metrics || [], adminLandingReviews: result.reviews || [], adminLandingConsents: result.consents || [] });
    } catch (error) {
      api.patchState({ adminLandingError: api.friendlyAdminError(error) });
    } finally {
      api.patchState({ adminLandingLoading: false });
      if (!silent) api.render();
    }
  }

  function render() {
    const api = core();
    const state = api?.getState() || {};
    const metrics = state.adminLandingMetrics || [];
    const reviews = state.adminLandingReviews || [];
    const consents = state.adminLandingConsents || [];
    const metricRows = metrics.map((item) => `<tr><td><strong>${esc(item.label_ko)}</strong><br><small>${esc(item.metric_key)}</small></td><td>${Number(item.metric_value || 0).toLocaleString('ko-KR')}</td><td>${esc(typeLabel(item.value_type))}</td><td>${esc(item.source_note)}</td><td>${esc(when(item.measured_at))}</td><td><span class="pill ${item.is_public ? 'ok':'wait'}">${item.is_public ? '공개':'숨김'}</span></td><td><button class="small-button" data-action="landing-visibility" data-kind="metric" data-id="${esc(item.id)}" data-visible="${item.is_public ? 'false':'true'}">${item.is_public ? '숨기기':'공개하기'}</button></td></tr>`).join('');
    const reviewRows = reviews.map((item) => `<tr><td><strong>${esc(item.author_display)}</strong><br><small>${esc(reviewLabel(item.review_type))}</small></td><td>${esc(item.body_ko)}</td><td>${esc(item.completed_work_label || '-')}</td><td>${item.is_work_verified ? '동의 확인':'예시 표기'}</td><td><span class="pill ${item.is_public ? 'ok':'wait'}">${item.is_public ? '공개':'숨김'}</span></td><td><button class="small-button" data-action="landing-visibility" data-kind="review" data-id="${esc(item.id)}" data-visible="${item.is_public ? 'false':'true'}">${item.is_public ? '숨기기':'공개하기'}</button></td></tr>`).join('');
    const consentOptions = consents.map((item) => `<option value="${esc(item.id)}">${esc(item.user_id)} · ${esc(when(item.consented_at))}</option>`).join('');
    return `<div class="section-heading" style="margin-top:0"><div><h1 class="page-title">랜딩 현황·후기</h1><p class="page-copy">랜딩에 공개할 숫자와 후기를 근거와 함께 관리합니다. 기존 회원 홈의 실시간 현황은 이 메뉴와 분리되어 있습니다.</p></div><button class="secondary-button" data-action="refresh-landing-content">새로고침</button></div>
      ${state.adminLandingError ? `<div class="notice"><strong>${esc(state.adminLandingError)}</strong></div>` : ''}
      <div class="admin-card"><div class="admin-card-head"><div><h3>이용 현황 숫자</h3><p>실제 자동 집계·운영자 확인값·목표값을 반드시 구분합니다.</p></div></div>
      <form id="landingMetricForm" class="form-grid"><div class="field"><label>표시 이름</label><input name="label_ko" maxlength="60" required placeholder="예: 누적 가입 회원" /></div><div class="field"><label>식별값</label><input name="metric_key" pattern="[a-z0-9_]{2,64}" required placeholder="total_members" /></div><div class="field"><label>표시 숫자</label><input name="metric_value" type="number" min="0" step="1" required /></div><div class="field"><label>숫자 유형</label><select name="value_type"><option value="operator_confirmed">운영자 확인값</option><option value="actual_automatic">실제 자동 집계</option><option value="goal">목표값</option></select></div><div class="field full"><label>확인 근거</label><textarea name="source_note" minlength="2" maxlength="500" required placeholder="어디에서 언제 확인한 숫자인지 입력"></textarea></div><div class="field"><label>확인 기준 시각</label><input name="measured_at" type="datetime-local" required /></div><div class="field"><label>표시 순서</label><input name="sort_order" type="number" min="0" value="0" /></div><label class="check-row"><input name="is_public" type="checkbox" /> <span>저장 후 바로 공개</span></label><div class="field"><button class="primary-button" type="submit">현황 저장</button></div></form>
      <div class="table-wrap"><table><thead><tr><th>이름</th><th>숫자</th><th>유형</th><th>근거</th><th>기준 시각</th><th>상태</th><th></th></tr></thead><tbody>${metricRows || '<tr><td colspan="7">등록된 공개 현황이 없습니다.</td></tr>'}</tbody></table></div></div>
      <div class="admin-card" style="margin-top:18px"><div class="admin-card-head"><div><h3>랜딩 후기</h3><p>실제 후기는 회원 동의 기록이 있어야 하며, 동의가 없으면 이용 예시로만 표시합니다.</p></div></div>
      <form id="landingReviewForm" class="form-grid"><div class="field"><label>표시 이름</label><input name="author_display" maxlength="40" required placeholder="예: 김** 회원" /></div><div class="field"><label>후기 유형</label><select name="review_type" id="landingReviewType"><option value="usage_example">이용 예시</option><option value="verified_member">동의 확인된 실제 후기</option></select></div><div class="field full"><label>후기 내용</label><textarea name="body_ko" minlength="10" maxlength="500" required></textarea></div><div class="field"><label>완료 업무</label><input name="completed_work_label" maxlength="120" /></div><div class="field"><label>회원 동의 기록</label><select name="consent_id"><option value="">이용 예시는 선택 안 함</option>${consentOptions}</select></div><div class="field"><label>공개 시작</label><input name="public_starts_at" type="datetime-local" /></div><div class="field"><label>공개 종료</label><input name="public_ends_at" type="datetime-local" /></div><div class="field"><label>표시 순서</label><input name="sort_order" type="number" min="0" value="0" /></div><label class="check-row"><input name="is_public" type="checkbox" /> <span>저장 후 바로 공개</span></label><div class="field"><button class="primary-button" type="submit">후기 저장</button></div></form>
      <div class="table-wrap"><table><thead><tr><th>표시</th><th>내용</th><th>업무</th><th>검증</th><th>상태</th><th></th></tr></thead><tbody>${reviewRows || '<tr><td colspan="6">등록된 후기가 없습니다.</td></tr>'}</tbody></table></div></div>`;
  }

  async function save(form, action) {
    const api = core();
    const data = Object.fromEntries(new FormData(form).entries());
    data.is_public = form.elements.is_public.checked;
    data.sort_order = Number(data.sort_order || 0);
    if (data.metric_value != null) data.metric_value = Number(data.metric_value);
    for (const key of ['measured_at','public_starts_at','public_ends_at']) if (data[key]) data[key] = new Date(data[key]).toISOString();
    try {
      await api.adminRequest(action, data);
      api.showToast('저장했습니다.', 'success');
      form.reset();
      await load();
    } catch (error) {
      api.showToast(api.friendlyAdminError(error), 'error');
    }
  }

  function install() {
    const ext = window.PUTDUK_ADMIN;
    if (!ext || ext.__landingInstalled) return false;
    ext.__landingInstalled = true;
    const oldRender = ext.renderPage.bind(ext);
    const oldRefresh = ext.refreshPage.bind(ext);
    const oldClick = ext.handleClick.bind(ext);
    ext.renderPage = (page) => page === 'landing-content' ? render() : oldRender(page);
    ext.refreshPage = async () => {
      await oldRefresh();
      if (core()?.getState()?.adminPage === 'landing-content') await load(true);
    };
    ext.handleClick = (event, target) => {
      const action = target?.dataset?.action;
      if (action === 'refresh-landing-content') { load(); return true; }
      if (action === 'landing-visibility') {
        core().adminRequest('set_landing_visibility', { id:target.dataset.id, kind:target.dataset.kind, is_public:target.dataset.visible === 'true' })
          .then(() => load()).catch((error) => core().showToast(core().friendlyAdminError(error), 'error'));
        return true;
      }
      return oldClick(event, target);
    };
    document.addEventListener('submit', (event) => {
      if (event.target?.id === 'landingMetricForm') { event.preventDefault(); event.stopImmediatePropagation(); save(event.target, 'save_landing_metric'); }
      if (event.target?.id === 'landingReviewForm') { event.preventDefault(); event.stopImmediatePropagation(); save(event.target, 'save_landing_review'); }
    }, true);
    return true;
  }

  if (!install()) {
    const timer = setInterval(() => { if (install()) clearInterval(timer); }, 50);
    setTimeout(() => clearInterval(timer), 10000);
  }
})();