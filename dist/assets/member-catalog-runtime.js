(() => {
  'use strict';

  if (document.documentElement.dataset.mode !== 'member') return;

  const config = window.PUTDUK_CONFIG || {};
  const app = document.getElementById('app');
  const endpoint = config.memberExperienceUrl || (config.supabaseUrl ? `${config.supabaseUrl}/functions/v1/member-experience` : '');
  if (!app || !endpoint || !window.supabase || !config.supabaseUrl || !config.supabasePublishableKey) return;

  const runtime = window.PUTDUK_MEMBER_RUNTIME;
  const client = runtime?.getClient();
  if (!runtime || !client) return;

  const PAGE_SIZE = 12;
  const ACTIVE_STATUSES = ['in_progress', 'checkpointed'];
  const FILTER_HINTS = {
    all: '현재 조건에서 볼 수 있는 업무를 업무잔액에 맞는 순서로 보여드려요.',
    '빠른 확인': '짧게 확인하고 제출하는 업무만 보여드려요.',
    '일반 처리': '일반 난이도의 업무만 보여드려요.',
    '집중 처리': '조금 더 집중이 필요한 업무만 보여드려요.',
    '전문 검수': '정밀 확인이 필요한 업무만 보여드려요.'
  };

  const state = {
    session: null,
    snapshot: null,
    filter: 'all',
    visibleCount: PAGE_SIZE,
    loadingSnapshot: false,
    applyingCatalog: false,
    catalogFrame: 0,
    contractRunId: null,
    contractLoading: false,
    genericOverlay: null,
    legacyBackdrop: null
  };

  const esc = (value) => String(value ?? '').replace(/[&<>"']/g, (char) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#039;'
  }[char]));
  const won = (value) => `${Math.max(0, Math.round(Number(value || 0))).toLocaleString('ko-KR')}원`;

  function duration(seconds) {
    const total = Math.max(1, Math.round(Number(seconds || 0)));
    if (total < 60) return `${total}초`;
    const minutes = Math.floor(total / 60);
    const rest = total % 60;
    return rest ? `${minutes}분 ${rest}초` : `${minutes}분`;
  }

  async function api(action, payload = {}) {
    const session = state.session || (await client.auth.getSession()).data.session;
    if (!session?.access_token) throw new Error('로그인이 필요합니다.');
    const response = await fetch(endpoint, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${session.access_token}`,
        'apikey': config.supabasePublishableKey
      },
      body: JSON.stringify({ action, ...payload })
    });
    let data = {};
    try { data = await response.json(); } catch (_) {}
    if (!response.ok) throw new Error(String(data.error || '요청을 처리하지 못했습니다.'));
    if (data.ok === false && action !== 'submit_work') throw new Error(String(data.error || '요청을 처리하지 못했습니다.'));
    return data;
  }

  function balanceFitComparator(a, b) {
    const balance = Number(state.snapshot?.work_balance || 0);
    const trialA = a.is_trial === true && state.snapshot?.trial_consumed !== true;
    const trialB = b.is_trial === true && state.snapshot?.trial_consumed !== true;
    if (trialA !== trialB) return trialA ? -1 : 1;
    if (a.assigned !== b.assigned) return a.assigned ? -1 : 1;
    const affordA = a.is_trial ? Number(state.snapshot?.support_balance || 0) > 0 : Number(a.stake || 0) <= balance;
    const affordB = b.is_trial ? Number(state.snapshot?.support_balance || 0) > 0 : Number(b.stake || 0) <= balance;
    if (affordA !== affordB) return affordA ? -1 : 1;
    const stakeA = Number(a.stake || 0);
    const stakeB = Number(b.stake || 0);
    if (affordA && stakeA !== stakeB) return stakeB - stakeA;
    if (!affordA && stakeA !== stakeB) return stakeA - stakeB;
    return String(a.title || '').localeCompare(String(b.title || ''), 'ko');
  }

  function filteredNodes() {
    const rows = (state.snapshot?.nodes || [])
      .filter((item) => item.visible !== false)
      .slice()
      .sort(balanceFitComparator);
    return state.filter === 'all' ? rows : rows.filter((item) => String(item.difficulty || '') === state.filter);
  }

  function proofHtml(item) {
    const budget = item.budget_verified
      ? `<span class="s7-proof is-ok">✓ 지급예산 확인 · ${won(item.budget_remaining)} 남음</span>`
      : `<span class="s7-proof">지급예산 확인 중</span>`;
    const seats = `<span class="s7-proof">오늘 남은 자리 ${Math.max(0, Number(item.remaining_slots || 0)).toLocaleString('ko-KR')}개</span>`;
    const done = `<span class="s7-proof">오늘 승인 ${Math.max(0, Number(item.completed_today || 0)).toLocaleString('ko-KR')}건</span>`;
    return `<div class="s7-proof-row">${budget}${seats}${done}</div>`;
  }

  function buildCard(item) {
    const blocked = state.snapshot?.blocking_run === true;
    const ready = item.can_start === true && !blocked;
    const action = ready
      ? `data-start-node="${esc(item.id)}"`
      : `data-p4-balance-guide="${esc(item.id)}"`;
    const cta = blocked ? '진행 중 업무 확인' : ready ? '업무 시작' : '필요한 업무잔액 보기';
    const trialLabel = item.is_trial ? '지원금 잠금' : '업무 보증금';
    return `<article class="node-card compact-node s7-node-card" data-stage7-node="${esc(item.id)}" data-level="${esc(item.difficulty || '일반 처리')}">
      <div class="node-accent"></div>
      <div class="node-company">${esc(item.company_name || '협력사')}</div>
      <div class="node-title">${esc(item.title || '업무')}</div>
      <div class="node-money">
        <div class="money-line"><span>${esc(trialLabel)} ${won(item.stake)}</span></div>
        <div class="money-line"><span>완료 수당 ${won(item.stipend)}</span></div>
      </div>
      ${proofHtml(item)}
      <div class="node-bottom">
        <div class="node-meta"><span>예상 ${esc(duration(item.estimated_seconds))}</span><span>오늘 남은 자리 ${Math.max(0, Number(item.remaining_slots || 0)).toLocaleString('ko-KR')}개</span></div>
        <button class="small-button ${ready ? 'primary' : ''}" type="button" ${action}>${esc(cta)}</button>
      </div>
    </article>`;
  }

  function pagerHtml(total, shown) {
    if (!total) return '';
    const more = shown < total;
    return `<div class="s7-catalog-pager" id="stage7CatalogPager">
      <span>${shown.toLocaleString('ko-KR')} / ${total.toLocaleString('ko-KR')}개 업무 표시</span>
      ${more ? `<button type="button" class="secondary-button" data-stage7-load-more>업무 더 보기 +${Math.min(PAGE_SIZE, total - shown)}</button>` : ''}
    </div>`;
  }

  function renderCatalog() {
    if (state.applyingCatalog || !state.snapshot) return;
    const legacyGrid = app.querySelector('#nodeGrid');
    const grid = legacyGrid || app.querySelector('#stage7NodeGrid');
    if (!grid) return;

    state.applyingCatalog = true;
    try {
      if (grid.id === 'nodeGrid') grid.id = 'stage7NodeGrid';
      grid.dataset.stage7Catalog = '1';
      const rows = filteredNodes();
      const shownRows = rows.slice(0, state.visibleCount);
      const signature = `${state.filter}:${state.visibleCount}:${shownRows.map((row) => row.id).join(',')}`;
      if (grid.dataset.stage7Signature !== signature) {
        grid.dataset.stage7Signature = signature;
        grid.innerHTML = shownRows.map(buildCard).join('') || `<div class="empty-state compact" style="grid-column:1/-1"><strong>조건에 맞는 업무가 없습니다.</strong><p>다른 분류를 선택해 주세요.</p></div>`;
      }
      document.getElementById('stage7CatalogPager')?.remove();
      grid.insertAdjacentHTML('afterend', pagerHtml(rows.length, shownRows.length));
      app.querySelectorAll('[data-filter]').forEach((button) => {
        button.classList.toggle('active', String(button.dataset.filter || 'all') === state.filter);
      });
      const hint = document.getElementById('nodeFilterHint');
      if (hint) hint.textContent = FILTER_HINTS[state.filter] || FILTER_HINTS.all;
    } finally {
      state.applyingCatalog = false;
    }
  }

  function scheduleCatalog() {
    if (state.catalogFrame) return;
    state.catalogFrame = requestAnimationFrame(() => {
      state.catalogFrame = 0;
      renderCatalog();
      void maybeOpenGenericPlayer();
    });
  }

  async function loadSnapshot() {
    if (state.loadingSnapshot || !state.session) return;
    state.loadingSnapshot = true;
    try {
      const data = await api('member_experience');
      state.snapshot = data;
      renderCatalog();
    } catch (_) {
      // The Stage 6 surface remains as the safe fallback when this read fails.
    } finally {
      state.loadingSnapshot = false;
    }
  }

  function draftKey(runId) {
    return `putduk-generic-draft:${runId}`;
  }

  function readDraft(runId) {
    try {
      const raw = localStorage.getItem(draftKey(runId));
      const value = raw ? JSON.parse(raw) : {};
      return value && typeof value === 'object' ? value : {};
    } catch (_) {
      return {};
    }
  }

  function saveDraft(runId, answers) {
    try { localStorage.setItem(draftKey(runId), JSON.stringify(answers || {})); } catch (_) {}
  }

  function clearDraft(runId) {
    try { localStorage.removeItem(draftKey(runId)); } catch (_) {}
  }

  const PAYLOAD_LABELS = {
    case_title: '업무 사례', sample: '확인 자료', rule: '확인 기준', instruction: '할 일',
    left_label: '기준 자료 이름', left: '기준 자료', right_label: '확인 자료 이름', right: '확인 자료',
    required_fields: '필수 항목', present_fields: '현재 항목', observed: '확인 내용', case_text: '확인 내용',
    categories: '선택 기준', sequence: '순서', raw: '원본', record_a: '자료 A', record_b: '자료 B',
    source: '원본', target: '대상', planned: '예정 수량', actual: '실제 수량', formula: '계산식',
    opening: '기초 수량', inbound: '입고', outbound: '출고', list_price: '정가', sale_price: '판매가',
    coupon: '쿠폰', bundle_total: '묶음 총액', quantity: '수량', base: '기준값', adjustment: '조정값',
    shipping: '배송', source_value: '기준값', source_unit: '기준 단위', target_unit: '변환 단위',
    factor: '환산값', rounding: '반올림 기준', value: '확인값', min: '최솟값', max: '최댓값',
    required_evidence: '필요 증빙', observed_evidence: '확인된 증빙', candidates: '후보',
    text: '확인 문구', blocked_terms: '제한 문구', translation: '번역', foreign_amount: '외화 금액',
    currency: '통화', krw_rate: '기준 환율'
  };

  function payloadValue(value) {
    if (Array.isArray(value)) return value.map((item) => payloadValue(item)).join(' · ');
    if (value && typeof value === 'object') {
      return Object.entries(value).map(([key, item]) => `${PAYLOAD_LABELS[key] || key}: ${payloadValue(item)}`).join(' / ');
    }
    if (typeof value === 'boolean') return value ? '예' : '아니요';
    return String(value ?? '');
  }

  function safePayloadRows(payload) {
    if (!payload || typeof payload !== 'object' || Array.isArray(payload)) return '';
    const entries = Object.entries(payload)
      .filter(([key, value]) => !key.startsWith('_') && value != null)
      .slice(0, 12);
    if (!entries.length) return '';
    return `<dl class="s7-source-data">${entries.map(([key, value]) => `<div><dt>${esc(PAYLOAD_LABELS[key] || '확인 자료')}</dt><dd>${esc(payloadValue(value))}</dd></div>`).join('')}</dl>`;
  }

  function componentByKey(contract, key) {
    return (contract.definition?.components || []).find((item) => String(item.key) === String(key)) || null;
  }

  function stepByKey(contract, key) {
    return (contract.definition?.workflow?.steps || []).find((item) => String(item.key) === String(key)) || null;
  }

  function componentInput(item, component, value) {
    const itemKey = String(item.item_key);
    const key = String(component.key);
    const name = `s7:${itemKey}:${key}`;
    const label = esc(component.label_ko || '입력');
    const required = component.required === false ? '' : 'required';
    const type = String(component.type || 'text');

    if (type === 'choice') {
      const options = Array.isArray(component.options) ? component.options : [];
      return `<fieldset class="s7-component" data-s7-field="${esc(itemKey)}:${esc(key)}"><legend>${label}</legend><div class="s7-choice-list">${options.map((option) => {
        const optionValue = String(option.value ?? '');
        const checked = String(value ?? '') === optionValue ? 'checked' : '';
        return `<label><input type="radio" name="${esc(name)}" value="${esc(optionValue)}" ${required} ${checked}><span>${esc(option.label_ko || optionValue)}</span></label>`;
      }).join('')}</div></fieldset>`;
    }

    if (type === 'boolean') {
      const normalized = value === true || value === 'true' ? 'true' : value === false || value === 'false' ? 'false' : '';
      return `<fieldset class="s7-component" data-s7-field="${esc(itemKey)}:${esc(key)}"><legend>${label}</legend><div class="s7-choice-list">
        <label><input type="radio" name="${esc(name)}" value="true" ${required} ${normalized === 'true' ? 'checked' : ''}><span>예</span></label>
        <label><input type="radio" name="${esc(name)}" value="false" ${required} ${normalized === 'false' ? 'checked' : ''}><span>아니요</span></label>
      </div></fieldset>`;
    }

    const inputMode = type === 'digits' || type === 'integer' ? 'numeric' : 'text';
    const htmlType = type === 'integer' ? 'number' : 'text';
    const min = component.min != null ? `min="${esc(component.min)}"` : '';
    const max = component.max != null ? `max="${esc(component.max)}"` : '';
    const maxLength = component.max_length != null && htmlType === 'text' ? `maxlength="${esc(component.max_length)}"` : '';
    return `<label class="s7-component" data-s7-field="${esc(itemKey)}:${esc(key)}"><span>${label}</span><input type="${htmlType}" inputmode="${inputMode}" name="${esc(name)}" value="${esc(value ?? '')}" ${required} ${min} ${max} ${maxLength}></label>`;
  }

  function renderGenericOverlay(contract, legacyBackdrop) {
    closeGenericOverlay(false);
    const runId = String(contract.task_run_id || '');
    const draft = readDraft(runId);
    const items = Array.isArray(contract.items) ? contract.items : [];
    const body = items.map((item, index) => {
      const step = stepByKey(contract, item.step_key);
      const keys = Array.isArray(step?.component_keys) ? step.component_keys : [];
      return `<section class="s7-work-item" data-s7-item="${esc(item.item_key)}">
        <div class="s7-item-head"><span>${index + 1}</span><strong>${esc(step?.title_ko || contract.definition?.title_ko || '업무 확인')}</strong></div>
        ${safePayloadRows(item.payload)}
        <div class="s7-components">${keys.map((key) => {
          const component = componentByKey(contract, key);
          if (!component) return '';
          return componentInput(item, component, draft?.[item.item_key]?.[component.key]);
        }).join('')}</div>
      </section>`;
    }).join('');

    const overlay = document.createElement('div');
    overlay.id = 'stage7GenericWork';
    overlay.className = 'modal-backdrop s7-generic-backdrop';
    overlay.innerHTML = `<div class="s7-generic-sheet">
      <header class="s7-generic-head">
        <div><p class="eyebrow">퍼뜩 업무</p><h2>${esc(contract.definition?.title_ko || '업무 진행')}</h2><p>${esc(contract.definition?.purpose_ko || '화면의 내용을 확인하고 입력해 주세요.')}</p></div>
        <button type="button" class="icon-button" data-stage7-close-work aria-label="업무 화면 닫기">×</button>
      </header>
      <form id="stage7GenericForm" novalidate>
        <div class="s7-generic-items">${body}</div>
        <div class="s7-generic-status" id="stage7GenericStatus" role="status" aria-live="polite"></div>
        <footer class="s7-generic-actions"><button type="button" class="secondary-button" data-stage7-save-draft>입력 저장</button><button type="submit" class="primary-button">제출하기</button></footer>
      </form>
    </div>`;

    document.body.appendChild(overlay);
    state.genericOverlay = overlay;
    state.legacyBackdrop = legacyBackdrop;
    if (legacyBackdrop) {
      legacyBackdrop.dataset.stage7GenericHidden = '1';
      legacyBackdrop.style.visibility = 'hidden';
      legacyBackdrop.style.pointerEvents = 'none';
    }

    overlay.querySelector('form')?.addEventListener('input', () => saveCurrentDraft(contract));
    overlay.querySelector('form')?.addEventListener('change', () => saveCurrentDraft(contract));
    overlay.querySelector('form')?.addEventListener('submit', (event) => {
      event.preventDefault();
      void submitGeneric(contract);
    });
  }

  function collectAnswers(contract) {
    const form = document.getElementById('stage7GenericForm');
    const answers = {};
    if (!form) return answers;
    for (const item of contract.items || []) {
      const step = stepByKey(contract, item.step_key);
      answers[item.item_key] = {};
      for (const key of step?.component_keys || []) {
        const component = componentByKey(contract, key);
        if (!component) continue;
        const selector = `[name="s7:${CSS.escape(String(item.item_key))}:${CSS.escape(String(component.key))}"]`;
        const fields = [...form.querySelectorAll(selector)];
        if (!fields.length) continue;
        let value;
        if (fields[0].type === 'radio') value = fields.find((field) => field.checked)?.value;
        else value = fields[0].value;
        if (component.type === 'boolean' && value != null) value = value === 'true';
        answers[item.item_key][component.key] = value ?? null;
      }
    }
    return answers;
  }

  function saveCurrentDraft(contract) {
    saveDraft(String(contract.task_run_id || ''), collectAnswers(contract));
  }

  function markValidationErrors(errors) {
    document.querySelectorAll('[data-s7-field].is-error').forEach((field) => field.classList.remove('is-error'));
    for (const error of Array.isArray(errors) ? errors : []) {
      const itemKey = String(error.item_key || '');
      const componentKey = String(error.component_key || '');
      if (!itemKey || !componentKey) continue;
      const field = document.querySelector(`[data-s7-field="${CSS.escape(itemKey)}:${CSS.escape(componentKey)}"]`);
      field?.classList.add('is-error');
    }
  }

  async function submitGeneric(contract) {
    const form = document.getElementById('stage7GenericForm');
    const status = document.getElementById('stage7GenericStatus');
    if (!form || !form.reportValidity()) return;
    const submit = form.querySelector('button[type="submit"]');
    if (submit) submit.disabled = true;
    if (status) status.textContent = '제출 내용을 확인하고 있어요…';
    const answers = collectAnswers(contract);
    saveDraft(String(contract.task_run_id || ''), answers);
    const submission = {
      contract: 'putduk.work_submission/1.0',
      schema_version: contract.schema_version,
      template_key: contract.template_key,
      template_version: contract.template_version,
      task_run_id: contract.task_run_id,
      answers,
      evidence: {}
    };
    try {
      const data = await api('submit_work', { task_run_id: contract.task_run_id, submission });
      if (data.ok === false) {
        markValidationErrors(data.errors);
        if (status) status.textContent = '입력 내용을 다시 확인해 주세요. 표시된 항목을 수정하면 됩니다.';
        return;
      }
      clearDraft(String(contract.task_run_id || ''));
      if (status) status.textContent = '제출이 완료됐어요. 검수 상태를 불러옵니다.';
      window.setTimeout(() => window.location.reload(), 180);
    } catch (error) {
      if (status) status.textContent = String(error?.message || '제출하지 못했습니다. 다시 시도해 주세요.');
    } finally {
      if (submit) submit.disabled = false;
    }
  }

  function closeGenericOverlay(restoreLegacy = true) {
    state.genericOverlay?.remove();
    state.genericOverlay = null;
    if (state.legacyBackdrop) {
      if (restoreLegacy) {
        state.legacyBackdrop.style.visibility = '';
        state.legacyBackdrop.style.pointerEvents = '';
        delete state.legacyBackdrop.dataset.stage7GenericHidden;
      }
      state.legacyBackdrop = null;
    }
  }

  async function currentActiveRun() {
    if (!state.session?.user?.id) return null;
    const result = await client
      .from('task_runs')
      .select('id,node_id,status,updated_at')
      .eq('user_id', state.session.user.id)
      .in('status', ACTIVE_STATUSES)
      .order('updated_at', { ascending: false })
      .limit(1)
      .maybeSingle();
    if (result.error) return null;
    return result.data || null;
  }

  async function maybeOpenGenericPlayer() {
    if (state.contractLoading || state.genericOverlay || !state.session) return;
    const legacyBackdrop = app.querySelector('.player-backdrop:not([data-stage7-generic-hidden])');
    if (!legacyBackdrop) return;
    state.contractLoading = true;
    try {
      const run = await currentActiveRun();
      if (!run?.id) return;
      if (String(run.id) === state.contractRunId && legacyBackdrop.dataset.stage7GenericChecked === '1') return;
      const data = await api('work_contract', { task_run_id: run.id });
      const contract = data.contract_data || data.contract;
      legacyBackdrop.dataset.stage7GenericChecked = '1';
      state.contractRunId = String(run.id);
      if (!contract || contract.available !== true) return;
      renderGenericOverlay(contract, legacyBackdrop);
    } catch (_) {
      // Existing legacy player stays visible when generic contract loading fails.
    } finally {
      state.contractLoading = false;
    }
  }

  document.addEventListener('click', (event) => {
    const filter = event.target.closest('[data-filter]');
    if (filter && (app.querySelector('#nodeGrid') || app.querySelector('#stage7NodeGrid'))) {
      event.preventDefault();
      event.stopImmediatePropagation();
      state.filter = String(filter.dataset.filter || 'all');
      state.visibleCount = PAGE_SIZE;
      renderCatalog();
      return;
    }
    const more = event.target.closest('[data-stage7-load-more]');
    if (more) {
      state.visibleCount += PAGE_SIZE;
      renderCatalog();
      return;
    }
    if (event.target.closest('[data-stage7-save-draft]')) {
      const runId = state.contractRunId;
      if (runId && state.genericOverlay) {
        const form = document.getElementById('stage7GenericForm');
        form?.dispatchEvent(new Event('input', { bubbles: false }));
        const status = document.getElementById('stage7GenericStatus');
        if (status) status.textContent = '입력 내용을 이 기기에 저장했어요.';
      }
      return;
    }
    if (event.target.closest('[data-stage7-close-work]')) {
      closeGenericOverlay(true);
    }
  }, true);

  runtime.observeMutations(() => {
    if (state.applyingCatalog) return;
    scheduleCatalog();
  });

  runtime.onAuthStateChange((_event, session) => {
    state.session = session;
    if (!session) {
      state.snapshot = null;
      closeGenericOverlay(false);
      return;
    }
    void loadSnapshot();
    scheduleCatalog();
  });

  void client.auth.getSession().then(({ data }) => {
    state.session = data.session || null;
    if (state.session) {
      void loadSnapshot();
      scheduleCatalog();
    }
  });
})();
