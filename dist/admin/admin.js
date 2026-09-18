(() => {
  'use strict';
  if (document.documentElement.dataset.mode !== 'admin') return;

  const MOTION_KEY = 'putduk-admin-motion-v1';
  const MEMBER_NOTE = '✅ 일이 끝나면 원금과 수당이 잔액에 같이 반영돼요';

  function core() {
    return window.PUTDUK_ADMIN_CORE || null;
  }

  function money(value) {
    if (value == null || value === '') return '확인 필요';
    const amount = Number(value);
    if (!Number.isFinite(amount)) return '확인 필요';
    return `${Math.round(amount).toLocaleString('ko-KR')}원`;
  }

  function maskEmail(value) {
    const email = String(value || '').trim();
    if (!email) return '-';
    if (email.includes('*')) return email;
    const at = email.indexOf('@');
    if (at < 1) return '***';
    return `${email.slice(0, Math.min(2, at))}***@${email.slice(at + 1)}`;
  }

  function maskPhone(value) {
    const raw = String(value || '').trim();
    if (!raw) return '-';
    if (raw.includes('*')) return raw;
    const digits = raw.replace(/\D/g, '');
    if (!digits) return '-';
    const local = digits.startsWith('82') ? `0${digits.slice(2)}` : digits;
    if (local.length === 11) return `${local.slice(0, 3)}-****-${local.slice(-4)}`;
    return '****';
  }

  function maskIp(value) {
    const ip = String(value || '').trim();
    if (!ip || ip === '-') return '-';
    if (ip.includes('*')) return ip;
    if (ip.includes(':')) {
      const parts = ip.split(':').filter(Boolean);
      if (parts.length < 2) return '****';
      return `${parts[0]}:****:****`;
    }
    const parts = ip.split('.');
    if (parts.length !== 4) return '****';
    return `${parts[0]}.***.***.${parts[3]}`;
  }

  function maskPersonName(value) {
    const raw = String(value || '').trim();
    if (!raw) return '-';
    if (raw.includes('*')) return raw;
    const chars = [...raw];
    if (chars.length === 1) return '*';
    if (chars.length === 2) return `${chars[0]}*`;
    return `${chars[0]}${'*'.repeat(chars.length - 2)}${chars[chars.length - 1]}`;
  }

  function esc(value) {
    if (core()?.esc) return core().esc(value);
    return String(value ?? '').replace(/[&<>"']/g, (char) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#039;' }[char]));
  }

  function icon(name, size) {
    return core()?.icon ? core().icon(name, size) : '';
  }

  function mobileCards(html) {
    return html ? `<div class="admin-mobile-cards">${html}</div>` : '';
  }

  function parseWorkSpec(node) {
    const empty = { stake: 0, stipend: 0, photos: [], choices: [], answer: 1, slots: 0, tier_band: '소액', partner_slug: '', requires_assign: false, question_prompt_ko: '' };
    if (!node) return empty;
    let fromJson = null;
    if (node.work_spec && typeof node.work_spec === 'object') fromJson = node.work_spec;
    const raw = String(node.completion_effect || '').trim();
    if (!fromJson && raw.startsWith('{')) {
      try {
        const parsed = JSON.parse(raw);
        if (parsed && typeof parsed === 'object') fromJson = parsed;
      } catch (_) {}
    }
    const choice = String(node.correct_choice || '').toLowerCase();
    const answer = choice === 'b' ? 2 : choice === 'a' ? 1 : Number(fromJson?.answer || 1);
    const choiceA = String(node.choice_a_ko || fromJson?.choices?.[0] || '').trim();
    const choiceB = String(node.choice_b_ko || fromJson?.choices?.[1] || '').trim();
    const photo = String(node.question_image_path || fromJson?.photos?.[0] || '').trim();
    const band = String(node.tier_band || '소액');
    return {
      stake: Number(node.stake_krw ?? fromJson?.stake ?? 0),
      stipend: Number(node.stipend_krw ?? fromJson?.stipend ?? node.reward_max ?? node.rewardMax ?? 0),
      photos: photo ? [photo] : (Array.isArray(fromJson?.photos) ? fromJson.photos : []),
      choices: (choiceA || choiceB) ? [choiceA, choiceB] : (Array.isArray(fromJson?.choices) ? fromJson.choices : []),
      answer,
      slots: Number(node.daily_cap ?? fromJson?.slots ?? node.daily_capacity ?? node.available ?? 0),
      tier_band: band,
      partner_slug: String(node.partner_slug || ''),
      requires_assign: node.requires_assign === true || band === '초고액',
      question_prompt_ko: String(node.question_prompt_ko || '')
    };
  }

  function previewHtml(spec, title) {
    const photos = (spec.photos || []).filter(Boolean).map((src) => `<img src="${esc(src)}" alt="문제 사진" />`).join('');
    const choices = (spec.choices || []).filter(Boolean);
    const choiceLine = choices.length === 2
      ? `<div class="admin-hint" style="margin:0">보기 1. ${esc(choices[0])}<br>보기 2. ${esc(choices[1])}<br>정답: 보기 ${Number(spec.answer || 1)}</div>`
      : '';
    return `<article class="work-preview-card" id="workCardPreview">
      <div class="work-preview-kicker">회원 화면에 이렇게 보여요${title ? ` · ${esc(title)}` : ''}</div>
      <div class="work-preview-stake">${icon('lock', 18)} 근무 보증 ${money(spec.stake)}</div>
      <div class="work-preview-stipend">${icon('coins', 16)} 끝나면 수당 ${money(spec.stipend)}</div>
      <p class="work-preview-note settle-note"><span>${MEMBER_NOTE}</span></p>
      ${photos ? `<div class="work-preview-quiz">${photos}</div>` : ''}
      ${choiceLine}
    </article>`;
  }

  function readFormSpec(form) {
    if (!form) return { stake: 0, stipend: 0, photos: [], choices: [], answer: 1, slots: 0 };
    const value = (name) => form.querySelector(`[name="${name}"]`)?.value || '';
    const choice = String(value('correct_choice') || '').toLowerCase();
    return {
      stake: Number(value('stake_krw') || value('stake') || 0),
      stipend: Number(value('stipend_krw') || value('stipend') || 0),
      photos: [value('question_image_path') || value('photo_1')].filter(Boolean),
      choices: [value('choice_a_ko') || value('choice_1'), value('choice_b_ko') || value('choice_2')].filter(Boolean),
      answer: choice === 'b' ? 2 : choice === 'a' ? 1 : Number(value('answer') || 1),
      slots: Number(value('daily_cap') || value('slots') || 0)
    };
  }

  function bindPreview() {
    const form = document.getElementById('nodeForm');
    const box = document.getElementById('workCardPreviewHost');
    if (!form || !box) return;
    const refresh = () => {
      const title = form.querySelector('[name="title_ko"]')?.value || '';
      box.innerHTML = previewHtml(readFormSpec(form), title);
    };
    if (form.dataset.previewBound === '1') {
      refresh();
      return;
    }
    form.dataset.previewBound = '1';
    form.addEventListener('input', refresh);
    form.querySelector('[name="tier_band"]')?.addEventListener('change', (event) => {
      const assign = form.querySelector('[name="requires_assign"]');
      if (assign && event.target.value === '초고액') assign.checked = true;
    });
    refresh();
  }

  function localMotion() {
    try {
      const stored = JSON.parse(localStorage.getItem(MOTION_KEY) || 'null');
      if (stored && typeof stored === 'object') return stored;
    } catch (_) {}
    return null;
  }

  function persistMotion(settings) {
    try { localStorage.setItem(MOTION_KEY, JSON.stringify(settings)); } catch (_) {}
  }

  const memberPacks = new Map();
  const DEFAULT_MEMBER_COPY = '가입을 환영해요. 업무를 시작하는 데 사용할 수 있는 지원금입니다.';
  const BADGE_TIERS = ['라인', '크루', '선임', '전담'];
  const BADGE_FROM = {
    '일반 파트너': '라인',
    '인증 파트너': '크루',
    '우수 파트너': '선임',
    '글로벌 디렉터': '전담',
    '라인': '라인',
    '크루': '크루',
    '선임': '선임',
    '전담': '전담'
  };

  function seedEnabled() {
    return window.PUTDUK_CONFIG?.enableAdminSeed === true;
  }

  function photoSrc(path) {
    const raw = String(path || '').trim();
    if (!raw) return '';
    if (/^https?:\/\//i.test(raw) || raw.startsWith('/')) return raw;
    if (raw.startsWith('brand-logos/')) return `/assets/${raw}`;
    if (raw.startsWith('assets/')) return `/${raw}`;
    return raw;
  }

  function displayText(value) {
    const text = String(value ?? '').trim();
    return text || '없음';
  }

  function displayTime(value) {
    if (!value) return '없음';
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return '없음';
    return date.toLocaleString('ko-KR', { month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit' });
  }

  function badgeTier(tier) {
    const raw = String(tier || '').trim();
    return BADGE_FROM[raw] || raw || '라인';
  }

  function sortedTierLimits(rows) {
    const map = new Map((Array.isArray(rows) ? rows : []).map((row) => [badgeTier(row.tier), row]));
    return BADGE_TIERS.map((tier) => {
      const row = map.get(tier) || {};
      const limit = Number(row.daily_limit);
      const unlimited = Number.isFinite(limit) ? limit <= 0 : false;
      return {
        tier,
        daily_limit: Number.isFinite(limit) ? limit : null,
        unlimited,
        updated_at: row.updated_at || null
      };
    });
  }

  function quotaLimitText(value, unlimited) {
    if (unlimited) return '무제한';
    if (value == null || value === '') return '확인 중';
    return `${Number(value)}회`;
  }

  async function loadTierDailyLimits({ silent = false } = {}) {
    const api = core();
    if (!api) return;
    try {
      const result = await api.adminRequest('list_tier_daily_limits', {});
      const limits = sortedTierLimits(result.limits || result);
      api.patchState({
        adminTierDailyLimits: limits,
        adminTierDailyLimitsError: null,
        adminTierDailyLimitsContract: true
      });
    } catch (error) {
      api.patchState({
        adminTierDailyLimits: [],
        adminTierDailyLimitsContract: !api.isUnsupportedAction?.(error),
        adminTierDailyLimitsError: api.friendlyAdminError(error)
      });
    } finally {
      if (!silent) api.render();
    }
  }

  function readTierLimitForm() {
    return BADGE_TIERS.map((tier) => {
      const unlimited = document.getElementById(`tierUnlimited-${tier}`)?.checked === true;
      const raw = document.getElementById(`tierLimit-${tier}`)?.value;
      return { tier, unlimited, daily_limit: unlimited ? 0 : raw };
    });
  }

  function bindTierLimitToggles() {
    BADGE_TIERS.forEach((tier) => {
      const box = document.getElementById(`tierUnlimited-${tier}`);
      const input = document.getElementById(`tierLimit-${tier}`);
      if (!box || !input || box.dataset.bound === '1') return;
      box.dataset.bound = '1';
      box.addEventListener('change', () => {
        input.disabled = box.checked;
        if (box.checked) input.value = '';
      });
    });
  }

  function bindMemberQuotaToggles() {
    const form = document.getElementById('memberTaskQuotaForm');
    if (!form || form.dataset.bound === '1') return;
    form.dataset.bound = '1';
    const useDefault = form.use_tier_default;
    const unlimited = form.member_unlimited;
    const input = form.daily_limit_override;
    const sync = () => {
      const defaults = useDefault?.checked === true;
      if (unlimited) unlimited.disabled = defaults;
      if (input) {
        input.disabled = defaults || unlimited?.checked === true;
        if (defaults || unlimited?.checked) input.value = input.value;
      }
    };
    useDefault?.addEventListener('change', sync);
    unlimited?.addEventListener('change', sync);
    sync();
  }

  async function saveTierDailyLimits() {
    const api = core();
    if (!api) return;
    const rows = readTierLimitForm();
    for (const row of rows) {
      if (!row.unlimited) {
        const amount = Number(row.daily_limit);
        if (!Number.isInteger(amount) || amount < 1) {
          api.showToast('⚠️ 횟수는 1 이상 정수로 적어 주세요. 무제한은 체크만 켜 주세요.', 'warning');
          return;
        }
      }
    }
    try {
      let latest = null;
      for (const row of rows) {
        latest = await api.adminRequest('set_tier_daily_limit', {
          tier: row.tier,
          daily_limit: row.unlimited ? 0 : Number(row.daily_limit),
          unlimited: row.unlimited
        });
      }
      const limits = sortedTierLimits(latest?.limits || []);
      api.patchState({
        adminTierDailyLimits: limits,
        adminTierDailyLimitsError: null,
        adminTierDailyLimitsContract: true
      });
      api.showToast('✅ 등급별 하루 업무 한도를 저장했어요.', 'success');
      api.render();
    } catch (error) {
      api.showToast(api.friendlyAdminError(error), api.isUnsupportedAction(error) ? 'warning' : 'error');
    }
  }

  async function saveMemberTaskQuota(event) {
    const api = core();
    if (!api) return;
    const form = event.target;
    const userId = String(form.user_id?.value || '').trim();
    const useDefault = form.use_tier_default?.checked === true;
    const unlimited = form.member_unlimited?.checked === true;
    const extra = Number(form.extra_task_starts?.value || 0);
    const override = Number(form.daily_limit_override?.value);
    if (!useDefault && !unlimited && (!Number.isInteger(override) || override < 1)) {
      api.showToast('⚠️ 이 회원 한도는 1 이상 정수이거나 무제한이어야 해요.', 'warning');
      return;
    }
    if (!Number.isInteger(extra) || extra < 0) {
      api.showToast('⚠️ 추가 횟수는 0 이상 정수로 적어 주세요.', 'warning');
      return;
    }
    try {
      const result = await api.adminRequest('set_member_task_quota', {
        user_id: userId,
        use_tier_default: useDefault,
        unlimited,
        daily_limit_override: useDefault ? null : (unlimited ? 0 : override),
        extra_task_starts: extra
      });
      const quota = result.quota?.quota || result.quota || null;
      const member = {
        ...(api.getState().modalPayload || api.getState().adminMemberDetail || {}),
        daily_task_quota: quota,
        daily_task_limit_override: useDefault ? null : (unlimited ? 0 : override),
        extra_task_starts: extra
      };
      api.patchState({ modalPayload: member, adminMemberDetail: member });
      api.showToast('✅ 이 회원의 하루 한도 예외를 저장했어요.', 'success');
      api.render();
    } catch (error) {
      api.showToast(api.friendlyAdminError(error), api.isUnsupportedAction(error) ? 'warning' : 'error');
    }
  }

  function memberStatusLabel(status) {
    return ({ active: '활동 중', pending: '대기', blocked: '차단', suspended: '정지' })[status] || '확인 중';
  }

  function pinEventLabel(event) {
    return ({
      lock: '이용 잠금',
      reveal: '계좌 안내 열람',
      pin_set: 'PIN 등록',
      pin_fail: 'PIN 입력 실패',
      pin_lock: '반복 실패로 잠금',
      pin_reset: 'PIN 재설정(운영자)',
      deposit_info_reveal: '입금 정보 열람'
    })[String(event || '')] || String(event || '-');
  }

  function pinScopeLabel(scope) {
    return ({
      deposit_info_reveal: '입금 정보 공개',
      withdrawal_step_up: '출금 추가 확인'
    })[String(scope || '')] || String(scope || '-');
  }

  function kycStatusLabel(status) {
    return ({ pending: '대기', submitted: '검수 대기', checking: '확인 중', approved: '확인 완료', rejected: '반려', expired: '만료' })[status] || '확인 중';
  }

  function financeStatusLabel(status) {
    return ({ submitted: '접수', checking: '확인 중', pending: '대기', approved: '승인', rejected: '반려', cancelled: '취소', sent: '완료', completed: '완료', processing: '처리 중' })[status] || '처리 중';
  }

  function taskStatusLabel(status) {
    return ({
      reserved: '예약',
      in_progress: '근무 중',
      checkpointed: '진행 중',
      submitted: '제출 완료',
      review_pending: '검수 대기',
      approved: '승인',
      rework: '재확인',
      rejected: '반려',
      cancelled: '취소'
    })[status] || '처리 중';
  }

  function ledgerKind(type) {
    const raw = String(type || '').trim();
    return ({
      admin_credit: '운영 입금',
      admin_debit: '운영 차감',
      deposit_posted: '입금 확인',
      withdrawal_hold: '출금 접수',
      withdrawal_sent: '출금 완료',
      withdrawal_reject: '출금 반려',
      referral_reward_posted: '추천 수당',
      stipend_posted: '수당',
      stake_lock: '근무 잠금',
      stake_release: '원금 반영',
      support_grant: '지원금'
    })[raw] || (raw.includes('credit') ? '입금' : raw.includes('debit') ? '차감' : '원장');
  }

  function bucketLabel(bucket) {
    return ({
      support_grant: '지원금',
      work_balance: '근무 잔액',
      task_reward: '수당',
      referral_reward: '추천',
      available: '출금 가능',
      held: '보류'
    })[String(bucket || '')] || '잔액';
  }

  function choiceLine(item, raw) {
    const inspectLabel = String(item?.member_choice_label || '').trim();
    if (item?.inspect_ok === true || /건 정상 검수/.test(inspectLabel)) {
      return inspectLabel || '오늘 배정 물량 5건 정상 검수';
    }
    const value = String(raw || item?.member_choice || '').trim().toLowerCase();
    const a = String(item?.choice_a_ko || '').trim();
    const b = String(item?.choice_b_ko || '').trim();
    if (value === 'a' || value === '1' || value === 'yes') return `보기 1${a ? ` · ${a}` : ''}`;
    if (value === 'b' || value === '2' || value === 'no') return `보기 2${b ? ` · ${b}` : ''}`;
    const shown = String(raw || item?.member_choice || '').trim();
    return shown;
  }

  function reviewPhotos(item) {
    const list = [
      ...(Array.isArray(item?.photos) ? item.photos : []),
      item?.question_image_path,
      item?.photo
    ].map((src) => photoSrc(src)).filter(Boolean);
    return [...new Set(list)];
  }

  function isHighValue(item) {
    return Number(item?.stake_amount || 0) >= 100000000 || item?.high_value === true;
  }

  function hasReviewPhoto(item) {
    if (item?.has_photo === true) return true;
    return reviewPhotos(item).length > 0;
  }

  function rememberMemberPack(payload) {
    if (!payload || typeof payload !== 'object') return;
    const profile = payload.profile || payload;
    const id = profile.id || payload.user_id || payload.id;
    if (!id) return;
    memberPacks.set(String(id), payload);
    const api = core();
    if (api) api.patchState({ adminMemberPack: payload });
    scheduleHydrate();
  }

  function currentMemberPack() {
    const api = core();
    const member = api?.getState()?.modalPayload || api?.getState()?.adminMemberDetail || {};
    const id = member.id || member.user_id;
    if (id && memberPacks.has(String(id))) return memberPacks.get(String(id));
    return api?.getState()?.adminMemberPack || {};
  }

  function wrapCore() {
    const api = core();
    if (!api || api._pdkOpsWrap) return api;
    const orig = api.adminRequest.bind(api);
    api.adminRequest = async (action, payload = {}) => {
      const result = await orig(action, payload);
      if (action === 'get_member' || action === 'member') rememberMemberPack(result.member || result);
      return result;
    };
    api._pdkOpsWrap = true;
    return api;
  }

  function seedButtons(kind, loading) {
    const extra = seedEnabled()
      ? `<button class="secondary-button" data-action="${kind === 'review' ? 'create-review-run' : 'create-operator-deposit'}">${kind === 'review' ? '검수 대상 만들기' : '처리 대기 입금 만들기'}</button>`
      : '';
    const action = kind === 'review' ? 'refresh-reviews' : 'refresh-finance';
    return `<div class="action-row">${extra}<button class="secondary-button" data-action="${action}" ${loading ? 'disabled' : ''}>${icon('refresh-cw', 16)} ${loading ? '불러오는 중…' : '새로고침'}</button></div>`;
  }

  function memberPickerHtml(selectedId, preset) {
    const api = core();
    const members = Array.isArray(api?.getState()?.adminMembers) ? api.getState().adminMembers : [];
    const selected = String(selectedId || '');
    const hasSelected = members.some((item) => String(item.id || item.user_id) === selected);
    const fallback = selected && !hasSelected
      ? `<option value="${esc(selected)}" selected>${esc(preset?.public_id || '선택한 사원')}</option>`
      : '';
    const options = members.map((item) => {
      const id = item.id || item.user_id;
      const no = item.public_id || '사원번호 없음';
      const name = item.display_name ? ` · ${item.display_name}` : '';
      return `<option value="${esc(id)}" ${String(id) === selected ? 'selected' : ''}>${esc(no)}${esc(name)}</option>`;
    }).join('');
    return `<select name="user_id" required><option value="">사원번호로 고르세요</option>${fallback}${options}</select>`;
  }

  function renderFinance() {
    const api = core();
    if (!api) return null;
    const state = api.getState();
    const finance = state.adminFinance || { deposits: [], withdrawals: [], kyc: [], referrals: [], destinations: [] };
    const withdrawals = Array.isArray(finance.withdrawals) ? finance.withdrawals : [];
    const wait = withdrawals.filter((row) => ['submitted', 'checking', 'approved'].includes(row.status)).length;
    const contractNote = state.adminFinanceContract === false
      ? `<p class="admin-hint">출금 처리 연결이 아직 없어요. 예시 목록은 보여 주지 않아요.</p>`
      : '';
    const error = state.adminFinanceError && state.adminFinanceContract !== false
      ? `<div class="notice" style="margin-bottom:16px"><span style="color:var(--gold)">${icon('triangle-alert', 17)}</span><div>${esc(state.adminFinanceError)}</div></div>`
      : '';
    const rows = withdrawals.map((item) => {
      const includePrincipal = item.include_principal === true || item.kind_label === '원금포함';
      const kind = includePrincipal ? '원금포함' : '수당만';
      const amount = item.currency === 'USDT'
        ? `${Number(item.amount || 0).toLocaleString('ko-KR')} 테더`
        : money(item.amount);
      const employee = item.employee_no || item.member_public_id || '-';
      const when = item.created_at || item.updated_at;
      const canComplete = ['submitted', 'checking', 'approved'].includes(item.status);
      const statusLabel = ({ submitted: '접수', checking: '확인 중', approved: '이체 대기', sent: '완료', completed: '완료', rejected: '반려', cancelled: '취소' })[item.status] || '처리 중';
      const actions = canComplete
        ? `<div class="action-row"><button type="button" class="small-button primary" data-action="withdraw-complete" data-withdrawal-id="${esc(item.id)}">완료</button><button type="button" class="small-button" data-finance-action="review_withdrawal" data-finance-id="${esc(item.id)}" data-finance-decision="rejected">반려</button></div>`
        : `<span style="color:var(--muted);font-size:12px">처리 끝</span>`;
      return `<tr>
        <td><span class="withdraw-kind">${kind}</span></td>
        <td><strong>${esc(amount)}</strong></td>
        <td><strong>${esc(employee)}</strong><br><span style="color:var(--muted);font-size:11px">${esc(item.member_name || '')}</span></td>
        <td><span class="pill ${item.status === 'sent' || item.status === 'completed' ? 'ok' : 'wait'}">${esc(statusLabel)}</span></td>
        <td>${when ? new Date(when).toLocaleString('ko-KR', { month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit' }) : '-'}</td>
        <td>${actions}</td>
      </tr>`;
    }).join('');
    const body = rows || `<tr><td colspan="6"><div class="empty-state compact"><div class="empty-icon">${icon('wallet-cards', 22)}</div><strong>처리할 출금 신청이 없어요.</strong><p>회원이 신청하면 수당만·원금포함과 사원번호가 이 목록에 나타나요.</p></div></td></tr>`;
    const depositWait = finance.deposits.filter((row) => ['submitted', 'checking'].includes(row.status)).length;
    const depositRows = finance.deposits.map((item) => {
      const pending = ['submitted', 'checking'].includes(item.status);
      const actions = pending
        ? `<div class="action-row"><button class="small-button primary" data-finance-action="review_deposit" data-finance-id="${esc(item.id)}" data-finance-decision="approved">확인</button><button class="small-button" data-finance-action="review_deposit" data-finance-id="${esc(item.id)}" data-finance-decision="rejected">반려</button></div>`
        : `<span style="color:var(--muted);font-size:12px">처리 끝</span>`;
      return `<tr><td>${esc(item.member_public_id || item.member_name || '-')}</td><td>${money(item.amount)}</td><td>${esc(item.status === 'approved' ? '확인' : item.status === 'rejected' ? '반려' : '대기')}</td><td>${actions}</td></tr>`;
    }).join('') || `<tr><td colspan="4"><div class="empty-state compact"><strong>입금 확인 대기가 없어요.</strong></div></td></tr>`;
    const destinations = Array.isArray(finance.destinations) ? finance.destinations : [];
    const destToggle = (item) => {
      const shown = item.enabled !== false;
      const label = shown ? '회원에게 숨기기' : '회원에게 보이기';
      return `<span class="pill ${shown ? 'ok' : 'wait'}">${shown ? '회원 표시' : '숨김'}</span><div class="action-row"><button type="button" class="${shown ? 'small-button' : 'small-button primary'}" data-action="toggle-payout-destination" data-destination-id="${esc(item.id)}" data-enabled="${shown ? 'false' : 'true'}" aria-label="${label}">${label}</button><button type="button" class="small-button" data-action="delete-payout-destination" data-destination-id="${esc(item.id)}" aria-label="입금 안내 삭제">삭제</button><button type="button" class="small-button" data-action="edit-payout-destination" data-destination-id="${esc(item.id)}">수정</button></div>`;
    };
    const destRows = destinations.map((item) => {
      const kind = String(item.destination_type || '') === 'usdt' ? 'USDT' : '원화 계좌';
      const line = [item.bank_name, item.account_holder, item.masked_value, item.usdt_network].filter(Boolean).join(' · ') || '확인 필요';
      return `<tr><td>${esc(item.label || kind)}</td><td>${esc(kind)}</td><td>${esc(line)}<br><span style="color:var(--muted);font-size:11px">버전 ${Number(item.info_version || 1)} · ${item.address_mode === 'operator_fixed' || kind === 'USDT' ? '고정 주소' : '원화'}</span></td><td>${destToggle(item)}</td></tr>`;
    }).join('') || `<tr><td colspan="4"><div class="empty-state compact"><strong>등록된 입금 계좌가 없어요.</strong><p>원문 계좌·USDT를 저장하면, 회원은 PIN 뒤에만 볼 수 있어요.</p></div></td></tr>`;
    const pinAudit = Array.isArray(finance.pin_audit) ? finance.pin_audit : [];
    const pinRows = pinAudit.map((item) => `<tr><td>${esc(pinEventLabel(item.event))}</td><td>${esc(pinScopeLabel(item.scope))}</td><td>${item.created_at ? new Date(item.created_at).toLocaleString('ko-KR') : '-'}</td></tr>`).join('')
      || `<tr><td colspan="3"><div class="empty-state compact"><strong>보안 PIN 기록이 아직 없어요.</strong></div></td></tr>`;
    const destKind = (item) => String(item.destination_type || '') === 'usdt' ? 'usdt' : 'bank';
    const bankDestRows = destinations.filter((item) => destKind(item) === 'bank').map((item) => {
      const line = [item.bank_name, item.account_holder, item.masked_value].filter(Boolean).join(' · ') || '확인 필요';
      return `<tr><td>${esc(item.label || '원화 계좌')}</td><td>${esc(line)}<br><span style="color:var(--muted);font-size:11px">버전 ${Number(item.info_version || 1)}</span></td><td>${destToggle(item)}</td></tr>`;
    }).join('') || `<tr><td colspan="3"><div class="empty-state compact"><strong>등록된 원화 계좌가 없어요.</strong></div></td></tr>`;
    const usdtDestRows = destinations.filter((item) => destKind(item) === 'usdt').map((item) => {
      const line = [item.usdt_network, item.masked_value].filter(Boolean).join(' · ') || '확인 필요';
      return `<tr><td>${esc(item.label || 'USDT')}</td><td>${esc(line)}<br><span style="color:var(--muted);font-size:11px">버전 ${Number(item.info_version || 1)} · 고정 주소</span></td><td>${destToggle(item)}</td></tr>`;
    }).join('') || `<tr><td colspan="3"><div class="empty-state compact"><strong>등록된 USDT 주소가 없어요.</strong></div></td></tr>`;
    const withdrawCards = withdrawals.map((item) => {
      const includePrincipal = item.include_principal === true || item.kind_label === '원금포함';
      const kind = includePrincipal ? '원금포함' : '수당만';
      const amount = item.currency === 'USDT' ? `${Number(item.amount || 0).toLocaleString('ko-KR')} 테더` : money(item.amount);
      const employee = item.employee_no || item.member_public_id || '-';
      const canComplete = ['submitted', 'checking', 'approved'].includes(item.status);
      const statusLabel = ({ submitted: '접수', checking: '확인 중', approved: '이체 대기', sent: '완료', completed: '완료', rejected: '반려', cancelled: '취소' })[item.status] || '처리 중';
      const actions = canComplete
        ? `<div class="action-row"><button type="button" class="small-button primary" data-action="withdraw-complete" data-withdrawal-id="${esc(item.id)}">완료</button><button type="button" class="small-button" data-finance-action="review_withdrawal" data-finance-id="${esc(item.id)}" data-finance-decision="rejected">반려</button></div>`
        : `<span style="color:var(--muted);font-size:12px">처리 끝</span>`;
      return `<article class="admin-mobile-card"><div class="admin-mobile-top"><strong>${esc(kind)} · ${esc(amount)}</strong><span class="pill ${item.status === 'sent' || item.status === 'completed' ? 'ok' : 'wait'}">${esc(statusLabel)}</span></div><p>${esc(employee)} · ${esc(item.member_name || '')}</p>${actions}</article>`;
    }).join('');
    const depositCards = finance.deposits.map((item) => {
      const pending = ['submitted', 'checking'].includes(item.status);
      const actions = pending
        ? `<div class="action-row"><button class="small-button primary" data-finance-action="review_deposit" data-finance-id="${esc(item.id)}" data-finance-decision="approved">확인</button><button class="small-button" data-finance-action="review_deposit" data-finance-id="${esc(item.id)}" data-finance-decision="rejected">반려</button></div>`
        : `<span style="color:var(--muted);font-size:12px">처리 끝</span>`;
      return `<article class="admin-mobile-card"><div class="admin-mobile-top"><strong>${esc(item.member_public_id || item.member_name || '-')}</strong><span class="pill ${item.status === 'approved' ? 'ok' : 'wait'}">${esc(item.status === 'approved' ? '확인' : item.status === 'rejected' ? '반려' : '대기')}</span></div><p>${money(item.amount)}</p>${actions}</article>`;
    }).join('');
    const tab = state.adminFinanceTab || 'payouts';
    const tabs = [
      { id: 'payouts', label: '출금' },
      { id: 'deposits', label: '입금' },
      { id: 'krw', label: '원화' },
      { id: 'usdt', label: 'USDT' },
      { id: 'security', label: '보안기록' }
    ];
    const tabNav = `<div class="help-tabs finance-tabs">${tabs.map((item) => `<button type="button" class="filter-button ${tab === item.id ? 'active' : ''}" data-finance-tab="${item.id}">${item.label}</button>`).join('')}</div>`;
    const destForm = (kind) => `<form id="payoutDestinationForm" class="form-grid" style="margin-top:16px">
          <input type="hidden" name="destination_id" value="" />
          <div class="field"><label>종류</label><select name="destination_type"><option value="bank" ${kind === 'bank' ? 'selected' : ''}>원화 계좌</option><option value="usdt" ${kind === 'usdt' ? 'selected' : ''}>USDT 고정 주소</option></select></div>
          <div class="field"><label>표시 이름</label><input name="label" maxlength="80" placeholder="예: 퍼뜩 입금 계좌" /></div>
          ${kind === 'bank' ? `<div class="field"><label>은행명</label><input name="bank_name" maxlength="80" placeholder="예: 국민은행" /></div>
          <div class="field"><label>예금주</label><input name="account_holder" maxlength="80" placeholder="예금주 이름" /></div>
          <div class="field full"><label>계좌번호 (원화 원문)</label><input name="account_number" maxlength="80" placeholder="바꿀 때만 적어요. 저장된 원문은 다시 보여주지 않아요" autocomplete="off" /></div>` : `<div class="field"><label>USDT 네트워크</label><input name="usdt_network" maxlength="40" placeholder="TRC20" value="TRC20" /></div>
          <div class="field full"><label>USDT 주소 (고정)</label><input name="usdt_address" maxlength="200" placeholder="바꿀 때만 적어요. 저장된 원문은 다시 보여주지 않아요" autocomplete="off" /></div>`}
          <div class="field full"><label>QR 이미지 경로</label><input name="qr_asset_path" maxlength="500" placeholder="putduk-private 경로. 없으면 회원 화면에서 주소 QR을 만들어요" /></div>
          <div class="field full"><label>메모</label><input name="memo" maxlength="500" placeholder="회원에게 PIN 뒤에 보여줄 한 줄" /></div>
          <div class="field full"><label>안내 문구</label><input name="guidance_text" maxlength="1000" placeholder="입금 후 확인 요청을 남겨 주세요" /></div>
          <div class="field full"><label>변경 사유</label><input name="change_reason" maxlength="500" placeholder="계좌·주소를 바꾸면 필수" /></div>
          <label class="check-row field full"><input type="checkbox" name="enabled" checked /> 회원 입금 화면에 바로 보여요</label>
          <div class="modal-actions field full"><button class="primary-button" type="submit">입금 안내 저장</button></div>
        </form>`;
    const panel = tab === 'deposits'
      ? `<div class="admin-card"><div class="admin-card-head"><div><h3>입금 확인</h3><p>입금은 확인 후 회원 잔액에 반영돼요.</p></div></div>
        <div class="table-wrap"><table><thead><tr><th>사원번호</th><th>금액</th><th>상태</th><th></th></tr></thead><tbody>${depositRows}</tbody></table></div>${mobileCards(depositCards)}
      </div>`
      : tab === 'krw'
        ? `<div class="admin-card"><div class="admin-card-head"><div><h3>입금 안내 설정 · 원화</h3><p>원문 계좌는 회원 PIN 뒤에만 보여요. 화면만 바꾸면 입금 추적이 깨져요.</p></div></div>
        <div class="table-wrap"><table><thead><tr><th>이름</th><th>안내</th><th>표시</th></tr></thead><tbody>${bankDestRows}</tbody></table></div>
        ${destForm('bank')}
      </div>`
      : tab === 'usdt'
        ? `<div class="admin-card"><div class="admin-card-head"><div><h3>USDT 입금 안내</h3><p>고정 TRC20 원문을 저장해요. 회원별 자동생성은 하지 않아요.</p></div></div>
        <div class="table-wrap"><table><thead><tr><th>이름</th><th>안내</th><th>표시</th></tr></thead><tbody>${usdtDestRows}</tbody></table></div>
        ${destForm('usdt')}
      </div>`
        : tab === 'security'
          ? `<div class="admin-card"><div class="admin-card-head"><div><h3>보안 PIN 재설정</h3><p>운영자는 PIN 원문을 볼 수 없어요. 재설정만 하면 회원이 다시 만듭니다.</p></div></div>
        <form id="securityPinResetForm" class="form-grid">
          <div class="field"><label>회원</label>${memberPickerHtml()}</div>
          <div class="field full"><label>사유</label><input name="reason" required maxlength="500" placeholder="재설정 사유" /></div>
          <div class="modal-actions field full"><button class="primary-button" type="submit">PIN 재설정</button></div>
        </form>
        <div class="table-wrap" style="margin-top:16px"><table><thead><tr><th>기록</th><th>범위</th><th>시각</th></tr></thead><tbody>${pinRows}</tbody></table></div>
      </div>`
          : `<div class="admin-card"><div class="admin-card-head"><div><h3>출금 신청 목록</h3><p>완료를 누르면 같은 날 바로 이체 처리되고, 회원 잔액·내역이 서버에서 바뀌어요.</p></div></div>
        <div class="table-wrap"><table><thead><tr><th>구분</th><th>금액</th><th>사원번호</th><th>상태</th><th>신청 시각</th><th></th></tr></thead><tbody>${body}</tbody></table></div>${mobileCards(withdrawCards)}
      </div>`;
    return `<div class="section-heading" style="margin-top:0"><div><h1 class="page-title">입출금 처리</h1><p class="page-copy">출금은 완료 한 번으로 바로 처리해요. 회원 잔액은 서버가 바꿉니다.</p></div>${seedButtons('finance', state.adminFinanceLoading)}</div>${contractNote}${error}
      <div class="admin-stat-grid">
        <div class="admin-stat"><p>출금 신청</p><strong>${wait}</strong><span style="color:var(--gold)">바로 완료 가능</span></div>
        <div class="admin-stat"><p>입금 확인 대기</p><strong>${depositWait}</strong><span>수동 확인</span></div>
        <div class="admin-stat"><p>본인확인</p><strong>${finance.kyc.length}</strong><span>원본 주소는 공개하지 않음</span></div>
      </div>
      ${tabNav}${panel}`;
  }

  function renderNodes() {
    const api = core();
    if (!api) return null;
    const state = api.getState();
    const rows = api.adminNodeViews();
    const brands = api.adminBrandViews();
    const body = rows.map((node) => {
      const spec = parseWorkSpec(node);
      const company = brands.find((item) => item.id === node.companyId) || api.adminBrandById?.(node.companyId) || { name: '협력사' };
      const status = node.catalogStatus;
      const action = status === 'published' ? 'pause_node' : 'publish_node';
      const label = status === 'published' ? '회원 공개 중지' : status === 'archived' ? '다시 공개' : '회원 공개';
      const statusText = status === 'published' ? '공개 중' : status === 'paused' ? '일시 중지' : status === 'archived' ? '보관됨' : '작성 중';
      return `<tr>
        <td><strong>${esc(node.title)}</strong><br><span style="color:var(--muted);font-size:11px" title="${esc(node.publicId || '')}">${esc(node.level || '')}</span></td>
        <td>${esc(company.name)}</td>
        <td>${money(spec.stake)}</td>
        <td>${money(spec.stipend)}</td>
        <td>${Number(spec.slots || 0).toLocaleString('ko-KR')}자리</td>
        <td><button class="small-button ${status === 'published' ? 'primary' : ''}" data-catalog-node-action="${action}" data-node-id="${esc(node.id)}">${label}</button><br><span class="pill ${status === 'published' ? 'ok' : 'wait'}" style="margin-top:5px">${statusText}</span></td>
        <td><div class="action-row"><button class="small-button" data-action="edit-node" data-node-id="${esc(node.id)}">수정</button><button class="small-button" data-catalog-node-action="archive_node" data-node-id="${esc(node.id)}">보관</button></div></td>
      </tr>`;
    }).join('');
    const bodyHtml = body || `<tr><td colspan="7"><div class="empty-state compact"><div class="empty-icon">${icon('waypoints', 22)}</div><strong>등록된 업무 카드가 없어요.</strong><p>근무 보증·수당·문제 보기를 넣고 카드를 만들어 주세요.</p></div></td></tr>`;
    const mobile = rows.map((node) => {
      const spec = parseWorkSpec(node);
      const company = brands.find((item) => item.id === node.companyId) || api.adminBrandById?.(node.companyId) || { name: '협력사' };
      const status = node.catalogStatus;
      const action = status === 'published' ? 'pause_node' : 'publish_node';
      const label = status === 'published' ? '회원 공개 중지' : status === 'archived' ? '다시 공개' : '회원 공개';
      const statusText = status === 'published' ? '공개 중' : status === 'paused' ? '일시 중지' : status === 'archived' ? '보관됨' : '작성 중';
      return `<article class="admin-mobile-card"><div class="admin-mobile-top"><strong>${esc(node.title)}</strong><span class="pill ${status === 'published' ? 'ok' : 'wait'}">${statusText}</span></div><p>${esc(company.name)} · 보증 ${money(spec.stake)} · 수당 ${money(spec.stipend)}</p><div class="action-row"><button class="small-button ${status === 'published' ? 'primary' : ''}" data-catalog-node-action="${action}" data-node-id="${esc(node.id)}">${label}</button><button class="small-button" data-action="edit-node" data-node-id="${esc(node.id)}">수정</button></div></article>`;
    }).join('');
    const errorText = state.adminCatalogError ? String(state.adminCatalogError.message || state.adminCatalogError) : '';
    const notice = state.adminCatalogError
      ? `<div class="notice" style="margin-bottom:18px"><span style="color:var(--gold)">${icon('triangle-alert', 17)}</span><div><strong>업무 목록을 불러오지 못했어요.</strong><br>${esc(errorText)} <button class="text-link" data-action="refresh-catalog">다시 불러오기</button></div></div>`
      : '';
    return `<div class="section-heading" style="margin-top:0"><div><h1 class="page-title">업무 카드 관리</h1><p class="page-copy">근무 보증, 수당, 문제 사진, 보기 두 개, 정답, 자리를 등록해요. 미리보기는 회원 카드와 같은 세 줄입니다.</p></div><button class="primary-button" data-action="add-node">${icon('plus', 16)} 업무 카드 만들기</button></div>${notice}<div class="admin-card"><div class="table-wrap"><table><thead><tr><th>업무 카드</th><th>협력사</th><th>근무 보증</th><th>수당</th><th>자리</th><th>공개</th><th></th></tr></thead><tbody>${bodyHtml}</tbody></table></div>${mobileCards(mobile)}</div>`;
  }

  function renderReviews() {
    const api = core();
    if (!api) return null;
    const state = api.getState();
    const statusLabel = {
      submitted: '제출 완료',
      review_pending: '검수 대기',
      approved: '승인',
      rework: '재확인',
      rejected: '반려'
    };
    const reviews = Array.isArray(state.adminReviews) ? state.adminReviews : [];
    const cards = reviews.map((item) => {
      const pending = ['submitted', 'review_pending'].includes(item.status);
      const busy = state.adminReviewBusyId === item.id;
      const trial = item.is_trial === true || item.tier_band === '체험' || String(item.node_title || '').includes('체험') || (Number(item.stake_amount || 0) === 10000 && Number(item.stipend_amount || item.reward_amount || 0) === 3000);
      const stake = Number(item.stake_amount || 0);
      const stipend = Number(item.stipend_amount || item.reward_amount || 0);
      const photos = reviewPhotos(item);
      const high = isHighValue(item);
      const photoOk = hasReviewPhoto(item);
      const memberPick = choiceLine(item, item.member_choice);
      const pickOk = Boolean(memberPick) || item?.has_member_choice === true;
      const correctIdx = Number(item.correct_answer || (String(item.correct_choice || '').toLowerCase() === 'b' ? 2 : 1) || 1);
      const correctText = correctIdx === 2
        ? `보기 2${item.choice_b_ko ? ` · ${item.choice_b_ko}` : ''}`
        : `보기 1${item.choice_a_ko ? ` · ${item.choice_a_ko}` : ''}`;
      const photoHtml = photos.length
        ? `<div class="review-photo">${photos.map((src) => `<img src="${esc(src)}" alt="문제 사진" />`).join('')}</div>`
        : `<p class="admin-hint">문제 사진이 없어요.</p>`;
      let actions = `<span class="review-done">처리 끝</span>`;
      if (pending) {
        const emptyEvidence = !photoOk && !pickOk;
        const blockHigh = high && !photoOk;
        const blockApprove = blockHigh || emptyEvidence;
        const blockCopy = blockHigh
          ? '📷 1억 칸은 문제 사진이 있어야 승인할 수 있어요. 사진 없는 근무는 승인하지 마세요.'
          : '📷 문제 사진도 제출 보기도 없으면 승인할 수 없어요.';
        actions = `<div class="review-actions">
          ${blockApprove
            ? `<p class="review-block">${blockCopy}</p>`
            : `<button class="small-button primary" data-review-action="approved" data-review-id="${esc(item.id)}" ${busy ? 'disabled' : ''}>${busy ? '처리 중…' : '승인'}</button>`}
          <button class="small-button" data-review-action="rejected" data-review-id="${esc(item.id)}" ${busy ? 'disabled' : ''}>반려</button>
        </div>`;
      }
      return `<article class="review-card">
        <div class="review-card-head">
          <div><strong>${esc(item.member_name || '사원')}</strong><br><span>${esc(item.member_public_id || '')}</span>${trial ? ' <span class="pill wait">체험</span>' : ''}${high ? ' <span class="pill wait">1억 칸</span>' : ''}</div>
          <span class="pill ${item.status === 'approved' ? 'ok' : 'wait'}">${esc(statusLabel[item.status] || '처리 중')}</span>
        </div>
        <p class="review-work"><strong>${esc(item.company_name || '협력사')}</strong> · ${esc(item.node_title || '')}</p>
        <p class="review-money">${trial ? '지원금 소진' : '근무 보증'} ${money(stake)} · 수당 ${money(stipend)}</p>
        ${photoHtml}
        ${item.question_prompt_ko ? `<p class="review-prompt">${esc(item.question_prompt_ko)}</p>` : ''}
        <div class="review-picks">
          <div><span>회원이 고른 보기</span><strong>${esc(memberPick || '제출 보기 없음')}</strong></div>
          <div class="review-answer-ops"><span>운영자만 보는 정답</span><strong>${esc(item.inspect_ok ? '전표·실물 5건 일치 여부' : correctText)}</strong></div>
        </div>
        ${actions}
      </article>`;
    }).join('');
    const body = cards || `<div class="empty-state compact"><div class="empty-icon">${icon('clipboard-check', 22)}</div><strong>지금 검수할 업무가 없어요.</strong><p>회원이 제출하면 이 목록에서 바로 승인·반려할 수 있어요.</p></div>`;
    const error = state.adminReviewError ? `<div class="notice" style="margin-bottom:16px"><span style="color:var(--gold)">${icon('triangle-alert', 17)}</span><div>${esc(state.adminReviewError.message || state.adminReviewError)}</div></div>` : '';
    return `<div class="section-heading" style="margin-top:0"><div><h1 class="page-title">업무 검수</h1><p class="page-copy">숫자는 서버가 정해요. 체험과 일반 근무의 정산이 달라요. 검수는 승인 또는 반려만 해요.</p></div>${seedButtons('review', state.adminReviewLoading)}</div>${error}
      <div class="notice" style="margin-bottom:16px"><span style="color:var(--emerald)">${icon('badge-check', 17)}</span><div><strong>체험</strong>은 지원금이 쓰이고 돌려주지 않아요. 수당만 출금 가능에 들어와요.<br><strong>일반 근무</strong>는 승인하면 원금이 근무 잔액에, 수당이 출금 가능에 보여요. 반려하면 원금만 돌아와요.</div></div>
      <div class="admin-stat-grid"><div class="admin-stat"><p>검수 대기</p><strong>${state.adminReviewPendingCount}</strong><span>제출·대기</span></div><div class="admin-stat"><p>처리 완료</p><strong>${state.adminReviewCompletedCount}</strong><span>최근 내역 포함</span></div></div>
      <div class="review-stack">${body}</div>`;
  }

  function renderMotion() {
    const api = core();
    if (!api) return null;
    const state = api.getState();
    const settings = { bot_enabled: true, crowd_min: 8, crowd_max: 24, burn_per_minute: 2, ...(state.adminMotion || {}) };
    const error = state.adminMotionError
      ? `<div class="notice" style="margin-bottom:16px"><span style="color:var(--gold)">${icon('triangle-alert', 17)}</span><div>${esc(state.adminMotionError)}</div></div>`
      : '';
    const crowdMaxLimit = Math.max(200, Number(settings.crowd_max || 0));
    const burnLimit = Math.max(30, Number(settings.burn_per_minute || 0));
    return `<div class="section-heading" style="margin-top:0"><div><h1 class="page-title">연출</h1><p class="page-copy">봇 연출과 인원·자리 소진 값을 저장해요. 회원 작업실에 바로 보여요.</p></div><button type="button" class="primary-button" data-action="save-motion">설정 저장</button></div>${error}
      <div class="admin-card">
        <div class="admin-card-head"><div><h3>봇 연출</h3><p>방금 피드·자리 소진에 쓰는 값입니다. 빼지 말고 세기만 조절하세요.</p></div></div>
        <form id="motionSettingsForm" class="form-grid">
          <div class="field full"><label class="motion-toggle"><input id="motionBotEnabled" name="bot_enabled" type="checkbox" ${settings.bot_enabled !== false ? 'checked' : ''} /> 봇 켜기</label></div>
          <div class="field full"><label for="motionCrowdMin">가짜 활동 인원 최소 <strong data-motion-out="crowd_min">${Number(settings.crowd_min || 0)}</strong>명</label><input id="motionCrowdMin" class="motion-slider" name="crowd_min" type="range" min="0" max="${crowdMaxLimit}" value="${Number(settings.crowd_min || 0)}" /></div>
          <div class="field full"><label for="motionCrowdMax">가짜 활동 인원 최대 <strong data-motion-out="crowd_max">${Number(settings.crowd_max || 0)}</strong>명</label><input id="motionCrowdMax" class="motion-slider" name="crowd_max" type="range" min="0" max="${crowdMaxLimit}" value="${Number(settings.crowd_max || 0)}" /></div>
          <div class="field full"><label for="motionBurn">분당 자리 소진 <strong data-motion-out="burn_per_minute">${Number(settings.burn_per_minute || 0)}</strong>칸</label><input id="motionBurn" class="motion-slider" name="burn_per_minute" type="range" min="0" max="${burnLimit}" value="${Number(settings.burn_per_minute || 0)}" /></div>
        </form>
      </div>`;
  }

  function renderNodeForm() {
    const api = core();
    if (!api) return null;
    const state = api.getState();
    const node = state.modalPayload || {};
    const editing = Boolean(node.id);
    const spec = parseWorkSpec(node);
    const brands = api.adminBrandViews();
    const brandOptions = brands.map((brand) => `<option value="${esc(brand.id)}" ${String(brand.id) === String(node.companyId || node.partner_brand_id || '') ? 'selected' : ''}>${esc(brand.name)}</option>`).join('');
    const photos = spec.photos || [];
    const choices = spec.choices || [];
    return `<div class="modal-backdrop" data-modal="node-form"><div class="modal"><div class="modal-head"><div><h2>${editing ? '업무 카드 수정' : '업무 카드 등록'}</h2><p>회원 카드와 같은 세 줄이 미리보기에 나와요.</p></div><button class="icon-button" data-action="close-modal">${icon('x', 18)}</button></div><div class="modal-body"><form id="nodeForm">
      <input type="hidden" name="node_id" value="${esc(node.id || '')}" />
      <div class="form-grid">
        <div class="field"><label>협력사</label><select name="partner_brand_id" required>${brandOptions || '<option value="">먼저 협력사를 등록해 주세요</option>'}</select></div>
        <div class="field"><label>금액 구간</label><select name="tier_band">${['체험', '소액', '중간', '고액', '초고액'].map((item) => `<option value="${item}" ${(spec.tier_band || '소액') === item ? 'selected' : ''}>${item}</option>`).join('')}</select></div>
        <div class="field"><label>난이도</label><select name="difficulty"><option ${node.difficulty === '빠른 확인' || node.level === '빠른 확인' ? 'selected' : ''}>빠른 확인</option><option ${!node.difficulty || node.difficulty === '일반 처리' || node.level === '일반 처리' ? 'selected' : ''}>일반 처리</option><option ${node.difficulty === '집중 처리' || node.level === '집중 처리' ? 'selected' : ''}>집중 처리</option><option ${node.difficulty === '전문 검수' || node.level === '전문 검수' ? 'selected' : ''}>전문 검수</option></select></div>
        <div class="field full"><label>업무명</label><input name="title_ko" required maxlength="120" value="${esc(node.title_ko || node.title || '')}" /></div>
        <div class="field full"><label>설명</label><textarea name="description_ko" required maxlength="1000" rows="3">${esc(node.description_ko || node.copy || '')}</textarea></div>
        <div class="field"><label>분류</label><input name="node_family" required value="${esc(node.node_family || node.category || '데이터 업무')}" /></div>
        <div class="field"><label>예상시간(초)</label><input name="estimated_seconds" type="number" min="30" max="5400" required value="${Number(node.estimated_seconds || node.time || 1800)}" /></div>
        <div class="field"><label>근무 보증(잠금)</label><input name="stake_krw" type="number" min="0" required value="${Number(spec.stake || 0)}" /></div>
        <div class="field"><label>끝나면 수당</label><input name="stipend_krw" type="number" min="0" required value="${Number(spec.stipend || 0)}" /></div>
        <div class="field"><label>하루 자리</label><input name="daily_cap" type="number" min="0" required value="${Number(spec.slots || 0)}" /></div>
        <div class="field"><label>정답</label><select name="correct_choice"><option value="a" ${Number(spec.answer || 1) !== 2 ? 'selected' : ''}>보기 1</option><option value="b" ${Number(spec.answer || 1) === 2 ? 'selected' : ''}>보기 2</option></select></div>
        <div class="field full"><label class="motion-toggle"><input name="requires_assign" type="checkbox" ${spec.requires_assign || spec.tier_band === '초고액' ? 'checked' : ''} /> 이 금액 구간은 운영자 확인 후 열립니다</label></div>
        <div class="field full"><label>문제 사진 주소</label><input name="question_image_path" value="${esc(photos[0] || '')}" placeholder="파일 경로" /></div>
        <div class="field full"><label>문제 안내</label><input name="question_prompt_ko" maxlength="200" value="${esc(spec.question_prompt_ko || '')}" /></div>
        <div class="field"><label>보기 1</label><input name="choice_a_ko" required maxlength="80" value="${esc(choices[0] || '')}" /></div>
        <div class="field"><label>보기 2</label><input name="choice_b_ko" required maxlength="80" value="${esc(choices[1] || '')}" /></div>
      </div>
      <div id="workCardPreviewHost">${previewHtml(spec, node.title_ko || node.title || '')}</div>
      <div class="modal-actions"><button class="secondary-button" type="button" data-action="close-modal">취소</button><button class="primary-button" type="submit">${editing ? '수정 저장' : '카드 만들기'}</button></div>
    </form></div></div></div>`;
  }

  function readMotionForm() {
    const bot = document.getElementById('motionBotEnabled');
    return {
      bot_enabled: Boolean(bot?.checked),
      crowd_min: Number(document.getElementById('motionCrowdMin')?.value || 0),
      crowd_max: Number(document.getElementById('motionCrowdMax')?.value || 0),
      burn_per_minute: Number(document.getElementById('motionBurn')?.value || 0)
    };
  }

  function bindMotionSliders() {
    const form = document.getElementById('motionSettingsForm');
    if (!form || form.dataset.bound === '1') return;
    form.dataset.bound = '1';
    const syncOut = () => {
      form.querySelectorAll('[data-motion-out]').forEach((el) => {
        const name = el.getAttribute('data-motion-out');
        const input = form.querySelector(`[name="${name}"]`);
        if (input) el.textContent = String(input.value || 0);
      });
    };
    form.addEventListener('input', () => {
      syncOut();
      const settings = readMotionForm();
      core()?.patchState({ adminMotion: settings });
    });
    syncOut();
  }

  async function loadMotion({ silent = true } = {}) {
    const api = core();
    if (!api) return;
    try {
      const result = await api.adminRequest('get_motion_settings', {});
      const settings = result.settings || result;
      api.patchState({ adminMotion: settings, adminMotionError: null });
      if (settings?.stored === 'api') persistMotion(settings);
      if (!silent) api.render();
    } catch (error) {
      const local = localMotion();
      if (local) api.patchState({ adminMotion: { ...local, stored: 'local' } });
      api.patchState({ adminMotionError: api.friendlyAdminError(error) });
      if (!silent) api.render();
    }
  }

  async function saveMotion() {
    const api = core();
    if (!api) return;
    const settings = readMotionForm();
    api.patchState({ adminMotion: settings });
    try {
      const result = await api.adminRequest('save_motion_settings', settings);
      const saved = result.settings || settings;
      if (saved.stored !== 'api') {
        api.patchState({ adminMotionError: '연출 값을 서버에 저장하지 못했어요. 다시 저장해 주세요.' });
        api.showToast('연출 값을 서버에 저장하지 못했어요. 다시 저장해 주세요.', 'error');
        api.render();
        return;
      }
      persistMotion(saved);
      api.patchState({ adminMotion: saved, adminMotionError: null });
      api.showToast('✅ 연출 값을 저장했어요. 회원 작업실에도 같은 숫자가 보여요.', 'success');
      api.render();
    } catch (error) {
      api.patchState({ adminMotionError: api.friendlyAdminError(error) });
      api.showToast(api.friendlyAdminError(error) || '연출 값을 서버에 저장하지 못했어요.', 'error');
    }
  }

  function renderPayoutDeleteConfirm() {
    const api = wrapCore();
    if (!api) return null;
    const id = api.getState().modalPayload?.id || api.getState().modalPayload?.destination_id || '';
    return `<div class="modal-backdrop" data-modal="payout-delete"><div class="modal"><div class="modal-head"><div><h2>입금 안내 삭제</h2><p>한 번 더 확인할게요.</p></div><button class="icon-button" type="button" data-action="close-modal" aria-label="닫기">${icon('x', 18)}</button></div><div class="modal-body"><p class="page-copy">이 입금 안내를 지울까요? 회원 화면에서 바로 사라져요 🗑️</p><div class="modal-actions"><button class="secondary-button" type="button" data-action="close-modal">취소</button><button class="primary-button" type="button" data-action="confirm-payout-destination-delete" data-destination-id="${esc(id)}" aria-label="입금 안내 삭제 확인">확인</button></div></div></div></div>`;
  }

  async function deletePayoutDestination(id) {
    const api = wrapCore();
    if (!api || !id) return;
    if (api.getState().adminPayoutDeleteBusy) return;
    api.patchState({ adminPayoutDeleteBusy: true });
    try {
      await api.adminRequest('delete_payout_destination', {
        destination_id: id,
        change_reason: '회원 입금 안내에서 삭제'
      });
      const form = document.getElementById('payoutDestinationForm');
      if (form?.destination_id && String(form.destination_id.value) === String(id)) {
        form.reset();
        const enabled = form.querySelector('[name="enabled"]');
        if (enabled) enabled.checked = true;
      }
      if (typeof api.closeModal === 'function') api.closeModal();
      else api.patchState({ modal: null, modalPayload: null });
      if (typeof api.loadAdminFinance === 'function') await api.loadAdminFinance({ silent: false });
      else api.render();
      api.showToast('입금 안내를 지웠어요. 회원 화면에서 바로 빠져요 🗑️', 'success');
    } catch (error) {
      api.showToast(error?.message || '입금 안내를 지우지 못했어요.', 'warning');
    } finally {
      api.patchState({ adminPayoutDeleteBusy: false });
    }
  }

  async function togglePayoutDestination(id, enabledRaw) {
    const api = wrapCore();
    if (!api || !id) return;
    const enabled = enabledRaw !== false && enabledRaw !== 'false';
    try {
      await api.adminRequest('set_payout_destination_enabled', {
        destination_id: id,
        enabled,
        change_reason: enabled ? '회원 입금 안내에 다시 표시' : '회원 입금 안내에서 숨김'
      });
      if (typeof api.loadAdminFinance === 'function') await api.loadAdminFinance({ silent: false });
      else api.render();
      api.showToast(
        enabled
          ? '회원에게 다시 보여요. 입금 안내에 바로 나와요 👀'
          : '숨김 처리했어요. 입금 안내에서 바로 빠져요 🔒',
        'success'
      );
    } catch (error) {
      api.showToast(error?.message || '표시 설정을 바꾸지 못했어요.', 'warning');
    }
  }

  async function savePayoutDestination(event) {
    const api = wrapCore();
    if (!api) return;
    const form = event.target;
    const values = Object.fromEntries(new FormData(form).entries());
    try {
      await api.adminRequest('upsert_payout_destination', {
        destination_id: values.destination_id || null,
        destination_type: values.destination_type,
        label: values.label,
        bank_name: values.bank_name,
        account_holder: values.account_holder,
        account_number: values.account_number,
        usdt_network: values.usdt_network || 'TRC20',
        usdt_address: values.usdt_address,
        qr_asset_path: values.qr_asset_path,
        memo: values.memo,
        guidance_text: values.guidance_text,
        change_reason: values.change_reason,
        enabled: form.querySelector('[name="enabled"]')?.checked !== false
      });
      form.reset();
      const enabled = form.querySelector('[name="enabled"]');
      if (enabled) enabled.checked = true;
      const network = form.querySelector('[name="usdt_network"]');
      if (network && !network.value) network.value = 'TRC20';
      if (typeof api.loadAdminFinance === 'function') await api.loadAdminFinance({ silent: false });
      else api.render();
      api.showToast('✅ 회원 입금 안내를 저장했어요. 주소 추적 ID는 그대로 두고 버전만 올렸어요.', 'success');
    } catch (error) {
      api.showToast(error?.message || '입금 안내를 저장하지 못했어요.', 'warning');
    }
  }

  function fillPayoutDestination(id) {
    const api = wrapCore();
    if (!api) return;
    const item = (api.getState().adminFinance?.destinations || []).find((row) => String(row.id) === String(id));
    const form = document.getElementById('payoutDestinationForm');
    if (!item || !form) return;
    form.destination_id.value = item.id || '';
    form.destination_type.value = item.destination_type || 'bank';
    form.label.value = item.label || '';
    form.bank_name.value = item.bank_name || '';
    form.account_holder.value = item.account_holder || '';
    form.account_number.value = '';
    form.usdt_network.value = item.usdt_network || 'TRC20';
    form.usdt_address.value = '';
    form.qr_asset_path.value = item.qr_asset_path || '';
    form.memo.value = item.memo || '';
    form.guidance_text.value = item.guidance_text || '';
    form.change_reason.value = '';
    const enabled = form.querySelector('[name="enabled"]');
    if (enabled) enabled.checked = item.enabled !== false;
    api.showToast(item.has_account_number || item.has_usdt_address
      ? '📝 선택한 입금 안내를 수정 칸에 넣었어요. 원문은 바꿀 때만 다시 적어요.'
      : '📝 선택한 입금 안내를 수정 칸에 넣었어요.', 'info');
  }

  async function resetMemberSecurityPin(event) {
    const api = wrapCore();
    if (!api) return;
    const values = Object.fromEntries(new FormData(event.target).entries());
    try {
      await api.adminRequest('reset_security_pin', { user_id: values.user_id, reason: values.reason });
      event.target.reset();
      if (typeof api.loadAdminFinance === 'function') await api.loadAdminFinance({ silent: false });
      api.showToast('✅ 보안 PIN을 재설정했어요. 원문은 보지 않았고, 회원이 다시 만들어요.', 'success');
    } catch (error) {
      api.showToast(error?.message || '보안 PIN을 재설정하지 못했어요.', 'warning');
    }
  }

  async function completeWithdrawal(id) {
    const api = core();
    if (!api || !id) return true;
    if (!window.confirm('지금 바로 완료할까요? 회원 잔액과 내역이 서버에서 바뀝니다.')) return true;
    try {
      await api.adminRequest('withdraw_complete', { withdrawal_id: id });
      await api.loadAdminFinance({ silent: true });
      api.render();
      api.showToast('✅ 출금을 바로 완료했어요. 회원 잔액이 서버에서 바뀌었어요.', 'success');
    } catch (error) {
      api.showToast(api.friendlyAdminError(error), api.isUnsupportedAction(error) ? 'warning' : 'error');
    }
    return true;
  }

  async function submitNodeForm(event) {
    const api = core();
    if (!api) return false;
    event.preventDefault();
    const form = event.target;
    const values = api.formValues(form);
    const spec = readFormSpec(form);
    const choiceA = values.choice_a_ko || values.choice_1 || spec.choices[0] || '';
    const choiceB = values.choice_b_ko || values.choice_2 || spec.choices[1] || '';
    if (![choiceA, choiceB].every((item) => String(item || '').trim())) {
      api.showToast('보기 두 개를 모두 적어 주세요.', 'warning');
      return true;
    }
    const brands = api.adminBrandViews();
    const brand = brands.find((item) => String(item.id) === String(values.partner_brand_id));
    const band = String(values.tier_band || '소액');
    const assignChecked = Boolean(form.querySelector('[name="requires_assign"]')?.checked);
    const payload = {
      node_id: values.node_id || undefined,
      partner_brand_id: values.partner_brand_id,
      partner_slug: values.partner_slug || brand?.slug || '',
      title_ko: values.title_ko,
      description_ko: values.description_ko,
      node_family: values.node_family,
      difficulty: values.difficulty,
      estimated_seconds: Number(values.estimated_seconds),
      stake_krw: spec.stake,
      stipend_krw: spec.stipend,
      daily_cap: spec.slots,
      daily_capacity: spec.slots,
      reward_min: spec.stipend,
      reward_max: spec.stipend,
      tier_band: band,
      requires_assign: assignChecked,
      is_trial: band === '체험',
      question_image_path: spec.photos[0] || values.question_image_path || '',
      question_prompt_ko: values.question_prompt_ko || '',
      choice_a_ko: choiceA,
      choice_b_ko: choiceB,
      correct_choice: values.correct_choice === 'b' || spec.answer === 2 ? 'b' : 'a'
    };
    try {
      if (values.node_id) {
        await api.adminRequest('update_node', payload);
        api.showToast('✅ 업무 카드 수정을 저장했어요.', 'success');
      } else {
        await api.adminRequest('create_node', payload);
        api.showToast('✅ 업무 카드를 등록했어요. 회원 공개는 따로 눌러 주세요.', 'success');
      }
      api.closeModal();
      await api.loadAdminCatalog({ silent: false });
    } catch (error) {
      api.showToast(error.message || '업무 카드를 저장하지 못했어요.', 'error');
    }
    return true;
  }

  function renderOverview() {
    const api = core();
    if (!api) return null;
    const state = api.getState();
    const reviews = Array.isArray(state.adminReviews) ? state.adminReviews : [];
    const pending = reviews.filter((item) => ['submitted', 'review_pending'].includes(item.status));
    const approvedToday = reviews
      .filter((item) => item.status === 'approved' && item.updated_at && new Date(item.updated_at).toDateString() === new Date().toDateString())
      .reduce((sum, item) => sum + Number(item.reward_amount || 0), 0);
    const queueRows = pending.slice(0, 5).map((item) => {
      const when = item.updated_at || item.created_at;
      const wait = when ? Math.max(0, Math.round((Date.now() - Date.parse(when)) / 60000)) : 0;
      return `<tr><td><strong>${esc(item.member_name)}</strong><br><span style="color:var(--muted);font-size:11px">${esc(item.member_public_id || '')}</span></td><td>${esc(item.company_name)} · ${esc(item.node_title)}</td><td>${wait < 1 ? '방금' : `${wait}분`}</td><td>${money(item.reward_amount)}</td><td><button class="small-button primary" data-nav="reviews">확인</button></td></tr>`;
    }).join('');
    const queueBody = queueRows || `<tr><td colspan="5"><div class="empty-state compact"><div class="empty-icon">${icon('clipboard-check', 22)}</div><strong>검수 대기 업무가 없어요.</strong><p>회원 제출이 들어오면 이곳에 표시됩니다.</p></div></td></tr>`;
    const brands = api.adminBrandViews().slice(0, 5).map((company) => `<div class="company-row"><div class="company-info"><strong>${esc(company.name)}</strong><small>${esc(company.category || '')}</small></div><span class="pill ${company.verified ? 'ok' : 'wait'}">${company.verified ? '공개 가능' : '확인 대기'}</span></div>`).join('')
      || '<div class="empty-state compact"><strong>등록된 협력사가 없습니다.</strong></div>';
    return `<div class="admin-stat-grid"><div class="admin-stat"><p>가입 회원</p><strong>${state.adminMembersContract ? state.adminMemberTotal : '—'}</strong><span>${state.adminMembersContract ? '서버 조회 기준' : '운영 서버에서 아직 받지 못함'}</span></div><div class="admin-stat"><p>오늘 처리 업무</p><strong>${reviews.filter((item) => item.updated_at && new Date(item.updated_at).toDateString() === new Date().toDateString()).length}</strong><span>실제 업무 기록 기준</span></div><div class="admin-stat"><p>검수 대기</p><strong>${state.adminReviewPendingCount}</strong><span style="color:var(--gold)">운영자 확인 필요</span></div><div class="admin-stat"><p>오늘 확정 보상</p><strong>${money(approvedToday)}</strong><span>검수 완료 기준</span></div></div><div class="admin-layout"><div><div class="admin-card"><div class="admin-card-head"><div><h3>오늘의 운영 흐름</h3><p>서버에 기록된 업무 상태를 기준으로 확인합니다.</p></div><span class="status-badge">${icon('activity', 13)} 정상</span></div><div class="chart-wrap" style="padding:0;height:250px"><canvas id="adminChart" aria-label="운영 현황"></canvas></div></div><div class="admin-card"><div class="admin-card-head"><div><h3>검수 대기 업무</h3><p>승인하면 회원의 근무 내역과 지갑에 바로 반영됩니다.</p></div><button class="text-link" data-nav="reviews">전체보기</button></div><div class="table-wrap"><table><thead><tr><th>사원</th><th>협력사·근무</th><th>대기시간</th><th>예상 수당</th><th></th></tr></thead><tbody>${queueBody}</tbody></table></div></div></div><div><div class="admin-card"><div class="admin-card-head"><div><h3>기업 확인 현황</h3><p>협력 자료 승인 상태를 기준으로 회원 공개 여부를 관리합니다.</p></div><button class="text-link" data-nav="companies">관리</button></div>${brands}</div><div class="admin-card"><div class="admin-card-head"><div><h3>운영자가 확인할 일</h3><p>회원에게 노출되는 상태를 실제 기록과 함께 관리합니다.</p></div></div><div class="notice"><span style="color:var(--gold)">${icon('clipboard-check', 17)}</span><div><strong>${state.adminReviewPendingCount}건의 검수 대기</strong><br>검수 화면에서 승인 또는 반려를 눌러 주세요.</div></div><button class="secondary-button" data-nav="reviews" style="width:100%;margin-top:12px">검수 목록 열기</button></div></div></div>`;
  }

  function renderMembers() {
    const api = core();
    if (!api) return null;
    const state = api.getState();
    const members = Array.isArray(state.adminMembers) ? state.adminMembers : [];
    const filter = state.adminMemberFilter || 'all';
    const error = state.adminMembersError
      ? `<div class="notice" style="margin-bottom:16px"><span style="color:var(--gold)">${icon('triangle-alert', 17)}</span><div>${esc(state.adminMembersError)}</div></div>`
      : '';
    const rows = members.map((item) => {
      const status = item.status || 'pending';
      const ok = status === 'active';
      const memberId = esc(item.id || item.user_id || '');
      const wallet = item.wallet || {};
      return `<tr>
        <td><strong>${esc(item.public_id || '-')}</strong></td>
        <td>${esc(maskPersonName(item.legal_name || item.display_name || '퍼뜩 회원'))}</td>
        <td>${esc(maskEmail(item.email))}</td>
        <td>${esc(maskPhone(item.phone || item.phone_e164))}</td>
        <td>${esc(badgeTier(item.member_tier))}</td>
        <td>${item.last_login_at ? displayTime(item.last_login_at) : '-'}</td>
        <td>${esc(maskIp(item.last_login_ip))}</td>
        <td><strong>${money(wallet.available)}</strong></td>
        <td><strong>${money(wallet.work)}</strong></td>
        <td><strong>${money(wallet.held)}</strong></td>
        <td><span class="pill ${ok ? 'ok' : 'wait'}">${esc(memberStatusLabel(status))}</span></td>
        <td><div class="action-row"><button class="small-button" data-action="member-detail" data-member-id="${memberId}">자세히</button><button class="small-button primary" data-action="member-credit" data-member-id="${memberId}">잔액 입금</button><button class="small-button" data-action="member-debit" data-member-id="${memberId}">잔액 차감</button></div></td>
      </tr>`;
    }).join('');
    const body = rows || `<tr><td colspan="12"><div class="empty-state compact"><div class="empty-icon">${icon('users', 22)}</div><strong>${state.adminMembersLoading ? '회원 정보를 불러오고 있어요.' : '표시할 회원이 없어요.'}</strong><p>검색은 사원번호·이름·이메일·휴대폰을 기준으로 합니다.</p></div></td></tr>`;
    const memberCards = members.map((item) => {
      const status = item.status || 'pending';
      const ok = status === 'active';
      const memberId = esc(item.id || item.user_id || '');
      const wallet = item.wallet || {};
      return `<article class="admin-mobile-card"><div class="admin-mobile-top"><strong>${esc(item.public_id || '-')}</strong><span class="pill ${ok ? 'ok' : 'wait'}">${esc(memberStatusLabel(status))}</span></div><p>${esc(maskPersonName(item.legal_name || item.display_name || '퍼뜩 회원'))} · ${esc(badgeTier(item.member_tier))}</p><p>출금 ${money(wallet.available)} · 업무 ${money(wallet.work)}</p><div class="action-row"><button class="small-button" data-action="member-detail" data-member-id="${memberId}">자세히</button><button class="small-button primary" data-action="member-credit" data-member-id="${memberId}">잔액 입금</button></div></article>`;
    }).join('');
    return `<div class="section-heading" style="margin-top:0"><div><h1 class="page-title">회원 관리</h1><p class="page-copy">출금 가능·업무 진행·잠금 금액을 나눠 확인해요. 목록의 개인정보는 가려져 있어요.</p></div><button class="secondary-button" data-action="refresh-members" ${state.adminMembersLoading ? 'disabled' : ''}>${icon('refresh-cw', 16)} ${state.adminMembersLoading ? '불러오는 중…' : '새로고침'}</button></div>${error}<div class="admin-card"><form id="memberSearchForm" class="search-bar"><input id="memberSearchInput" value="${esc(state.adminMemberQuery || '')}" placeholder="사원번호, 이름, 이메일, 휴대폰" /><button class="small-button primary" type="submit">찾기</button></form><div class="filter-row"><button class="filter-button ${filter === 'all' ? 'active' : ''}" data-member-filter="all">전체${state.adminMembersContract ? ` ${state.adminMemberTotal}` : ''}</button><button class="filter-button ${filter === 'active' ? 'active' : ''}" data-member-filter="active">활동 중</button><button class="filter-button ${filter === 'pending' ? 'active' : ''}" data-member-filter="pending">확인 중</button><button class="filter-button ${filter === 'blocked' ? 'active' : ''}" data-member-filter="blocked">차단</button></div><div class="table-wrap"><table><thead><tr><th>사원번호</th><th>이름</th><th>이메일</th><th>휴대폰</th><th>사원증</th><th>최근 접속</th><th>접속 주소</th><th>출금 가능</th><th>업무 진행</th><th>잠금</th><th>상태</th><th></th></tr></thead><tbody>${body}</tbody></table></div>${mobileCards(memberCards)}</div>`;
  }

  function renderNotifications() {
    return `<div class="section-heading" style="margin-top:0"><div><h1 class="page-title">공지·알림</h1><p class="page-copy">회원에게 보여줄 안내와 실제 업무 배정 알림을 관리합니다.</p></div><button class="primary-button" data-action="new-notice">${icon('plus', 16)} 새 안내 만들기</button></div><div class="admin-card"><div class="notice"><span style="color:var(--emerald)">${icon('bell-ring', 17)}</span><div><strong>알림 원칙</strong><br>실제 배정·검수·입출금 상태를 바탕으로 안내하고, 가짜 마감이나 확정 수익 문구는 사용하지 않습니다.</div></div><div style="margin-top:18px"><div class="company-row"><div class="company-logo" style="background:var(--emerald)">${icon('target', 17)}</div><div class="company-info"><strong>특정 회원 업무 배정</strong><small>실제 업무 카드를 배정한 뒤에만 알림을 보냅니다.</small></div><button class="small-button primary" data-action="assign-task">배정하기</button></div><div class="company-row"><div class="company-logo" style="background:var(--gold)">${icon('megaphone', 17)}</div><div class="company-info"><strong>특정 회원 알림</strong><small>사원번호로 회원을 골라 안내를 보냅니다.</small></div><button class="small-button" data-action="target-notice">보내기</button></div><div class="company-row"><div class="company-logo" style="background:#5d4fb2">${icon('users', 17)}</div><div class="company-info"><strong>전체 공지</strong><small>서비스 점검·근무 안내·지원금 정책</small></div><button class="small-button" data-action="new-notice">작성</button></div></div></div>`;
  }

  function renderSettings() {
    const api = core();
    if (!api) return null;
    const state = api.getState();
    const campaign = state.adminCampaigns[0] || {};
    const copy = state.adminMemberCopy || campaign.member_copy || DEFAULT_MEMBER_COPY;
    const contractNote = state.adminCampaignsContract === false
      ? `<p class="admin-hint">지원금 설정을 아직 서버에 연결하지 못했어요. 저장 버튼을 눌러도 반영되지 않아요.</p>`
      : '';
    const limits = sortedTierLimits(state.adminTierDailyLimits);
    const limitNote = state.adminTierDailyLimitsContract === false
      ? `<p class="admin-hint">등급별 하루 한도를 서버에서 아직 불러오지 못했어요. 저장해도 반영되지 않아요.</p>`
      : (state.adminTierDailyLimitsError ? `<p class="admin-hint">${esc(state.adminTierDailyLimitsError)}</p>` : '');
    const limitRows = limits.map((row) => {
      const unlimited = row.unlimited === true;
      const value = unlimited || row.daily_limit == null ? '' : String(row.daily_limit);
      return `<div class="field"><label for="tierLimit-${esc(row.tier)}">${esc(row.tier)}</label><input id="tierLimit-${esc(row.tier)}" type="number" min="1" max="365" step="1" inputmode="numeric" ${unlimited ? 'disabled' : ''} value="${esc(value)}" placeholder="${unlimited ? '무제한' : '서버 값'}" /><label class="check-row" style="margin-top:8px"><input id="tierUnlimited-${esc(row.tier)}" type="checkbox" ${unlimited ? 'checked' : ''} /> <span>무제한</span></label></div>`;
    }).join('');
    return `<div class="section-heading" style="margin-top:0"><div><h1 class="page-title">운영 설정</h1><p class="page-copy">처음 가입한 회원에게 주는 지원금과, 화면에 보여줄 안내 문구를 저장해요.</p></div><button class="primary-button" data-action="save-settings">설정 저장</button></div>${contractNote}<div class="admin-card"><div class="admin-card-head"><div><h3>신규 회원 업무 지원금</h3><p>기존 지급 기록은 변경하지 않고, 앞으로 가입하는 회원에게만 적용됩니다.</p></div><span class="pill ${campaign.enabled === false ? 'wait' : 'ok'}">${campaign.enabled === false ? '중지' : '사용 중'}</span></div><div class="form-grid"><div class="field"><label>기본 지급 금액</label><input id="supportGrantInput" type="number" value="${Number(campaign.amount ?? state.supportGrant)}" min="0" step="1000" /></div><div class="field"><label>지급 시점</label><select id="supportTriggerInput"><option value="signup" ${campaign.trigger_type === 'signup' ? 'selected' : ''}>가입 완료 후</option><option value="email_verified" ${campaign.trigger_type === 'email_verified' ? 'selected' : ''}>이메일 인증 후</option><option value="phone_verified" ${campaign.trigger_type === 'phone_verified' ? 'selected' : ''}>휴대폰 인증 후</option><option value="kyc_approved" ${campaign.trigger_type === 'kyc_approved' ? 'selected' : ''}>본인확인 완료 후</option></select></div><div class="field"><label>사용 범위</label><select id="supportScopeInput"><option value="work_only" ${campaign.usage_scope === 'work_only' ? 'selected' : ''}>업무 전용</option><option value="withdrawable" ${campaign.usage_scope === 'withdrawable' ? 'selected' : ''}>출금 가능</option></select></div><div class="field"><label>유효기간(일)</label><input id="supportExpireInput" type="number" min="0" value="${Number(campaign.expires_in_days || 0)}" /></div><div class="field"><label>캠페인 상태</label><select id="supportEnabledInput"><option value="true" ${campaign.enabled !== false ? 'selected' : ''}>활성화</option><option value="false" ${campaign.enabled === false ? 'selected' : ''}>중지</option></select></div><div class="field full"><label>회원에게 보여줄 안내</label><textarea id="supportCopyInput" rows="3">${esc(copy)}</textarea></div></div></div><div class="admin-card" style="margin-top:18px"><div class="admin-card-head"><div><h3>등급별 하루 업무 한도</h3><p>서버에 저장된 횟수를 보여주고, 저장하면 회원 화면과 출근 제한이 같이 바뀌어요. 숫자는 이 화면에 고정되어 있지 않아요.</p></div><button class="small-button primary" type="button" data-action="save-tier-daily-limits">한도 저장</button></div>${limitNote}<form id="tierDailyLimitForm" class="form-grid" style="margin-top:12px">${limitRows}</form></div>`;
  }

  function historyRows(items, emptyText, renderRow) {
    if (!Array.isArray(items) || !items.length) return `<div class="history-empty">${esc(emptyText)}</div>`;
    return `<div class="history-list">${items.map(renderRow).join('')}</div>`;
  }

  function memberHistoriesHtml(pack) {
    const ledger = Array.isArray(pack.ledger) ? pack.ledger : [];
    const deposits = Array.isArray(pack.deposits) ? pack.deposits : [];
    const withdrawals = Array.isArray(pack.withdrawals) ? pack.withdrawals : [];
    const runs = Array.isArray(pack.task_runs) ? pack.task_runs : [];
    const ledgerRows = historyRows(ledger.length ? ledger : deposits.map((item) => ({
      ...item,
      entry_type: item.status === 'rejected' ? 'admin_debit' : 'deposit_posted',
      bucket: 'available',
      created_at: item.created_at
    })), '입금·차감 원장이 아직 없어요.', (item) => {
      const kind = ledgerKind(item.entry_type) || (Number(item.amount) < 0 ? '차감' : '입금');
      return `<div class="history-row"><div><strong>${esc(kind)}</strong><span>${esc(bucketLabel(item.bucket))}</span></div><strong>${money(item.amount)}</strong><span>${esc(displayTime(item.created_at))}</span></div>`;
    });
    const withdrawRows = historyRows(withdrawals, '출금 이력이 아직 없어요.', (item) => {
      const kind = item.include_principal === true ? '원금포함' : '수당만';
      return `<div class="history-row"><div><strong>${esc(kind)}</strong><span>${esc(financeStatusLabel(item.status))}</span></div><strong>${money(item.amount)}</strong><span>${esc(displayTime(item.completed_at || item.created_at))}</span></div>`;
    });
    const runRows = historyRows(runs, '근무 실행 이력이 아직 없어요.', (item) => {
      const photos = reviewPhotos(item);
      const pick = choiceLine(item, item.member_choice);
      const photoHtml = photos.length
        ? `<div class="history-photos">${photos.map((src) => `<a href="${esc(src)}" target="_blank" rel="noopener"><img src="${esc(src)}" alt="근무 사진" /></a>`).join('')}</div>`
        : '<span class="history-muted">제출 사진 없음</span>';
      return `<div class="history-run"><div class="history-row"><div><strong>${esc(item.node_title || '근무')}</strong><span>${esc(taskStatusLabel(item.status))}</span></div><strong>${money(item.stipend_amount ?? item.reward_amount)}</strong><span>${esc(displayTime(item.completed_at || item.created_at))}</span></div>${pick ? `<p class="history-muted">고른 보기: ${esc(pick)}</p>` : ''}${photoHtml}</div>`;
    });
    return `<div id="memberDetailHistories" class="member-history">
      <section><h3>입금·차감 원장</h3>${ledgerRows}</section>
      <section><h3>출금 이력</h3>${withdrawRows}</section>
      <section><h3>근무 실행 이력</h3>${runRows}</section>
    </div>`;
  }

  function hydrateMemberFields(pack) {
    const root = document.querySelector('[data-modal="member-detail"]');
    if (!root || !pack) return;
    const profile = pack.profile || pack;
    const priv = pack.private_profile || {};
    const auth = pack.auth || {};
    const wallet = (pack.wallet_summary && typeof pack.wallet_summary === 'object') ? pack.wallet_summary : {};
    const wallets = Array.isArray(pack.wallets) ? pack.wallets : [];
    const bucket = (name) => wallets.find((item) => item.bucket === name) || {};
    const fields = {
      '이름': displayText(profile.display_name),
      '이메일': displayText(priv.email_snapshot || auth.email || pack.email),
      '휴대폰': displayText(priv.phone_e164 || pack.phone),
      '사원증': badgeTier(profile.member_tier),
      '상태': memberStatusLabel(profile.status || 'pending'),
      '가입일': displayTime(profile.created_at),
      '최근 접속': displayTime(priv.last_login_at || auth.last_sign_in_at),
      '접속 주소': displayText(priv.last_login_ip),
      '본인확인': kycStatusLabel(profile.kyc_status),
      '추천 수': String(Array.isArray(pack.referrals) ? pack.referrals.length : Number(pack.referral_count || 0)),
      '오늘 작업(사용/한도)': memberQuotaText(pack.daily_task_quota),
      '등급 기본 한도': quotaLimitText(pack.daily_task_quota?.tier_limit, Number(pack.daily_task_quota?.tier_limit || 0) <= 0 && pack.daily_task_quota != null),
      '오늘 사용': pack.daily_task_quota ? String(Number(pack.daily_task_quota.used_today || 0)) : '확인 중',
      '오늘 남은 횟수': pack.daily_task_quota?.unlimited ? '무제한' : (pack.daily_task_quota ? String(Number(pack.daily_task_quota.remaining_today || 0)) : '확인 중'),
      '회원별 예외': pack.daily_task_limit_override == null && pack.profile?.daily_task_limit_override == null
        ? '없음(등급 기본)'
        : quotaLimitText(pack.daily_task_limit_override ?? pack.profile?.daily_task_limit_override, Number(pack.daily_task_limit_override ?? pack.profile?.daily_task_limit_override) === 0),
      '추가 횟수': String(Number(pack.extra_task_starts ?? pack.profile?.extra_task_starts ?? 0)),
      '출금 가능': money(wallet.available ?? bucket('available').available_amount),
      '업무 진행': money(wallet.work ?? bucket('work_balance').available_amount),
      '잠금 금액': money(wallet.work_held ?? bucket('work_balance').held_amount),
      '지원금': money(wallet.support ?? bucket('support_grant').available_amount),
    };
    root.querySelectorAll('.detail-list > div').forEach((row) => {
      const key = row.querySelector('span')?.textContent;
      const strong = row.querySelector('strong');
      if (key && strong && Object.prototype.hasOwnProperty.call(fields, key)) strong.textContent = fields[key];
    });
  }

  let hydrateTimer = 0;
  function scheduleHydrate() {
    hydrateMemberDetail();
    if (currentMemberPack()) return;
    window.clearTimeout(hydrateTimer);
    hydrateTimer = window.setTimeout(hydrateMemberDetail, 180);
  }

  function hydrateMemberDetail() {
    const root = document.querySelector('[data-modal="member-detail"]');
    if (!root) return;
    const pack = currentMemberPack();
    if (pack && (pack.profile || pack.task_runs || pack.ledger || pack.withdrawals)) hydrateMemberFields(pack);
    const host = root.querySelector('#memberDetailHistories');
    if (!host) return;
    const html = memberHistoriesHtml(pack);
    const box = document.createElement('div');
    box.innerHTML = html;
    const next = box.firstElementChild;
    if (next) host.replaceWith(next);
  }

  const packingIds = new Set();
  async function ensureMemberPack() {
    const api = wrapCore();
    if (!api || api.getState().modal !== 'member-detail') return;
    const member = api.getState().modalPayload || api.getState().adminMemberDetail || {};
    const id = member.id || member.user_id;
    if (!id) return;
    if (memberPacks.has(String(id))) {
      scheduleHydrate();
      return;
    }
    if (packingIds.has(String(id))) {
      scheduleHydrate();
      return;
    }
    packingIds.add(String(id));
    try {
      const result = await api.adminRequest('get_member', { user_id: id });
      rememberMemberPack(result.member || result);
    } catch (_) {
    } finally {
      packingIds.delete(String(id));
      scheduleHydrate();
    }
  }

  function memberQuotaText(quota) {
    if (!quota) return '확인 중';
    if (quota.unlimited) return '무제한';
    return `${Number(quota.used_today || 0)} / ${Number(quota.daily_limit || 0)}회`;
  }

  function renderMemberDetail() {
    const api = core();
    if (!api) return null;
    const member = api.getState().modalPayload || api.getState().adminMemberDetail || {};
    const wallet = member.wallet || {};
    const pack = currentMemberPack();
    const id = member.id || member.user_id || '';
    const piiNote = pack && pack.pii_access === false
      ? `<div class="notice" style="margin-bottom:12px"><span style="color:var(--gold)">${icon('shield-alert', 17)}</span><div>전체 개인정보는 최고 운영자만 볼 수 있어요.</div></div>`
      : '';
    const quota = member.daily_task_quota || pack.daily_task_quota || {};
    const override = member.daily_task_limit_override ?? pack.daily_task_limit_override ?? pack.profile?.daily_task_limit_override ?? null;
    const extra = Number(member.extra_task_starts ?? pack.extra_task_starts ?? pack.profile?.extra_task_starts ?? 0);
    const useDefault = override == null;
    const memberUnlimited = !useDefault && Number(override) === 0;
    const overrideValue = useDefault || memberUnlimited ? '' : String(override);
    const remainingText = quota.unlimited ? '무제한' : (quota.remaining_today == null ? '확인 중' : String(Number(quota.remaining_today)));
    return `<div class="modal-backdrop" data-modal="member-detail"><div class="modal member-detail-modal"><div class="modal-head"><div><h2>회원 자세히</h2><p>${esc(member.public_id || '사원번호 확인 중')}</p></div><button class="icon-button" data-action="close-modal">${icon('x', 18)}</button></div><div class="modal-body">${piiNote}<div class="detail-list"><div><span>이름</span><strong>${esc(displayText(member.display_name))}</strong></div><div><span>이메일</span><strong>${esc(displayText(member.email))}</strong></div><div><span>휴대폰</span><strong>${esc(displayText(member.phone || member.phone_e164))}</strong></div><div><span>사원증</span><strong>${esc(badgeTier(member.member_tier))}</strong></div><div><span>상태</span><strong>${esc(memberStatusLabel(member.status || 'pending'))}</strong></div><div><span>가입일</span><strong>${esc(displayTime(member.created_at))}</strong></div><div><span>최근 접속</span><strong>${esc(displayTime(member.last_login_at))}</strong></div><div><span>접속 주소</span><strong>${esc(displayText(member.last_login_ip))}</strong></div><div><span>본인확인</span><strong>${esc(kycStatusLabel(member.kyc_status))}</strong></div><div><span>추천 수</span><strong>${Number(member.referral_count || 0)}</strong></div><div><span>오늘 작업(사용/한도)</span><strong>${esc(memberQuotaText(quota))}</strong></div><div><span>등급 기본 한도</span><strong>${esc(quotaLimitText(quota.tier_limit, Number(quota.tier_limit || 0) <= 0 && quota.tier_limit != null))}</strong></div><div><span>오늘 사용</span><strong>${quota.used_today == null ? '확인 중' : Number(quota.used_today)}</strong></div><div><span>오늘 남은 횟수</span><strong>${esc(remainingText)}</strong></div><div><span>회원별 예외</span><strong>${esc(useDefault ? '없음(등급 기본)' : quotaLimitText(override, memberUnlimited))}</strong></div><div><span>추가 횟수</span><strong>${extra}</strong></div><div><span>지원금</span><strong>${money(wallet.support)}</strong></div><div><span>출금 가능</span><strong>${money(wallet.available)}</strong></div><div><span>업무 진행</span><strong>${money(wallet.work)}</strong></div><div><span>잠금 금액</span><strong>${money(wallet.held)}</strong></div></div><form id="memberTaskQuotaForm" class="admin-card" style="margin-top:16px"><input type="hidden" name="user_id" value="${esc(id)}" /><div class="admin-card-head"><div><h3>이 회원 하루 한도 예외</h3><p>비어 있으면 등급 기본값을 씁니다. 저장하면 서버 한도와 출근 제한이 같이 바뀌어요.</p></div></div><div class="form-grid"><label class="check-row field full"><input name="use_tier_default" type="checkbox" ${useDefault ? 'checked' : ''} /> <span>등급 기본 한도 쓰기</span></label><div class="field"><label>회원 한도</label><input name="daily_limit_override" type="number" min="1" max="365" step="1" ${useDefault || memberUnlimited ? 'disabled' : ''} value="${esc(overrideValue)}" /></div><label class="check-row field"><input name="member_unlimited" type="checkbox" ${memberUnlimited ? 'checked' : ''} ${useDefault ? 'disabled' : ''} /> <span>무제한</span></label><div class="field"><label>추가 횟수</label><input name="extra_task_starts" type="number" min="0" max="365" step="1" value="${extra}" /></div></div><div class="modal-actions"><button class="primary-button" type="submit">예외 저장</button></div></form>${memberHistoriesHtml(pack)}<div class="action-row" style="margin-top:16px"><button class="small-button primary" data-action="member-credit" data-member-id="${esc(id)}">잔액 입금</button><button class="small-button" data-action="member-debit" data-member-id="${esc(id)}">잔액 차감</button><button class="small-button" data-action="member-block" data-member-id="${esc(id)}" data-member-status="blocked">차단</button><button class="small-button" data-action="member-block" data-member-id="${esc(id)}" data-member-status="active">차단 해제</button><button class="small-button" data-action="member-tier" data-member-id="${esc(id)}">등급 변경</button><button class="small-button" data-action="member-reset" data-member-id="${esc(id)}">비밀번호 재설정</button><button class="small-button primary" data-action="assign-task" data-member-id="${esc(id)}">업무 배정</button><button class="small-button" data-action="target-notice" data-member-id="${esc(id)}">알림</button></div></div></div></div>`;
  }

  function renderMemberTier() {
    const api = core();
    if (!api) return null;
    const member = api.getState().modalPayload || api.getState().adminMemberDetail || {};
    const current = badgeTier(member.member_tier || '라인');
    const options = BADGE_TIERS.includes(current) ? BADGE_TIERS : [current, ...BADGE_TIERS];
    return `<div class="modal-backdrop" data-modal="member-tier"><div class="modal"><div class="modal-head"><div><h2>사원증 등급 변경</h2><p>${esc(member.public_id || member.display_name || '사원')}</p></div><button class="icon-button" data-action="close-modal" aria-label="닫기">${icon('x', 18)}</button></div><div class="modal-body"><form id="memberTierForm"><input type="hidden" name="user_id" value="${esc(member.id || member.user_id || '')}" /><div class="notice"><span style="color:var(--emerald)">${icon('badge-check', 17)}</span><div>선택한 등급은 서버에 바로 저장됩니다. 지금 사원증: <strong>${esc(current)}</strong></div></div><div class="form-grid" style="margin-top:16px"><div class="field full"><label for="memberTierSelect">사원증</label><select id="memberTierSelect" name="member_tier" required>${options.map((tier) => `<option value="${esc(tier)}" ${tier === current ? 'selected' : ''}>${esc(tier)}</option>`).join('')}</select></div><div class="field full"><label for="memberTierReason">사유 (선택)</label><textarea id="memberTierReason" name="reason" rows="2" maxlength="240" placeholder="운영 기록에 남길 사유"></textarea></div></div><div class="modal-actions"><button class="secondary-button" type="button" data-action="close-modal">취소</button><button class="primary-button" type="submit">등급 저장</button></div></form></div></div></div>`;
  }

  function renderAssignForm() {
    const api = core();
    if (!api) return null;
    const preset = api.getState().modalPayload || {};
    const brands = api.adminBrandViews();
    const nodeRows = api.adminNodeViews();
    return `<div class="modal-backdrop" data-modal="assign-task"><div class="modal"><div class="modal-head"><div><h2>특정 회원 업무 배정</h2><p>실제로 배정한 뒤에만 회원 화면에 우선 업무가 나타납니다.</p></div><button class="icon-button" data-action="close-modal">${icon('x', 18)}</button></div><div class="modal-body"><form id="assignForm"><div class="form-grid"><div class="field"><label>사원번호</label>${memberPickerHtml(preset.id || preset.user_id, preset)}</div><div class="field"><label>협력사</label><select name="partner_brand_id">${brands.map((brand) => `<option value="${esc(brand.id)}">${esc(brand.name)}</option>`).join('')}</select></div><div class="field full"><label>업무 카드</label><select name="node_id" required>${nodeRows.map((node) => `<option value="${esc(node.id)}">${esc(node.title)}</option>`).join('') || '<option value="">등록된 업무 카드 없음</option>'}</select></div><div class="field"><label>수당(참고, 서버가 확정)</label><input name="reward_amount" type="number" min="0" value="0" /></div><div class="field"><label>예상시간(초)</label><input name="estimated_seconds" type="number" min="30" max="5400" value="60" /></div><div class="field"><label>노출 시작</label><input name="visible_from" type="datetime-local" /></div><div class="field"><label>노출 종료</label><input name="visible_until" type="datetime-local" /></div><div class="field full"><label>배정 사유</label><textarea name="reason" rows="2" required placeholder="배정 사유"></textarea></div><label class="check-row"><input name="notify" type="checkbox" checked /> <span>회원에게 배정 알림 보내기</span></label></div><div class="modal-actions"><button class="secondary-button" type="button" data-action="close-modal">취소</button><button class="primary-button" type="submit">배정하기</button></div></form></div></div></div>`;
  }

  function renderNoticeForm() {
    const api = core();
    if (!api) return null;
    const state = api.getState();
    const preset = state.modalPayload || {};
    const broadcast = state.modal === 'broadcast-notice';
    return `<div class="modal-backdrop" data-modal="notice-form"><div class="modal"><div class="modal-head"><div><h2>${broadcast ? '전체 공지' : '특정 회원 알림'}</h2><p>확정되지 않은 금액을 수익처럼 적지 마세요.</p></div><button class="icon-button" data-action="close-modal">${icon('x', 18)}</button></div><div class="modal-body"><form id="noticeForm"><input type="hidden" name="broadcast" value="${broadcast ? '1' : '0'}" /><div class="form-grid">${broadcast ? '' : `<div class="field"><label>사원번호</label>${memberPickerHtml(preset.id || preset.user_id, preset)}</div>`}<div class="field full"><label>제목</label><input name="title" required maxlength="80" placeholder="예: 우선 업무가 도착했어요" /></div><div class="field full"><label>내용</label><textarea name="body" required rows="4" placeholder="🎉 회원님에게 새로운 우선 업무가 배정됐어요."></textarea></div></div><div class="modal-actions"><button class="secondary-button" type="button" data-action="close-modal">취소</button><button class="primary-button" type="submit">보내기</button></div></form></div></div></div>`;
  }

  function renderCompanyForm() {
    const api = core();
    if (!api) return null;
    const brand = api.getState().modalPayload || {};
    const editing = Boolean(brand.id);
    return `<div class="modal-backdrop" data-modal="company-form"><div class="modal"><div class="modal-head"><div><h2>${editing ? '협력사 수정' : '협력사 등록'}</h2><p>법인명·분야·소개·자료·로고·사진을 서버에 저장합니다.</p></div><button class="icon-button" data-action="close-modal">${icon('x', 18)}</button></div><div class="modal-body"><form id="companyForm"><input type="hidden" name="brand_id" value="${esc(brand.id || '')}" /><div class="form-grid"><div class="field"><label>한국어 표시명</label><input name="display_name_ko" value="${esc(brand.display_name_ko || brand.name || '')}" ${editing ? 'readonly' : 'required'} /></div><div class="field"><label>법인명</label><input name="legal_name" value="${esc(brand.legal_name || '')}" ${editing ? '' : 'required'} /></div><div class="field"><label>분야</label><input name="category" value="${esc(brand.category || brand.label || '')}" ${editing ? '' : 'required'} /></div><div class="field"><label>영문 짧은 이름</label><input name="slug" value="${esc(brand.slug || '')}" placeholder="예: dhl" ${editing ? 'readonly' : ''} /></div><div class="field full"><label>한국어 소개</label><textarea name="description_ko" rows="3" maxlength="2000">${esc(brand.description_ko || brand.copy || '')}</textarea></div><div class="field full"><label>자료 주소</label><input name="source_url" value="${esc(brand.source_url || '')}" placeholder="자료 페이지 주소" /></div><div class="field full"><label>로고 파일 경로</label><input name="logo_asset_path" value="${esc(brand.logo_asset_path || '')}" placeholder="로고 파일 경로" /></div><div class="field full"><label>사진 파일 경로</label><input name="photo_asset_path" value="${esc(brand.photo_asset_path || '')}" placeholder="사진 파일 경로" /></div><div class="field full"><label>승인 메모</label><textarea name="verification_note" rows="3">${esc(brand.verification_note || '')}</textarea></div></div><div class="modal-actions"><button class="secondary-button" type="button" data-action="close-modal">취소</button><button class="primary-button" type="submit">${editing ? '수정 저장' : '등록 요청'}</button></div></form></div></div></div>`;
  }

  async function saveSettingsWithCopy() {
    const api = core();
    if (!api) return;
    const state = api.getState();
    const amount = Number(document.getElementById('supportGrantInput')?.value || 0);
    const copy = String(document.getElementById('supportCopyInput')?.value || '').trim() || DEFAULT_MEMBER_COPY;
    const payload = {
      campaign_id: state.adminCampaigns[0]?.id,
      amount,
      trigger_type: document.getElementById('supportTriggerInput')?.value,
      usage_scope: document.getElementById('supportScopeInput')?.value,
      expires_in_days: Number(document.getElementById('supportExpireInput')?.value || 0),
      enabled: document.getElementById('supportEnabledInput')?.value !== 'false'
    };
    try {
      if (payload.campaign_id) await api.adminRequest('update_campaign', payload);
      try {
        const saved = await api.adminRequest('save_member_copy', { copy });
        api.patchState({ adminMemberCopy: saved.copy || copy });
      } catch (_) {
        api.patchState({ adminMemberCopy: copy });
        api.showToast('안내 문구는 이 화면에만 남겼어요. 서버 저장은 다음에 다시 눌러 주세요.', 'warning');
      }
      const campaigns = await api.adminRequest('list_campaigns', {}).catch(() => null);
      if (campaigns?.campaigns) api.patchState({ adminCampaigns: campaigns.campaigns });
      api.showToast('✅ 설정을 저장했어요. 회원에게 보여줄 안내도 함께 저장했어요.', 'success');
      api.render();
    } catch (error) {
      api.showToast(api.friendlyAdminError(error), api.isUnsupportedAction(error) ? 'warning' : 'error');
    }
  }

  window.PUTDUK_ADMIN = {
    renderPage(page) {
      wrapCore();
      if (page === 'overview') return renderOverview();
      if (page === 'members') return renderMembers();
      if (page === 'finance') return renderFinance();
      if (page === 'nodes') return renderNodes();
      if (page === 'reviews') return renderReviews();
      if (page === 'motion') return renderMotion();
      if (page === 'notifications') return renderNotifications();
      if (page === 'settings') return renderSettings();
      return null;
    },
    renderModal(type) {
      wrapCore();
      if (type === 'node-form') return renderNodeForm();
      if (type === 'member-detail') return renderMemberDetail();
      if (type === 'member-tier') return renderMemberTier();
      if (type === 'assign-task') return renderAssignForm();
      if (type === 'notice-form' || type === 'broadcast-notice') return renderNoticeForm();
      if (type === 'company-form') return renderCompanyForm();
      if (type === 'payout-delete') return renderPayoutDeleteConfirm();
      return null;
    },
    afterRender() {
      wrapCore();
      bindPreview();
      bindMotionSliders();
      bindTierLimitToggles();
      bindMemberQuotaToggles();
      scheduleHydrate();
      ensureMemberPack();
      const api = core();
      const modal = api?.getState()?.modal;
      if (api && ['assign-task', 'notice-form', 'broadcast-notice'].includes(modal) && !(api.getState().adminMembers || []).length && !api.getState()._pickingMembers && typeof api.loadAdminMembers === 'function') {
        api.patchState({ _pickingMembers: true });
        api.loadAdminMembers({ silent: true }).then(() => {
          api.patchState({ _pickingMembers: false });
          if (['assign-task', 'notice-form', 'broadcast-notice'].includes(api.getState().modal)) api.render();
        }).catch(() => {
          api.patchState({ _pickingMembers: false });
        });
      }
    },
    async refreshPage() {
      const api = wrapCore();
      if (!api) return;
      const page = api.getState().adminPage;
      if (page === 'motion') await loadMotion({ silent: true });
      if (page === 'settings') {
        try {
          const result = await api.adminRequest('get_member_copy', {});
          api.patchState({ adminMemberCopy: result.copy || DEFAULT_MEMBER_COPY });
        } catch (_) {}
        await loadTierDailyLimits({ silent: true });
      }
    },
    handleClick(_event, target) {
      wrapCore();
      const action = target?.dataset?.action;
      if (action === 'create-review-run' || action === 'create-operator-deposit') {
        if (!seedEnabled()) {
          core()?.showToast('운영 화면에서는 가짜 검수·입금을 만들지 않아요.', 'warning');
          return true;
        }
        return false;
      }
      if (action === 'save-motion') {
        saveMotion();
        return true;
      }
      if (action === 'save-settings') {
        saveSettingsWithCopy();
        return true;
      }
      if (action === 'save-tier-daily-limits') {
        saveTierDailyLimits();
        return true;
      }
      if (action === 'withdraw-complete') {
        completeWithdrawal(target.dataset.withdrawalId);
        return true;
      }
      if (action === 'edit-payout-destination') {
        fillPayoutDestination(target.dataset.destinationId);
        return true;
      }
      if (action === 'toggle-payout-destination') {
        togglePayoutDestination(target.dataset.destinationId, target.dataset.enabled);
        return true;
      }
      if (action === 'delete-payout-destination') {
        const api = core();
        api?.openModal?.('payout-delete', { id: target.dataset.destinationId, destination_id: target.dataset.destinationId });
        return true;
      }
      if (action === 'confirm-payout-destination-delete') {
        deletePayoutDestination(target.dataset.destinationId);
        return true;
      }
      if (target?.dataset?.reviewAction === 'rework') {
        core()?.showToast('검수는 승인 또는 반려만 해요.', 'info');
        return true;
      }
      if (target?.dataset?.reviewAction === 'approved' && target.dataset.reviewId) {
        const item = (core()?.getState()?.adminReviews || []).find((row) => String(row.id) === String(target.dataset.reviewId));
        if (item && isHighValue(item) && !hasReviewPhoto(item)) {
          core()?.showToast('📷 1억 칸은 문제 사진이 있어야 승인할 수 있어요. 사진 없는 근무는 승인하지 마세요.', 'warning');
          return true;
        }
        const pick = choiceLine(item, item?.member_choice);
        if (item && !hasReviewPhoto(item) && !pick && item?.has_member_choice !== true) {
          core()?.showToast('📷 문제 사진도 제출 보기도 없으면 승인할 수 없어요.', 'warning');
          return true;
        }
      }
      return false;
    },
    submitNodeForm
  };

  wrapCore();
  document.addEventListener('submit', (event) => {
    if (event.target?.id === 'nodeForm') {
      event.preventDefault();
      event.stopImmediatePropagation();
      submitNodeForm(event);
    }
    if (event.target?.id === 'payoutDestinationForm') {
      event.preventDefault();
      event.stopImmediatePropagation();
      savePayoutDestination(event);
    }
    if (event.target?.id === 'securityPinResetForm') {
      event.preventDefault();
      event.stopImmediatePropagation();
      resetMemberSecurityPin(event);
    }
    if (event.target?.id === 'tierDailyLimitForm') {
      event.preventDefault();
      event.stopImmediatePropagation();
      saveTierDailyLimits();
    }
    if (event.target?.id === 'memberTaskQuotaForm') {
      event.preventDefault();
      event.stopImmediatePropagation();
      saveMemberTaskQuota(event);
    }
  }, true);
})();
