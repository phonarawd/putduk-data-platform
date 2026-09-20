(() => {
  'use strict';
  if (document.documentElement.dataset.mode !== 'admin') return;

  const MASTER_MENU = [
    { id: 'overview', label: '운영 현황', icon: 'layout-dashboard' },
    { id: 'members', label: '회원', icon: 'users' },
    { id: 'partners', label: '협력사', icon: 'building-2' },
    { id: 'funding', label: '지급예산', icon: 'badge-won' },
    { id: 'work-create', label: '업무 만들기', icon: 'square-plus' },
    { id: 'published-work', label: '공개 업무', icon: 'briefcase-business' },
    { id: 'assignments', label: '회원 업무 배정', icon: 'user-round-check' },
    { id: 'reviews', label: '업무 검수', icon: 'clipboard-check' },
    { id: 'finance', label: '입출금', icon: 'wallet-cards' },
    { id: 'grants', label: '가입 지원금', icon: 'gift' },
    { id: 'member-tiers', label: '회원 등급', icon: 'medal' },
    { id: 'onboarding', label: '첫 이용 안내', icon: 'route' },
    { id: 'faq', label: '자주 묻는 질문', icon: 'circle-help' },
    { id: 'member-alerts', label: '회원 알림', icon: 'bell' },
    { id: 'live-status', label: '실시간 현황 표시', icon: 'activity' },
    { id: 'notices', label: '공지', icon: 'megaphone' },
    { id: 'identity', label: '본인확인', icon: 'badge-check' },
    { id: 'audit', label: '변경 기록', icon: 'history' },
    { id: 'preview', label: '화면 미리보기', icon: 'monitor-smartphone' },
    { id: 'landing-metrics', label: '랜딩 이용 현황', icon: 'chart-no-axes-combined' },
    { id: 'landing-reviews', label: '랜딩 회원 후기', icon: 'message-square-heart' }
  ];
  if (MASTER_MENU.length !== 21) throw new Error('Admin MASTER menu must have exactly 21 items.');

  const core = () => window.PUTDUK_ADMIN_CORE || null;
  const S = () => core()?.getState?.() || {};
  const patch = (v) => core()?.patchState?.(v);
  const esc = (v) => core()?.esc ? core().esc(v) : String(v ?? '').replace(/[&<>"']/g, (c) => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#039;'}[c]));
  const icon = (n, s = 17) => core()?.icon ? core().icon(n, s) : '';
  const money = (v) => core()?.money ? core().money(v) : `${Number(v || 0).toLocaleString('ko-KR')}원`;
  const toast = (t, k = 'success') => core()?.showToast?.(t, k);
  const friendly = (e) => core()?.friendlyAdminError?.(e) || e?.message || '요청을 처리하지 못했습니다.';
  const section = (title, copy, action = '') => `<div class="section-heading" style="margin-top:0"><div><h1 class="page-title">${esc(title)}</h1><p class="page-copy">${esc(copy)}</p></div>${action}</div>`;

  async function loadMaster(silent = false) {
    const api = core();
    if (!api) return;
    try {
      const r = await api.adminRequest('list_master_ops', {});
      patch({
        adminFundingPools: r.funding_pools || [], adminFundingAllocations: r.funding_allocations || [],
        adminContentItems: r.content_items || [], adminAuditLogs: r.audit_logs || [],
        adminPartnerEvidence: r.partner_evidence || [], adminMasterError: null
      });
    } catch (e) { patch({ adminMasterError: friendly(e) }); }
    if (!silent) api.render();
  }

  const brands = () => core()?.adminBrandViews?.() || S().adminCatalog?.brands || [];
  const nodes = () => core()?.adminNodeViews?.() || S().adminCatalog?.nodes || [];
  const brandName = (id) => {
    const b = brands().find((x) => String(x.id) === String(id));
    return b?.name || b?.display_name_ko || b?.legal_name || '협력사';
  };

  function replaceSidebar() {
    const nav = document.querySelector('#sidebar nav[aria-label="주요 메뉴"]');
    if (!nav) return;
    nav.innerHTML = MASTER_MENU.map((x) => `<button class="nav-item ${S().adminPage === x.id ? 'active' : ''}" data-nav="${x.id}">${icon(x.icon)}<span>${x.label}</span></button>`).join('');
    const label = document.querySelector('#sidebar .nav-label');
    if (label) label.textContent = '운영 메뉴 · 21개';
  }

  function modal(html) {
    document.getElementById('masterModalHost')?.remove();
    const host = document.createElement('div');
    host.id = 'masterModalHost'; host.innerHTML = html; document.body.appendChild(host);
  }
  const closeModal = () => document.getElementById('masterModalHost')?.remove();

  function renderPartners() {
    const rows = brands().map((b) => {
      const verified = b.verified === true || b.verification_status === 'approved';
      return `<tr><td><strong>${esc(b.name || b.display_name_ko || '협력사')}</strong><br><small>${esc(b.legal_name || '')}</small></td><td>${esc(b.category || '-')}</td><td>${verified ? '확인 완료':'확인 대기'}</td><td>${b.published ? '회원 공개':'비공개'}</td><td><button class="small-button" data-action="m-partner-edit" data-id="${esc(b.id)}">수정</button> ${!verified ? `<button class="small-button" data-action="m-partner-approve" data-id="${esc(b.id)}">확인 승인</button>` : `<button class="small-button" data-action="m-partner-publish" data-id="${esc(b.id)}" data-on="${b.published ? '0':'1'}">${b.published ? '비공개':'회원 공개'}</button>`}</td></tr>`;
    }).join('');
    return `${section('협력사','회사 정보, 협력 확인 자료, 로고·대표 사진과 회원 공개 상태를 관리합니다.','<button class="primary-button" data-action="m-partner-new">협력사 등록</button>')}<div class="admin-card"><div class="table-wrap"><table><thead><tr><th>회사</th><th>분야</th><th>확인</th><th>공개</th><th></th></tr></thead><tbody>${rows || '<tr><td colspan="5">등록된 협력사가 없습니다.</td></tr>'}</tbody></table></div></div>`;
  }

  function partnerForm(b = {}) {
    const ev = (S().adminPartnerEvidence || []).find((x) => String(x.partner_brand_id) === String(b.id));
    return `<div class="modal-backdrop"><div class="modal"><div class="modal-head"><div><h2>${b.id ? '협력사 수정':'협력사 등록'}</h2><p>내부 식별값은 자동으로 생성합니다.</p></div><button class="icon-button" data-action="m-close">${icon('x',18)}</button></div><div class="modal-body"><form id="masterPartnerForm"><input type="hidden" name="id" value="${esc(b.id || '')}"><input type="hidden" name="logo_asset_path" value="${esc(b.logo_asset_path || '')}"><input type="hidden" name="photo_asset_path" value="${esc(b.photo_asset_path || '')}"><input type="hidden" name="verification_evidence_path" value="${esc(ev?.evidence_path || '')}"><div class="form-grid"><div class="field"><label>회사명</label><input name="company_name" required maxlength="120" value="${esc(b.display_name_ko || b.name || '')}"></div><div class="field"><label>법인명</label><input name="legal_name" required maxlength="160" value="${esc(b.legal_name || '')}"></div><div class="field"><label>분야</label><input name="category" required maxlength="80" value="${esc(b.category || '')}"></div><div class="field full"><label>회사 소개</label><textarea name="description" maxlength="1000">${esc(b.description_ko || '')}</textarea></div><div class="field full"><label>협력 확인 자료</label><input type="file" data-evidence accept="image/jpeg,image/png,image/webp,application/pdf"><small>이미지 또는 PDF, 최대 10MB</small></div><div class="field"><label>로고</label><input type="file" data-asset="logo" accept="image/jpeg,image/png,image/webp"></div><div class="field"><label>대표 사진</label><input type="file" data-asset="photo" accept="image/jpeg,image/png,image/webp"></div><div class="field full"><label>운영 메모</label><textarea name="operator_note" maxlength="1000">${esc(ev?.notes || '')}</textarea></div><div class="field full"><label>변경 사유</label><input name="reason" maxlength="240"></div></div><div class="modal-actions"><button type="button" class="secondary-button" data-action="m-close">취소</button><button class="primary-button">저장</button></div></form></div></div></div>`;
  }

  function renderFunding() {
    const allocations = S().adminFundingAllocations || [];
    const rows = (S().adminFundingPools || []).map((p) => {
      const a = allocations.filter((x) => String(x.funding_pool_id) === String(p.id));
      const spent = a.reduce((n,x) => n + Number(x.spent_amount || 0), 0);
      const reserved = a.reduce((n,x) => n + Number(x.reserved_amount || 0), 0);
      return `<tr><td><strong>${esc(brandName(p.partner_brand_id))}</strong></td><td>${money(p.total_budget)}</td><td>${money(p.secured_amount)}</td><td>${money(spent)}</td><td>${money(reserved)}</td><td>${money(Math.max(0, Number(p.secured_amount || 0)-spent-reserved))}</td><td>${p.verification_status === 'verified' ? '확인 완료':'확인 대기'}</td><td><button class="small-button" data-action="m-funding-edit" data-id="${esc(p.id)}">수정</button></td></tr>`;
    }).join('');
    return `${section('지급예산','협력사별 확보 예산과 업무별 배정·사용·예약 금액을 관리합니다. 회원 지갑 정산과는 분리됩니다.','<button class="primary-button" data-action="m-funding-new">지급예산 등록</button>')}<div class="admin-card"><div class="table-wrap"><table><thead><tr><th>협력사</th><th>총 예산</th><th>확보</th><th>사용</th><th>예약</th><th>남음</th><th>확인</th><th></th></tr></thead><tbody>${rows || '<tr><td colspan="8">등록된 지급예산이 없습니다.</td></tr>'}</tbody></table></div></div>`;
  }

  const nodeOptions = (selected='') => nodes().map((n) => `<option value="${esc(n.id)}" ${String(n.id)===String(selected)?'selected':''}>${esc(n.title || n.title_ko || n.public_id || '업무')}</option>`).join('');
  function allocationRow(a = {}) { return `<div class="master-allocation-row"><select data-a="node_id"><option value="">업무 선택</option>${nodeOptions(a.node_id)}</select><input data-a="allocated_amount" type="number" min="0" value="${Number(a.allocated_amount || 0)}" placeholder="배정"><input data-a="spent_amount" type="number" min="0" value="${Number(a.spent_amount || 0)}" placeholder="사용"><input data-a="reserved_amount" type="number" min="0" value="${Number(a.reserved_amount || 0)}" placeholder="예약"><button type="button" class="icon-button" data-action="m-allocation-remove">${icon('x',16)}</button></div>`; }
  function fundingForm(p = {}) {
    const allocations = (S().adminFundingAllocations || []).filter((x) => String(x.funding_pool_id) === String(p.id));
    const brandOptions = brands().map((b) => `<option value="${esc(b.id)}" ${String(b.id)===String(p.partner_brand_id)?'selected':''}>${esc(b.name || b.display_name_ko || b.legal_name)}</option>`).join('');
    return `<div class="modal-backdrop"><div class="modal"><div class="modal-head"><div><h2>${p.id?'지급예산 수정':'지급예산 등록'}</h2><p>확보 상태와 업무별 금액을 함께 기록합니다.</p></div><button class="icon-button" data-action="m-close">${icon('x',18)}</button></div><div class="modal-body"><form id="masterFundingForm"><input type="hidden" name="id" value="${esc(p.id || '')}"><div class="form-grid"><div class="field"><label>협력사</label><select name="partner_brand_id" required><option value="">선택</option>${brandOptions}</select></div><div class="field"><label>확인 상태</label><select name="verification_status"><option value="pending">확인 대기</option><option value="verified" ${p.verification_status==='verified'?'selected':''}>확인 완료</option><option value="rejected" ${p.verification_status==='rejected'?'selected':''}>확인 반려</option></select></div><div class="field"><label>총 업무예산</label><input name="total_budget" type="number" min="0" required value="${Number(p.total_budget || 0)}"></div><div class="field"><label>실제 확보 금액</label><input name="secured_amount" type="number" min="0" required value="${Number(p.secured_amount || 0)}"></div><label class="check-row"><input name="public_visible" type="checkbox" ${p.public_visible?'checked':''}><span>회원에게 확보 상태 공개</span></label><div class="field full"><label>업무별 배정 · 사용 · 예약</label><div id="masterAllocationRows">${(allocations.length?allocations:[{}]).map(allocationRow).join('')}</div><button type="button" class="small-button" data-action="m-allocation-add">업무 추가</button></div><div class="field full"><label>운영 메모</label><textarea name="operator_note">${esc(p.operator_note || '')}</textarea></div><div class="field full"><label>변경 사유</label><input name="reason" maxlength="240"></div></div><div class="modal-actions"><button type="button" class="secondary-button" data-action="m-close">취소</button><button class="primary-button">저장</button></div></form></div></div></div>`;
  }

  function renderWorkCreate() {
    const brandOptions = brands().filter((b) => b.published || b.verified || b.verification_status === 'approved').map((b) => `<option value="${esc(b.id)}">${esc(b.name || b.display_name_ko || b.legal_name)}</option>`).join('');
    return `${section('업무 만들기','협력사 → 업무 종류 → 회원이 실제로 할 일 → 보상·시간·자리 → 미리보기의 5단계로 만듭니다.')}<div class="master-wizard-steps"><span class="active">1 협력사</span><span>2 업무 종류</span><span>3 실제 할 일</span><span>4 보상·시간</span><span>5 미리보기</span></div><div class="admin-card"><form id="masterWorkForm"><div class="form-grid"><div class="field"><label>1. 협력사</label><select name="partner_brand_id" required><option value="">선택</option>${brandOptions}</select></div><div class="field"><label>2. 업무 종류</label><select name="node_family"><option value="inspect">검수</option><option value="catalog">카탈로그</option><option value="document">문서 확인</option><option value="content">콘텐츠 품질</option></select></div><div class="field full"><label>업무 이름</label><input name="title_ko" required maxlength="120"></div><div class="field full"><label>3. 회원이 실제로 할 일</label><textarea name="description_ko" required maxlength="1000"></textarea></div><div class="field full"><label>확인 질문</label><input name="question_prompt_ko" required maxlength="300"></div><div class="field"><label>보기 1</label><input name="choice_a_ko" required></div><div class="field"><label>보기 2</label><input name="choice_b_ko" required></div><div class="field"><label>정답</label><select name="correct_choice"><option value="a">보기 1</option><option value="b">보기 2</option></select></div><div class="field"><label>4. 보증금</label><input name="stake_krw" type="number" min="0" value="0"></div><div class="field"><label>완료 수당</label><input name="stipend_krw" type="number" min="0" value="1000"></div><div class="field"><label>예상 시간(초)</label><input name="estimated_seconds" type="number" min="10" value="60"></div><div class="field"><label>하루 자리</label><input name="daily_cap" type="number" min="1" value="100"></div><div class="field"><label>회원 구간</label><select name="tier_band"><option>소액</option><option>중액</option><option>고액</option><option>초고액</option></select></div><label class="check-row"><input name="requires_assign" type="checkbox"><span>지정 회원만 참여</span></label></div><div class="admin-card" style="margin-top:16px"><h3>5. 회원 화면 미리보기</h3><div id="masterWorkPreview" class="work-preview-card"></div></div><div class="modal-actions"><button name="intent" value="draft" class="secondary-button">초안 저장</button><button name="intent" value="publish" class="primary-button">저장 후 공개 준비</button></div></form></div>`;
  }

  function renderContent(page) {
    const type = page === 'onboarding' ? 'onboarding' : page === 'faq' ? 'faq' : 'notification_template';
    const title = page === 'onboarding' ? '첫 이용 안내' : page === 'faq' ? '자주 묻는 질문' : '회원 알림';
    const rows = (S().adminContentItems || []).filter((x) => x.content_type === type).map((x) => `<tr><td><strong>${esc(x.title_ko)}</strong></td><td>${esc(x.body_ko)}</td><td>${x.enabled?'표시':'숨김'}</td><td><button class="small-button" data-action="m-content-toggle" data-id="${esc(x.id)}" data-on="${x.enabled?'0':'1'}">${x.enabled?'숨기기':'표시'}</button></td></tr>`).join('');
    return `${section(title, page === 'faq' ? '회원 도움말의 질문과 답변을 관리합니다.' : page === 'onboarding' ? '신규 회원의 첫 이용 안내를 관리합니다.' : '회원 알림 문구를 관리하며 실제 발송은 공지 화면에서 수행합니다.')}<div class="admin-card"><form id="masterContentForm"><input type="hidden" name="content_type" value="${type}"><div class="form-grid"><div class="field"><label>${page==='faq'?'질문':'제목'}</label><input name="title_ko" required maxlength="120"></div><div class="field"><label>순서</label><input name="sort_order" type="number" min="0" value="0"></div><div class="field full"><label>${page==='faq'?'답변':'내용'}</label><textarea name="body_ko" required maxlength="2000"></textarea></div><label class="check-row"><input name="enabled" type="checkbox" checked><span>저장 후 표시</span></label><div class="field"><button class="primary-button">저장</button></div></div></form><div class="table-wrap"><table><tbody>${rows || '<tr><td>등록된 내용이 없습니다.</td></tr>'}</tbody></table></div></div>`;
  }

  function renderAudit() {
    const rows = (S().adminAuditLogs || []).map((x) => `<tr><td>${esc(x.created_at ? new Date(x.created_at).toLocaleString('ko-KR') : '-')}</td><td><strong>${esc(x.action || '-')}</strong></td><td>${esc(x.target_type || '-')}</td><td>${esc(x.reason || '-')}</td></tr>`).join('');
    return `${section('변경 기록','민감한 원문을 제외한 운영 변경 요약을 최근 순으로 확인합니다.','<button class="secondary-button" data-action="m-refresh">새로고침</button>')}<div class="admin-card"><div class="table-wrap"><table><thead><tr><th>시각</th><th>변경</th><th>대상</th><th>사유</th></tr></thead><tbody>${rows || '<tr><td colspan="4">변경 기록이 없습니다.</td></tr>'}</tbody></table></div></div>`;
  }

  function renderPreview() {
    const preset = S().adminPreviewPreset || 'new';
    const amount = ({new:0,'50k':50000,'300k':300000,'1m':1000000,assigned:300000,active:1000000,rework:50000})[preset] || 0;
    return `${section('화면 미리보기','대표 회원 상태를 브라우저 안에서만 확인합니다. 실제 지갑과 원장은 변경하지 않습니다.')}<div class="admin-card"><div class="field"><label>회원 상태</label><select id="masterPreviewPreset"><option value="new">신규 회원</option><option value="50k" ${preset==='50k'?'selected':''}>5만원</option><option value="300k" ${preset==='300k'?'selected':''}>30만원</option><option value="1m" ${preset==='1m'?'selected':''}>100만원</option><option value="assigned" ${preset==='assigned'?'selected':''}>배정 업무 회원</option><option value="active" ${preset==='active'?'selected':''}>업무 진행 회원</option><option value="rework" ${preset==='rework'?'selected':''}>재작업 회원</option></select></div><div class="work-preview-card" style="margin-top:16px"><h3>퍼뜩 회원 화면 예시</h3><p>근무 잔액 예시 <strong>${money(amount)}</strong></p><p>업무 상태: ${preset==='active'?'진행 중':preset==='rework'?'재작업 요청':preset==='assigned'?'배정 업무 있음':'대기'}</p><small>이 미리보기는 Production 데이터에 저장하지 않습니다.</small></div></div>`;
  }

  function renderLandingMetrics(baseRender) { const h = baseRender('landing-content'); return typeof h === 'string' ? h.replace('랜딩 현황·후기','랜딩 이용 현황') : h; }
  function renderLandingReviews(baseRender) { const h = baseRender('landing-content'); return typeof h === 'string' ? h.replace('랜딩 현황·후기','랜딩 회원 후기') : h; }

  function readFile(file) { return new Promise((ok, no) => { const r = new FileReader(); r.onload = () => ok(String(r.result || '')); r.onerror = no; r.readAsDataURL(file); }); }
  async function uploadPartnerFiles(form) {
    const evidence = form.querySelector('[data-evidence]')?.files?.[0];
    if (evidence) { const r = await core().adminRequest('upload_partner_evidence',{content_type:evidence.type,base64:await readFile(evidence)}); form.elements.verification_evidence_path.value = r.storage_path || ''; }
    for (const input of form.querySelectorAll('[data-asset]')) { const file = input.files?.[0]; if (!file) continue; const r = await core().adminRequest('upload_public_asset',{kind:`partner-${input.dataset.asset}`,content_type:file.type,base64:await readFile(file)}); form.elements[`${input.dataset.asset}_asset_path`].value = r.path || ''; }
  }
  function updateWorkPreview(form) {
    const box = document.getElementById('masterWorkPreview'); if (!box) return;
    const d = Object.fromEntries(new FormData(form).entries());
    box.innerHTML = `<div class="work-preview-kicker">회원에게 이렇게 보여요</div><h3>${esc(d.title_ko || '업무 이름')}</h3><p>${esc(d.description_ko || '회원이 실제로 할 일이 표시됩니다.')}</p><p>업무 보증금 ${money(d.stake_krw)} · 완료 수당 ${money(d.stipend_krw)}</p><small>예상 ${Number(d.estimated_seconds || 0)}초 · 하루 ${Number(d.daily_cap || 0)}자리</small>`;
  }

  function install() {
    const ext = window.PUTDUK_ADMIN;
    if (!ext || ext.__master21Installed) return false;
    ext.__master21Installed = true;
    const baseRender = ext.renderPage.bind(ext), baseAfter = ext.afterRender.bind(ext), baseRefresh = ext.refreshPage.bind(ext), baseClick = ext.handleClick.bind(ext);

    ext.renderPage = (page) => {
      if (page === 'partners') return renderPartners();
      if (page === 'funding') return renderFunding();
      if (page === 'work-create') return renderWorkCreate();
      if (page === 'published-work') return String(baseRender('nodes') || '').replace(/업무 관리/g,'공개 업무').replace(/업무 카드/g,'업무');
      if (page === 'assignments') return `${section('회원 업무 배정','회원 상세 화면에서 업무를 안전하게 배정하고 하루 한도를 확인합니다.')}${baseRender('members') || ''}`;
      if (page === 'grants') return `${section('가입 지원금','가입 지원금 캠페인의 금액·범위·상태를 관리합니다.')}${baseRender('settings') || ''}`;
      if (page === 'member-tiers') return `${section('회원 등급','등급별 하루 업무 한도와 회원별 예외를 관리합니다.')}${baseRender('settings') || ''}`;
      if (['onboarding','faq','member-alerts'].includes(page)) return renderContent(page);
      if (page === 'live-status') return `${section('실시간 현황 표시','현재 합성 표시를 보호합니다.')}<div class="notice">Stage 5에서는 기존 실시간 표시 저장값을 변경하지 않습니다. Stage 9에서 실제값 기반으로 전환합니다.</div>`;
      if (page === 'notices') return baseRender('notifications');
      if (page === 'identity') { patch({adminFinanceTab:'kyc'}); return baseRender('finance'); }
      if (page === 'audit') return renderAudit();
      if (page === 'preview') return renderPreview();
      if (page === 'landing-metrics') return renderLandingMetrics(baseRender);
      if (page === 'landing-reviews') return renderLandingReviews(baseRender);
      return baseRender(page);
    };
    ext.afterRender = () => { baseAfter(); replaceSidebar(); const f = document.getElementById('masterWorkForm'); if (f) updateWorkPreview(f); };
    ext.refreshPage = async () => { await baseRefresh(); if (['partners','funding','onboarding','faq','member-alerts','audit'].includes(S().adminPage)) await loadMaster(true); };
    ext.handleClick = (event, target) => {
      const a = target?.dataset?.action;
      if (a === 'm-refresh') { loadMaster(); return true; }
      if (a === 'm-close') { closeModal(); return true; }
      if (a === 'm-partner-new') { modal(partnerForm()); return true; }
      if (a === 'm-partner-edit') { modal(partnerForm(brands().find((x)=>String(x.id)===String(target.dataset.id)) || {})); return true; }
      if (a === 'm-partner-approve') { core().adminRequest('approve_brand',{brand_id:target.dataset.id}).then(async()=>{await core().loadAdminCatalog?.({silent:true});toast('협력 확인을 승인했습니다.');core().render();}).catch((e)=>toast(friendly(e),'error')); return true; }
      if (a === 'm-partner-publish') { core().adminRequest(target.dataset.on==='1'?'publish_brand':'unpublish_brand',{brand_id:target.dataset.id}).then(async()=>{await core().loadAdminCatalog?.({silent:true});core().render();}).catch((e)=>toast(friendly(e),'error')); return true; }
      if (a === 'm-funding-new') { modal(fundingForm()); return true; }
      if (a === 'm-funding-edit') { modal(fundingForm((S().adminFundingPools||[]).find((x)=>String(x.id)===String(target.dataset.id)) || {})); return true; }
      if (a === 'm-allocation-add') { document.getElementById('masterAllocationRows')?.insertAdjacentHTML('beforeend', allocationRow()); return true; }
      if (a === 'm-allocation-remove') { target.closest('.master-allocation-row')?.remove(); return true; }
      if (a === 'm-content-toggle') { core().adminRequest('set_admin_content_enabled',{id:target.dataset.id,enabled:target.dataset.on==='1'}).then(()=>loadMaster()).catch((e)=>toast(friendly(e),'error')); return true; }
      return baseClick(event, target);
    };

    document.addEventListener('input', (e) => { const f = e.target?.closest?.('#masterWorkForm'); if (f) updateWorkPreview(f); });
    document.addEventListener('change', (e) => { if (e.target?.id === 'masterPreviewPreset') { patch({adminPreviewPreset:e.target.value}); core().render(); } });
    document.addEventListener('submit', async (e) => {
      const f = e.target;
      if (f?.id === 'masterPartnerForm') { e.preventDefault(); e.stopImmediatePropagation(); try { await uploadPartnerFiles(f); await core().adminRequest('save_partner',Object.fromEntries(new FormData(f).entries())); closeModal(); await Promise.all([core().loadAdminCatalog?.({silent:true}),loadMaster(true)]); toast('협력사 정보를 저장했습니다.'); core().render(); } catch(err){toast(friendly(err),'error');} }
      if (f?.id === 'masterFundingForm') { e.preventDefault(); e.stopImmediatePropagation(); const p=Object.fromEntries(new FormData(f).entries()); p.total_budget=Number(p.total_budget||0); p.secured_amount=Number(p.secured_amount||0); p.public_visible=f.elements.public_visible.checked; p.allocations=[...f.querySelectorAll('.master-allocation-row')].map((r)=>({node_id:r.querySelector('[data-a="node_id"]')?.value||'',allocated_amount:Number(r.querySelector('[data-a="allocated_amount"]')?.value||0),spent_amount:Number(r.querySelector('[data-a="spent_amount"]')?.value||0),reserved_amount:Number(r.querySelector('[data-a="reserved_amount"]')?.value||0)})).filter((x)=>x.node_id); try{await core().adminRequest('save_funding',p);closeModal();toast('지급예산을 저장했습니다.');await loadMaster();}catch(err){toast(friendly(err),'error');} }
      if (f?.id === 'masterContentForm') { e.preventDefault(); e.stopImmediatePropagation(); const p=Object.fromEntries(new FormData(f).entries()); p.enabled=f.elements.enabled.checked;p.sort_order=Number(p.sort_order||0);try{await core().adminRequest('save_admin_content',p);f.reset();toast('운영 내용을 저장했습니다.');await loadMaster();}catch(err){toast(friendly(err),'error');} }
      if (f?.id === 'masterWorkForm') { e.preventDefault(); e.stopImmediatePropagation(); const p=Object.fromEntries(new FormData(f).entries()); const intent=e.submitter?.value||'draft'; p.estimated_seconds=Number(p.estimated_seconds);p.stake_krw=Number(p.stake_krw);p.stipend_krw=Number(p.stipend_krw);p.daily_cap=Number(p.daily_cap);p.daily_capacity=p.daily_cap;p.reward_min=p.stipend_krw;p.reward_max=p.stipend_krw;p.requires_assign=f.elements.requires_assign.checked;p.partner_slug='';p.question_image_path='';try{const r=await core().adminRequest('create_node',p);if(intent==='publish'&&r.node?.id)await core().adminRequest('publish_node',{node_id:r.node.id,reason:'업무 만들기에서 공개 준비'});await core().loadAdminCatalog?.({silent:true});patch({adminPage:'published-work'});toast('업무를 저장했습니다.');core().render();}catch(err){toast(friendly(err),'error');} }
    }, true);

    loadMaster(true).then(() => core()?.render?.()).catch(() => {});
    return true;
  }

  if (!install()) { const t=setInterval(()=>{if(install())clearInterval(t);},50); setTimeout(()=>clearInterval(t),10000); }
})();
