(() => {
  'use strict';

  const isAdmin = document.documentElement.dataset.mode === 'admin';
  const config = window.PUTDUK_CONFIG || {};
  const launchBlock = window.__PUTDUK_LAUNCH_BLOCK__ || null;
  const adminFunctionUrl = config.adminFunctionUrl || (config.supabaseUrl ? `${config.supabaseUrl}/functions/v1/admin-control` : '');
  const memberFinanceUrl = config.memberFinanceUrl || (config.supabaseUrl ? `${config.supabaseUrl}/functions/v1/member-finance` : '');
  const storageKey = 'putduk-state-v2';
  const supabaseClient = !launchBlock && window.supabase && config.supabaseUrl && config.supabasePublishableKey
    ? (window.__PUTDUK_SUPABASE_CLIENT__ || window.supabase.createClient(config.supabaseUrl, config.supabasePublishableKey, {
      auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true }
    }))
    : null;
  if (supabaseClient) window.__PUTDUK_SUPABASE_CLIENT__ = supabaseClient;
  const authState = { session: null, profile: null, loading: Boolean(supabaseClient), error: null, adminLoading: isAdmin && Boolean(supabaseClient), adminAuthorized: !isAdmin, adminRoles: [], adminAuthError: null };

  // 회원 화면은 서버에서 공개된 협력사·업무만 채운다. 정적 샘플을 두지 않는다.
  let companies = [];
  let nodes = [];

  const MOTION_PROFILES = [
    { id: 'road_logistics', label: '도로 물류' },
    { id: 'air_cargo', label: '항공 화물' },
    { id: 'ocean_vessel', label: '해상 선박' },
    { id: 'warehouse_edge', label: '창고 격자' },
    { id: 'commerce_catalog', label: '상품 카탈로그' },
    { id: 'satellite_network', label: '위성 회선' },
    { id: 'default', label: '기본 회선' }
  ];
  const INSPECT_TOTAL = 5;
  const INSPECT_HUBS = [
    '인천공항 제2화물터미널 3라인',
    '부산신항 국제물류센터 B구역',
    '동탄 메가허브 분류터미널',
    '평택 종합물류 4게이트',
    '김포 항공특송 취급소'
  ];
  const INSPECT_CARGO = [
    '항공 특송 정밀부품',
    '긴급 물류 센서 키트',
    '반도체 패키징 화물',
    '의료기기 긴급 배송건',
    '글로벌 특송 라벨 화물'
  ];
  const ACTIVE_RUN_STATUSES = ['reserved', 'in_progress', 'checkpointed'];
  const REVIEW_WAIT_STATUSES = ['submitted', 'under_review', 'review_pending'];
  const REWORK_RUN_STATUSES = ['rework'];
  const APPROVED_RUN_STATUSES = ['approved'];
  if (launchBlock) {
    const paintBlock = () => {
      const app = document.getElementById('app');
      if (!app) return;
      app.innerHTML = `<section class="empty-state" style="max-width:560px;margin:80px auto;text-align:center"><h1 class="page-title">운영자 주소를 먼저 나눠 주세요</h1><p class="page-copy">${String(launchBlock.copy || '')}</p></section>`;
    };
    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', paintBlock);
    else paintBlock();
    return;
  }
  const defaultState = {
    theme: 'light',
    memberPage: 'dashboard',
    adminPage: 'overview',
    authMode: 'signup',
    modal: null,
    modalPayload: null,
    wallet: { support: null, work: null, task: null, referral: null, available: null, held: null },
    dailyTaskQuota: null,
    run: null,
    reviewWait: null,
    history: [],
    notifications: [],
    assignments: [],
    referrals: [],
    deposits: [],
    withdrawals: [],
    companies: [],
    nodeEnabled: {},
    supportGrant: 10000,
    onboardingStep: null,
    onboardingPwaDone: false,
    onboardingGrantSeen: false,
    onboardingExperienceStarted: false,
    onboardingGeneralSeen: false,
    helpTab: 'work',
    adminFinanceTab: 'payouts',
    depositMethod: '',
    walletLedgerTab: 'all',
    lastCrewPartnerId: null,
    idCardFlipped: false,
    depositDestinations: [],
    depositDestinationsError: false,
    depositPinSet: false,
    depositPinLocked: false,
    depositPinCopy: '',
    depositReveal: null,
    depositRevealExpiresAt: null,
    depositRevealToken: null,
    depositCatalogVersion: null,
    startNodeId: null,
    depositJump: null,
    player: null,
    resultScene: null,
    withdrawIntent: 'allowance',
    adminReviews: [],
    adminReviewPendingCount: 0,
    adminReviewCompletedCount: 0,
    adminReviewLoading: false,
    adminReviewError: null,
    adminReviewBusyId: null,
    lastReviewToastId: null,
    adminCatalog: { brands: [], nodes: [] },
    adminCatalogLoaded: false,
    adminCatalogLoading: false,
    adminCatalogError: null,
    adminCatalogBusyId: null,
    adminMembers: [],
    adminMemberTotal: 0,
    adminMembersLoading: false,
    adminMembersError: null,
    adminMembersContract: null,
    adminMemberQuery: '',
    adminMemberFilter: 'all',
    adminMemberDetail: null,
    adminFinance: { deposits: [], withdrawals: [], kyc: [], referrals: [], destinations: [] },
    adminFinanceLoading: false,
    adminFinanceError: null,
    adminFinanceContract: null,
    adminKycPreview: null,
    adminWithdrawalReveal: null,
    adminCampaigns: [],
    adminCampaignsError: null,
    adminCampaignsContract: null,
    adminTierDailyLimits: [],
    adminTierDailyLimitsError: null,
    adminTierDailyLimitsContract: null,
    dailyTaskQuotaError: null,
    adminFormBusy: false,
    adminMotion: { bot_enabled: true, crowd_min: 8, crowd_max: 24, burn_per_minute: 2 },
    adminMotionError: null,
    toast: null
  };

  let activeStorageKey = storageKey;
  let state = loadState();
  if (isAdmin) scrubLegacyAdminFinanceStorage();
  let runFrame = null;
  let chartInstance = null;
  let chartLoading = null;
  let syncTimer = null;
  let kstResetTimer = null;
  let noticesHydrated = false;
  let memberLiveChannel = null;
  let memberLiveUserId = null;
  const toastRecent = new Map();
  const toastTimers = new Set();
  let overlayDismissed = false;
  let signedOutLock = false;

  function freshState(userState = false) {
    const next = JSON.parse(JSON.stringify(defaultState));
    if (userState) {
      next.wallet = { support: null, work: null, task: null, referral: null, available: null, held: null };
      next.history = [];
      next.notifications = [];
      next.run = null;
      next.reviewWait = null;
    }
    return next;
  }

  function sanitizeAdminFinanceForStorage(finance) {
    if (!finance || typeof finance !== 'object') return finance;
    return { ...finance, destinations: [] };
  }

  function scrubPersistedStatePayload(payload) {
    if (!payload || typeof payload !== 'object') return payload;
    delete payload.adminKycPreview;
    delete payload.adminWithdrawalReveal;
    if (payload.adminFinance) payload.adminFinance = sanitizeAdminFinanceForStorage(payload.adminFinance);
    return payload;
  }

  function scrubLegacyAdminFinanceStorage() {
    if (!isAdmin || typeof localStorage === 'undefined') return;
    try {
      for (let i = 0; i < localStorage.length; i += 1) {
        const key = localStorage.key(i);
        if (!key || !key.startsWith(storageKey)) continue;
        const raw = localStorage.getItem(key);
        if (!raw) continue;
        let parsed;
        try { parsed = JSON.parse(raw); } catch (_) { continue; }
        const scrubbed = scrubPersistedStatePayload(parsed);
        const nextRaw = JSON.stringify(scrubbed);
        if (nextRaw !== raw) localStorage.setItem(key, nextRaw);
      }
    } catch (_) {}
  }

  function loadState(key = activeStorageKey) {
    try {
      const raw = localStorage.getItem(key);
      if (!raw) return freshState(key !== storageKey);
      const stored = scrubPersistedStatePayload(JSON.parse(raw));
      const scrubbedRaw = JSON.stringify(stored);
      if (scrubbedRaw !== raw) {
        try { localStorage.setItem(key, scrubbedRaw); } catch (_) {}
      }
      return { ...freshState(key !== storageKey), ...stored, wallet: { ...freshState(key !== storageKey).wallet, ...(stored.wallet || {}) } };
    } catch (_) {
      return freshState(key !== storageKey);
    }
  }

  function saveState() {
    try {
      const { _workLockCue, _playedMotionCue, _motionCanvas, toast, modal, modalPayload, adminMemberDetail, adminKycPreview, adminWithdrawalReveal, depositJump, adminMotion, adminMotionError, crewPulse, depositReveal, depositRevealExpiresAt, depositRevealToken, ...rest } = state;
      const safe = { ...rest, run: state.run ? { ...state.run, overlayOpen: false } : null, toast: null, modal: null, modalPayload: null, adminMemberDetail: null, depositReveal: null, depositRevealExpiresAt: null, depositRevealToken: null };
      if (safe.adminFinance) safe.adminFinance = sanitizeAdminFinanceForStorage(safe.adminFinance);
      localStorage.setItem(activeStorageKey, JSON.stringify(safe));
    } catch (_) {}
  }

  function switchToUserState(userId) {
    if (!userId) return;
    const nextKey = `${storageKey}:${userId}`;
    if (activeStorageKey === nextKey) return;
    const preserved = {
      modal: state.modal,
      modalPayload: state.modalPayload,
      adminMemberDetail: state.adminMemberDetail,
      adminPage: state.adminPage
    };
    activeStorageKey = nextKey;
    state = loadState(activeStorageKey);
    if (isAdmin) {
      state.modal = preserved.modal;
      state.modalPayload = preserved.modalPayload;
      state.adminMemberDetail = preserved.adminMemberDetail;
      if (preserved.adminPage) state.adminPage = preserved.adminPage;
    }
  }

  function profileName() {
    return authState.profile?.display_name || authState.session?.user?.user_metadata?.display_name || '퍼뜩 회원';
  }

  function profileInitial() {
    return profileName().trim().slice(0, 1) || '회';
  }

  function publicId() {
    return authState.profile?.public_id || (authState.session ? '회원번호 확인 중' : '가입 후 발급');
  }

  function referralCode() {
    return authState.profile?.referral_code || (authState.session ? '추천 코드 확인 중' : '로그인 후 확인');
  }

  function copyTextFallback(text) {
    const textarea = document.createElement('textarea');
    textarea.value = text;
    textarea.setAttribute('readonly', '');
    textarea.style.position = 'fixed';
    textarea.style.opacity = '0';
    document.body.appendChild(textarea);
    textarea.select();
    const copied = document.execCommand('copy');
    textarea.remove();
    if (!copied) throw new Error('clipboard_fallback_failed');
  }

  function financeEnabled() {
    return config.enableFinanceApi === true;
  }

  function workEnabled() {
    return config.enableWorkApi === true;
  }

  function lockToast(kind) {
    if (kind === 'work') {
      showToast('🔒 실제 근무 제출은 아직 준비 중이에요. 잔액은 그대로예요.', 'warning');
      return;
    }
    showToast('🔒 입출금 자동 반영은 아직 준비 중이에요. 신청은 운영자가 확인한 뒤에 잔액에 반영돼요.', 'warning');
  }

  const STAKE_LADDER = [30000, 50000, 70000, 100000, 300000, 500000, 1000000, 3000000, 5000000, 10000000, 30000000, 100000000];
  const HIGH_JUMP_MIN = 3000000;
  const PAY_BY_STAKE = {
    30000: 3000,
    50000: 5000,
    70000: 7000,
    100000: 10000,
    300000: 30000,
    500000: 50000,
    1000000: 100000,
    3000000: 300000,
    5000000: 500000,
    10000000: 1000000,
    30000000: 3000000,
    100000000: 10000000
  };

  function nodePay(node) {
    return Number(node?.stipend || node?.stipend_krw || node?.reward || node?.rewardMax || 0);
  }

  function nodeStake(node) {
    const explicit = Number(node?.stake || node?.stake_krw || node?.lockAmount || 0);
    if (explicit > 0) return explicit;
    const pay = nodePay(node);
    if (pay >= 30000) return pay;
    if (pay <= 0) return 0;
    const guessed = pay * 10;
    return STAKE_LADDER.reduce((best, item) => Math.abs(item - guessed) < Math.abs(best - guessed) ? item : best, STAKE_LADDER[0]);
  }

  function nextStakeSlot(stake) {
    return STAKE_LADDER.find((item) => item > Number(stake || 0)) || null;
  }

  function payForStake(stake) {
    return PAY_BY_STAKE[stake] || 0;
  }

  function stipendGuess(stake) {
    const n = Number(stake || 0);
    if (PAY_BY_STAKE[n]) return PAY_BY_STAKE[n];
    const rung = [...STAKE_LADDER].reverse().find((item) => item <= n);
    if (rung && PAY_BY_STAKE[rung]) return Math.round(PAY_BY_STAKE[rung] * (n / rung));
    return Math.round(n * 0.1);
  }

  function isHighJumpAmount(amount) {
    return Number(amount || 0) >= HIGH_JUMP_MIN;
  }

  function demoteBandLabel(label) {
    const order = ['전담', '선임', '크루', '라인'];
    const idx = order.indexOf(String(label || ''));
    if (idx < 0) return '라인';
    return order[Math.min(idx + 1, order.length - 1)];
  }

  function eulo(word) {
    const text = String(word || '');
    const code = text.charCodeAt(text.length - 1);
    if (code < 0xac00 || code > 0xd7a3) return '로';
    return ((code - 0xac00) % 28) ? '으로' : '로';
  }

  function ieya(word) {
    const text = String(word || '');
    const code = text.charCodeAt(text.length - 1);
    if (code < 0xac00 || code > 0xd7a3) return '예요';
    return ((code - 0xac00) % 28) ? '이에요' : '예요';
  }

  function formatChartTick(value) {
    const n = Number(value) || 0;
    if (n === 0) return '0원';
    if (Math.abs(n) >= 10000) return `${Math.round(n / 10000).toLocaleString('ko-KR')}만`;
    return `${Math.round(n).toLocaleString('ko-KR')}원`;
  }

  function assignedNodeIds() {
    return new Set((state.assignments || []).map((row) => String(row.node_id || '')).filter(Boolean));
  }

  function nodeIsAssigned(node) {
    return Boolean(node?.assigned) || assignedNodeIds().has(String(node?.id || ''));
  }

  function ultraNeedsAssign(node) {
    return isUltraNode(node) && !nodeIsAssigned(node);
  }

  function memberCatalogNodes() {
    const work = Number(state.wallet.work || 0);
    const support = Number(state.wallet.support || 0);
    const trialDone = Boolean(authState.profile?.trial_consumed_at);
    const assignedIds = assignedNodeIds();
    const completedStakes = new Set(
      (state.history || [])
        .filter((item) => item.status === '검수 완료')
        .map((item) => nodeStake(nodeById(item.nodeId)))
        .filter((stake) => stake > 0)
    );
    const maxDone = Math.max(0, ...completedStakes);
    return nodes
      .filter((node) => {
        if (assignedIds.has(String(node.id)) || node.assigned) return true;
        if (node.enabled === false) return false;
        const stake = nodeStake(node);
        if (node.requiresAssign || node.tierBand === '초고액' || stake >= 30000000) return false;
        if (node.isTrial) return !trialDone && support > 0;
        if (work >= stake) return true;
        if (stake <= 100000) return true;
        const prev = STAKE_LADDER.filter((item) => item < stake).pop() || 0;
        return maxDone >= prev || work >= prev;
      })
      .sort((a, b) => {
        const assignedDelta = Number(nodeIsAssigned(b)) - Number(nodeIsAssigned(a));
        if (assignedDelta) return assignedDelta;
        const trialDelta = Number(Boolean(b.isTrial)) - Number(Boolean(a.isTrial));
        if (trialDelta) return trialDelta;
        return nodeStake(a) - nodeStake(b);
      });
  }

  function canStartNode(node) {
    if (!node) return false;
    if (node.isTrial) return Number(state.wallet.support || 0) > 0;
    return Number(state.wallet.work || 0) >= nodeStake(node);
  }

  function findCompany(id) {
    if (id == null || id === '' || id === 'unknown-company') return null;
    return companies.find((company) => String(company.id) === String(id)) || null;
  }

  function rememberCrewPartner(companyId) {
    const company = findCompany(companyId);
    if (!company) return;
    state.lastCrewPartnerId = company.id;
  }

  function isUltraNode(node) {
    return Boolean(node?.requiresAssign || node?.tierBand === '초고액' || nodeStake(node) >= 30000000);
  }

  function nodeDailyRemaining(node) {
    const cap = Number(node?.available || 0);
    if (!(cap > 0)) return Number.POSITIVE_INFINITY;
    const today = new Date().toDateString();
    return Math.max(0, cap - (state.history || []).filter((item) => {
      if (String(item.nodeId) !== String(node.id)) return false;
      const at = new Date(item.createdAt || item.date || '');
      return !Number.isNaN(at.getTime()) && at.toDateString() === today;
    }).length);
  }

  function canAttendNode(node) {
    if (!node || (node.enabled === false && !nodeIsAssigned(node))) return false;
    if (ultraNeedsAssign(node)) return false;
    if (nodeDailyRemaining(node) <= 0) return false;
    return canStartNode(node);
  }

  function crewPartnerCompany() {
    if (state.run?.nodeId) {
      const fromRun = findCompany(nodeById(state.run.nodeId).companyId);
      if (fromRun) return fromRun;
    }
    const remembered = findCompany(state.lastCrewPartnerId);
    if (remembered) return remembered;
    const recent = (state.history || []).find((item) => item.nodeId);
    if (recent) {
      const fromHistory = findCompany(nodeById(recent.nodeId).companyId);
      if (fromHistory) return fromHistory;
    }
    const startable = memberCatalogNodes().find((node) => canAttendNode(node));
    if (startable) {
      const fromReady = findCompany(startable.companyId);
      if (fromReady) return fromReady;
    }
    const catalog = memberCatalogNodes()[0];
    return catalog ? findCompany(catalog.companyId) : null;
  }

  function lineNameForNode(node) {
    const company = findCompany(node?.companyId);
    if (company) return company.name;
    return '라인 확인 중';
  }

  function crewAttendance(company = crewPartnerCompany()) {
    if (!authState.session) return { ok: false, label: '로그인 후 출근' };
    if (!company) return { ok: false, label: '라인 배정 전' };
    const lineNodes = nodes.filter((node) => String(node.companyId) === String(company.id) && node.enabled !== false);
    if (!lineNodes.length) return { ok: false, label: '오늘 라인 대기' };
    if (lineNodes.some((node) => canAttendNode(node))) return { ok: true, label: '출근 가능' };
    if (lineNodes.length && lineNodes.every(ultraNeedsAssign)) return { ok: false, label: '운영자 확인 후 열림' };
    const work = Number(state.wallet.work || 0);
    const support = Number(state.wallet.support || 0);
    const trialOpen = lineNodes.some((node) => node.isTrial && support > 0 && !ultraNeedsAssign(node) && nodeDailyRemaining(node) > 0);
    if (!trialOpen && work <= 0) return { ok: false, label: '잔액 모으면 출근' };
    const anySeat = lineNodes.some((node) => !ultraNeedsAssign(node) && nodeDailyRemaining(node) > 0);
    if (!anySeat) return { ok: false, label: '오늘 라인 대기' };
    const paidLine = lineNodes.filter((node) => !ultraNeedsAssign(node) && !node.isTrial);
    if (paidLine.length && paidLine.every((node) => work < nodeStake(node))) return { ok: false, label: '잔액 모으면 출근' };
    return { ok: false, label: '오늘 라인 대기' };
  }

  function opsTrialWithdrawAllowed(amount, kind) {
    return workEnabled()
      && kind !== 'principal'
      && Number(amount) > 0
      && Number(amount) <= 3000;
  }

  function cardMoneyLines(node) {
    const stake = nodeStake(node);
    const pay = nodePay(node) || payForStake(stake) || stipendGuess(stake);
    const trial = Boolean(node?.isTrial || node?.tierBand === '체험');
    return {
      stake,
      pay,
      trial,
      html: `<div class="node-money"><div class="money-line">${icon('lock', 15)}<span>${trial ? '지원금 잠금' : '근무 보증'} ${money(stake)}</span></div><div class="money-line">${icon('coins', 15)}<span>수당 ${money(pay)}</span></div></div>`
    };
  }

  function parseLedgerAmount(value) {
    if (value == null || value === '') return null;
    const amount = typeof value === 'number' ? value : Number(String(value).replace(/,/g, ''));
    return Number.isFinite(amount) ? amount : null;
  }

  function formatLedgerAmount(value) {
    const amount = parseLedgerAmount(value);
    if (amount == null) return '확인 필요';
    return `${Math.round(amount).toLocaleString('ko-KR')}원`;
  }

  function runStatusLabel(status) {
    return ({
      reserved: '출근 대기',
      in_progress: '근무 중',
      checkpointed: '중간 저장',
      submitted: '검수 대기',
      under_review: '검수 중',
      review_pending: '검수 대기',
      approved: '검수 완료',
      rework: '재확인 요청',
      rejected: '반려',
      cancelled: '취소'
    })[String(status || '')] || '처리 중';
  }

  function isActiveRunStatus(status) {
    return ACTIVE_RUN_STATUSES.includes(String(status || ''));
  }

  function isReviewWaitStatus(status) {
    return REVIEW_WAIT_STATUSES.includes(String(status || ''));
  }

  function reviewWaitDismissKey(id, publicId) {
    return String(id || publicId || '');
  }

  function isReviewWaitDismissed(id, publicId) {
    try {
      const stored = sessionStorage.getItem('putduk-review-wait-dismissed') || '';
      const keys = [id, publicId].map((value) => String(value || '')).filter(Boolean);
      return keys.some((key) => stored === key);
    } catch (_) {
      return false;
    }
  }

  function rememberReviewWaitDismissed(wait) {
    try {
      const key = reviewWaitDismissKey(wait?.dbId, wait?.id);
      if (key) sessionStorage.setItem('putduk-review-wait-dismissed', key);
    } catch (_) {}
  }

  function blocksNewStart(status) {
    const raw = String(status || '');
    return isActiveRunStatus(raw) || isReviewWaitStatus(raw) || REWORK_RUN_STATUSES.includes(raw);
  }

  function isPostedReward(rewardStatus, runStatus) {
    return String(rewardStatus || '').toLowerCase() === 'posted' && APPROVED_RUN_STATUSES.includes(String(runStatus || ''));
  }

  function rewardUiKind(item) {
    const status = String(item?.runStatus || item?.statusRaw || '');
    const rewardStatus = String(item?.rewardStatus || '');
    if (isReviewWaitStatus(status)) return 'review_wait';
    if (REWORK_RUN_STATUSES.includes(status)) return 'rework';
    if (status === 'rejected') return 'rejected';
    if (isPostedReward(rewardStatus, status)) return 'posted';
    if (APPROVED_RUN_STATUSES.includes(status)) return 'approved_unposted';
    return 'expected';
  }

  function rewardUiLabel(kind) {
    return ({
      expected: '예상 보상',
      review_wait: '예상 보상 · 검수 대기',
      rework: '예상 보상 · 재확인',
      rejected: '보상 없음',
      approved_unposted: '확정 대기',
      posted: '확정 보상'
    })[kind] || '예상 보상';
  }

  function sanitizeMemberNotice(text) {
    let copy = String(text || '');
    copy = copy.replace(/(\d{1,3}(?:,\d{3})*)\.00원/g, '$1원');
    copy = copy.replace(/운영자 안내[·\s]*테스트/g, '');
    copy = copy.replace(/운영자 안내/g, '');
    copy = copy.replace(/(^|[^\w가-힣])테스트(?=[^\w가-힣]|$)/g, '$1');
    copy = copy.replace(/수당\s*[\d,]+원이 출금 가능에 들어왔어요\.?/g, '검수가 끝났어요. 출금 가능 금액은 지갑에서 확인해요.');
    copy = copy.replace(/출금 가능으로 반영/g, '검수 완료로 기록');
    copy = copy.replace(/출금 가능에 (들어왔어요|반영됐어요)/g, '검수 완료로 기록됐어요');
    copy = copy.replace(/지급 완료/g, '검수 완료');
    copy = copy.replace(/운영자가 확인합니다\.?/g, '');
    copy = copy.replace(/\s*·\s*:/g, '');
    copy = copy.replace(/\s*·\s*$/g, '');
    copy = copy.replace(/\s{2,}/g, ' ').trim();
    if (/^[\d,]+원$/.test(copy)) return '처리 기록이 있어요. 금액은 지갑에서 확인해요.';
    return copy;
  }

  function normalizeTypedLabel(value) {
    const raw = String(value || '').trim().toUpperCase().replace(/\s+/g, '');
    if (!raw) return '';
    const digits = raw.replace(/\D/g, '');
    if (digits.length >= 4) return `PDK-${digits.slice(-4)}`;
    return raw;
  }

  function applyWalletRows(rows) {
    const list = Array.isArray(rows) ? rows : [];
    const buckets = Object.fromEntries(list.map((row) => [row.bucket, row]));
    const amountOf = (row, field) => {
      if (!row || row[field] == null || row[field] === '') return null;
      return parseLedgerAmount(row[field]);
    };
    const work = buckets.work_balance || null;
    state.wallet.support = amountOf(buckets.support_grant, 'available_amount');
    state.wallet.work = amountOf(work, 'available_amount');
    state.wallet.held = amountOf(work, 'held_amount');
    state.wallet.available = amountOf(buckets.available, 'available_amount');
    state.wallet.task = amountOf(buckets.task_reward, 'available_amount');
    state.wallet.referral = amountOf(buckets.referral_reward, 'available_amount');
  }

  async function refreshMemberWallet() {
    if (!authState.session) return;
    if (supabaseClient) {
      const walletResult = await supabaseClient
        .from('wallet_accounts')
        .select('bucket,currency,available_amount,held_amount')
        .eq('user_id', authState.session.user.id)
        .eq('currency', 'KRW');
      if (!walletResult.error && Array.isArray(walletResult.data) && walletResult.data.length) {
        applyWalletRows(walletResult.data);
        return;
      }
    }
    try {
      const snap = await memberFinanceRequest('wallet_snapshot');
      const wallet = snap.wallet || {};
      if (Array.isArray(wallet.buckets) && wallet.buckets.length) {
        applyWalletRows(wallet.buckets);
        return;
      }
      state.wallet.support = parseLedgerAmount(wallet.support_grant);
      state.wallet.work = parseLedgerAmount(wallet.work_balance);
      state.wallet.held = parseLedgerAmount(wallet.held_amount);
      state.wallet.available = parseLedgerAmount(wallet.available);
    } catch (_) {}
  }

  function walletThree() {
    return {
      support: parseLedgerAmount(state.wallet.support),
      work: parseLedgerAmount(state.wallet.work),
      workHeld: parseLedgerAmount(state.wallet.held),
      withdrawable: parseLedgerAmount(state.wallet.available)
    };
  }

  function renderWalletSlots() {
    const w = walletThree();
    const heldText = w.workHeld == null ? '확인 필요' : formatLedgerAmount(w.workHeld);
    const workHint = w.workHeld != null && w.workHeld > 0 ? `잠금 ${heldText}` : '근무에 쓰는 돈';
    const supportZero = Number(w.support || 0) === 0;
    return `<div class="wallet-slots"><div class="wallet-slot${supportZero ? ' is-zero' : ''}">${uiLead('gift', '지원금')}<strong>${formatLedgerAmount(w.support)}</strong><small>출금 안 됨</small></div><div class="wallet-slot">${uiLead('briefcase', '업무잔액')}<strong>${formatLedgerAmount(w.work)}</strong><small>${workHint}</small></div><div class="wallet-slot is-focus">${uiLead('banknote', '출금가능')}<strong>${formatLedgerAmount(w.withdrawable)}</strong><small>기본은 수당만</small></div></div>`;
  }

  function displayPublicId() {
    const raw = String(publicId() || '');
    if (!raw || raw.includes('준비') || raw.includes('발급')) return raw;
    return raw.startsWith('PDK-') ? raw : `PDK-${raw}`;
  }

  function tierBand(tier) {
    const raw = String(tier || authState.profile?.member_tier || '일반 파트너');
    const map = { '일반 파트너': '라인', '라인': '라인', '인증 파트너': '크루', '크루': '크루', '우수 파트너': '선임', '선임': '선임', '글로벌 디렉터': '전담', '전담': '전담' };
    return { raw, label: map[raw] || raw };
  }

  function nextMemberBand(current) {
    const index = MEMBER_BANDS.findIndex((band) => band.label === current.label || band.raw === current.raw);
    return index >= 0 ? (MEMBER_BANDS[index + 1] || null) : MEMBER_BANDS[1] || null;
  }

  // 대시보드·라인 찾기·업무 카드·출근 확인이 전부 같은 state.dailyTaskQuota(서버
  // putduk_member_daily_task_quota RPC 결과)를 참조해서 화면마다 다른 숫자가 나오지 않게 한다.
  function dailyQuotaParts() {
    if (!authState.session) return { value: '-', suffix: '', remaining: null, unlimited: false, loaded: false, error: false };
    if (state.dailyTaskQuotaError) return { value: '-', suffix: '', remaining: null, unlimited: false, loaded: true, error: true };
    const quota = state.dailyTaskQuota;
    if (!quota) return { value: '확인 중', suffix: '', remaining: null, unlimited: false, loaded: false, error: false };
    if (quota.unlimited) return { value: '무제한', suffix: '', remaining: null, unlimited: true, loaded: true, error: false };
    return {
      value: `${quota.remaining_today}/${quota.daily_limit}`,
      suffix: '회 남음',
      remaining: Number(quota.remaining_today),
      unlimited: false,
      loaded: true
    };
  }

  function dailyQuotaDisplay() {
    const parts = dailyQuotaParts();
    if (parts.error) return {
      value: '-',
      suffix: '',
      text: authState.session ? '오늘 남은 횟수를 불러오지 못했어요.' : ''
    };
    if (!parts.loaded) return {
      value: '확인 중',
      suffix: '',
      text: authState.session ? '오늘 남은 횟수 확인 중' : ''
    };
    if (parts.unlimited) return {
      value: '무제한',
      suffix: '',
      text: '오늘 남은 횟수 무제한'
    };
    return {
      value: String(Math.max(0, Number(parts.remaining ?? 0))),
      suffix: '회',
      text: `오늘 남은 횟수 ${Math.max(0, Number(parts.remaining ?? 0))}회`
    };
  }

  function dailyQuotaSummaryText() {
    return dailyQuotaDisplay().text;
  }

  function paintDailyQuota() {
    const display = dailyQuotaDisplay();
    document.querySelectorAll('[data-daily-quota-label]').forEach((node) => {
      if (node.textContent !== '오늘 남은 횟수') node.textContent = '오늘 남은 횟수';
    });
    document.querySelectorAll('[data-daily-quota-value]').forEach((node) => {
      if (node.textContent !== display.value) node.textContent = display.value;
    });
    document.querySelectorAll('[data-daily-quota-suffix]').forEach((node) => {
      if (node.textContent !== display.suffix) node.textContent = display.suffix;
    });
    document.querySelectorAll('[data-daily-quota-summary]').forEach((node) => {
      if (node.textContent !== display.text) node.textContent = display.text;
    });
  }

  function approvedTrialExists() {
    return (state.history || []).some((item) => {
      if (String(item.statusRaw || item.runStatus || '') !== 'approved') return false;
      return Boolean(nodeById(item.nodeId)?.isTrial);
    });
  }

  function activeTrialExists() {
    const activeNodeId = state.run?.nodeId || state.reviewWait?.nodeId;
    return Boolean(activeNodeId && nodeById(activeNodeId)?.isTrial);
  }

  function queueOnboarding() {
    if (isAdmin || !authState.session) {
      state.onboardingStep = null;
      return;
    }
    const trialApproved = approvedTrialExists();
    const trialStarted = Boolean(
      authState.profile?.trial_consumed_at
      || state.onboardingExperienceStarted
      || activeTrialExists()
      || trialApproved
    );
    if (!trialStarted) {
      state.onboardingStep = 'first-work';
      return;
    }
    if (activeTrialExists() || state.reviewWait) {
      state.onboardingStep = null;
      return;
    }
    if (trialApproved && !state.onboardingGeneralSeen && !state.onboardingGrantSeen) {
      state.onboardingStep = 'general-work';
      return;
    }
    state.onboardingStep = null;
  }

  function inspectSeedFromRunId(runId) {
    const hex = String(runId || '')
      .replace(/-/g, '')
      .toLowerCase()
      .replace(/[^0-9a-f]/g, '')
      .slice(0, 8)
      .padEnd(8, '0');
    return parseInt(hex, 16) >>> 0;
  }

  function inspectItemForRun(runId, index) {
    const seed = inspectSeedFromRunId(runId);
    const invoiceNum = 1000 + ((seed + index * 137) % 9000);
    const mismatch = index === (seed % 5) || index === ((seed + 2) % 5);
    const targetNum = mismatch ? 1000 + ((invoiceNum - 1000 + 17) % 9000) : invoiceNum;
    return {
      index: index + 1,
      invoiceCode: `PDK-${String(invoiceNum).padStart(4, '0')}`,
      targetCode: `PDK-${String(targetNum).padStart(4, '0')}`,
      match: !mismatch,
      expectedChoice: mismatch ? 'no' : 'yes',
      destination: INSPECT_HUBS[index % INSPECT_HUBS.length],
      category: INSPECT_CARGO[index % INSPECT_CARGO.length]
    };
  }

  function inspectSeedKey(run, node) {
    return String(run?.dbId || node?.id || '00000000-0000-4000-8000-000000000000');
  }

  function initBundleForNode(node, company, run) {
    const runId = inspectSeedKey(run, node);
    return {
      total: INSPECT_TOTAL,
      current: 0,
      runId,
      items: Array.from({ length: INSPECT_TOTAL }, (_, index) => inspectItemForRun(runId, index)),
      answers: []
    };
  }

  function syncInspectBundle(bundle, node, run) {
    const fresh = initBundleForNode(node, null, run);
    if (!bundle || bundle.total !== fresh.total) return fresh;
    const same = Array.isArray(bundle.items)
      && bundle.items.length === fresh.items.length
      && bundle.items.every((item, index) => item.invoiceCode === fresh.items[index].invoiceCode && item.targetCode === fresh.items[index].targetCode);
    if (!same) return fresh;
    return {
      ...fresh,
      current: Math.min(INSPECT_TOTAL, Number(bundle.current || 0)),
      answers: Array.isArray(bundle.answers) ? bundle.answers.slice(0, INSPECT_TOTAL) : []
    };
  }

  function isInspectBundleComplete(bundle) {
    if (!bundle || bundle.current < INSPECT_TOTAL || !Array.isArray(bundle.answers) || bundle.answers.length < INSPECT_TOTAL) return false;
    return bundle.items.every((item, index) => {
      const got = String(bundle.answers[index] || '').toLowerCase();
      const choice = (got === 'a' || got === 'yes' || got === '1') ? 'yes' : (got === 'b' || got === 'no' || got === '2') ? 'no' : '';
      return choice === item.expectedChoice;
    });
  }

  function inspectCodeTail(code) {
    return String(code || '').replace(/^PDK-/i, '');
  }

  const CATALOG_PRODUCTS = ['무선 이어폰 실리콘 케이스', '캠핑 접이식 테이블', '유아 스트라이프 내의', '스테인리스 텀블러 500ml'];
  const CATALOG_PRICES = ['12900', '35900', '18900', '24900'];
  const CATALOG_OPTIONS = ['블랙 / 1개', '우드 / 2인용', '90호 / 아이보리', '실버 / 손잡이형'];
  const CATALOG_SHIPPING = ['무료배송 · 오늘출발', '3,000원 · 2-3일', '무료배송 · 해외직구 10일', '조건부무료 · 3만원 이상'];

  function isCatalogWork(node) {
    return String(node?.motion || node?.motion_profile || '').includes('catalog');
  }

  function catalogListingForRun(runId) {
    const seed = inspectSeedFromRunId(runId);
    return {
      productName: CATALOG_PRODUCTS[seed % CATALOG_PRODUCTS.length],
      price: CATALOG_PRICES[(seed >>> 3) % CATALOG_PRICES.length],
      option: CATALOG_OPTIONS[(seed >>> 5) % CATALOG_OPTIONS.length],
      shipping: CATALOG_SHIPPING[(seed >>> 7) % CATALOG_SHIPPING.length]
    };
  }

  function readCatalogListing(raw) {
    const row = raw && typeof raw === 'object' ? raw : {};
    return {
      productName: String(row.productName || row.product_name || '').replace(/\s+/g, ' ').trim(),
      price: String(row.price || '').replace(/\D/g, ''),
      option: String(row.option || '').replace(/\s+/g, ' ').trim(),
      shipping: String(row.shipping || '').replace(/\s+/g, ' ').trim()
    };
  }

  function gradeCatalogListing(runId, listing) {
    const expected = catalogListingForRun(runId);
    const got = readCatalogListing(listing);
    return got.productName === expected.productName
      && got.price === expected.price
      && got.option === expected.option
      && got.shipping === expected.shipping;
  }

  function catalogFormValues() {
    return readCatalogListing({
      productName: document.getElementById('catalogProductName')?.value,
      price: document.getElementById('catalogPrice')?.value,
      option: document.getElementById('catalogOption')?.value,
      shipping: document.getElementById('catalogShipping')?.value
    });
  }

  function tapHaptic(kind) {
    try {
      const vibrate = navigator.vibrate?.bind(navigator);
      if (!vibrate) return;
      if (kind === 'ok') vibrate(12);
      else if (kind === 'bad') vibrate([40, 40, 40]);
      else vibrate(8);
    } catch (_error) {}
  }

  function playerQuestion(node) {
    return '전표의 송장 번호와 실물 라벨 번호가 같으면 통과시켜요.';
  }

  function isUnsupportedAction(error) {
    return /지원하지 않는/.test(String(error?.message || error || ''));
  }

  function friendlyAdminError(error) {
    const raw = String(error?.message || error || '');
    if (!raw) return '요청을 처리하지 못했어요.';
    if (/token|jwt|unauthorized|401/i.test(raw)) return '운영자 권한을 확인해 주세요.';
    if (/database|rpc|sql|crud/i.test(raw)) return '변경 기록을 저장하지 못했어요.';
    if (/failed to fetch|network|timeout/i.test(raw)) return '잠시 후 다시 시도해 주세요.';
    if (isUnsupportedAction(error)) return '이 운영 메뉴는 아직 서버에 연결되지 않았어요.';
    return raw;
  }

  function normalizeMemberRow(row) {
    if (!row || typeof row !== 'object') return {};
    const id = row.user_id || row.id;
    return {
      id,
      user_id: id,
      public_id: row.public_id,
      display_name: row.display_name,
      legal_name: row.legal_name,
      email: row.email,
      phone: row.phone_e164 || row.phone,
      phone_e164: row.phone_e164 || row.phone,
      member_tier: row.member_tier,
      status: row.status,
      kyc_status: row.kyc_status,
      created_at: row.created_at,
      last_login_at: row.last_login_at || row.last_sign_in_at,
      last_login_ip: row.last_login_ip != null ? String(row.last_login_ip) : '',
      referral_count: parseLedgerAmount(row.referral_count) ?? Number(row.referral_count || 0),
      wallet: {
        support: parseLedgerAmount(row.wallet_summary?.support ?? row.support_grant_krw),
        work: parseLedgerAmount(row.wallet_summary?.work ?? row.work_balance_krw),
        task: parseLedgerAmount(row.wallet_summary?.task ?? row.task_reward_krw),
        referral: parseLedgerAmount(row.wallet_summary?.referral),
        available: parseLedgerAmount(row.wallet_summary?.available ?? row.available_krw),
        held: parseLedgerAmount(row.wallet_summary?.work_held ?? row.work_held_krw ?? row.available_held_krw)
      },
      wallets: Array.isArray(row.wallets) ? row.wallets : null,
      pii_masked: row.pii_masked === true
    };
  }

  function firstText(...values) {
    for (const value of values) {
      const text = value == null ? '' : String(value).trim();
      if (text && text !== '-') return text;
    }
    return '';
  }

  function displayText(value) {
    return firstText(value) || '없음';
  }

  function displayTime(value) {
    if (!value) return '없음';
    const date = new Date(value);
    return Number.isNaN(date.getTime()) ? '없음' : date.toLocaleString('ko-KR');
  }

  function mergeMember(base, incoming) {
    const prev = base && typeof base === 'object' ? base : {};
    const next = incoming && typeof incoming === 'object' ? incoming : {};
    return {
      ...prev,
      ...next,
      id: next.id || next.user_id || prev.id || prev.user_id,
      user_id: next.user_id || next.id || prev.user_id || prev.id,
      email: firstText(next.email, prev.email),
      phone: firstText(next.phone, next.phone_e164, prev.phone, prev.phone_e164),
      phone_e164: firstText(next.phone_e164, next.phone, prev.phone_e164, prev.phone),
      last_login_at: firstText(next.last_login_at, prev.last_login_at),
      last_login_ip: firstText(next.last_login_ip, prev.last_login_ip),
      wallet: {
        support: parseLedgerAmount(next.wallet?.support ?? prev.wallet?.support),
        work: parseLedgerAmount(next.wallet?.work ?? prev.wallet?.work ?? next.wallet?.task ?? prev.wallet?.task),
        task: parseLedgerAmount(next.wallet?.task ?? prev.wallet?.task),
        referral: parseLedgerAmount(next.wallet?.referral ?? prev.wallet?.referral),
        available: parseLedgerAmount(next.wallet?.available ?? prev.wallet?.available),
        held: parseLedgerAmount(next.wallet?.held ?? prev.wallet?.held)
      }
    };
  }

  function flattenMemberDetail(payload) {
    if (!payload || typeof payload !== 'object') return {};
    if (payload.profile) {
      const profile = payload.profile;
      const priv = payload.private_profile || {};
      const auth = payload.auth || {};
      const wallets = Array.isArray(payload.wallets) ? payload.wallets : [];
      const summary = payload.wallet_summary || {};
      const buckets = Object.fromEntries(wallets.map((item) => [item.bucket, item]));
      const available = wallets.find((item) => item.bucket === 'available') || {};
      const held = wallets.find((item) => item.bucket === 'held') || {};
      return {
        id: profile.id,
        user_id: profile.id,
        public_id: profile.public_id,
        display_name: profile.display_name,
        email: firstText(priv.email_snapshot, auth.email, payload.email),
        phone: firstText(priv.phone_e164, payload.phone),
        phone_e164: firstText(priv.phone_e164, payload.phone),
        member_tier: profile.member_tier,
        status: profile.status,
        kyc_status: profile.kyc_status,
        created_at: profile.created_at,
        last_login_at: firstText(priv.last_login_at, auth.last_sign_in_at, payload.last_sign_in_at),
        last_login_ip: priv.last_login_ip != null ? String(priv.last_login_ip) : '',
        referral_count: Array.isArray(payload.referrals) ? payload.referrals.length : 0,
        wallet: {
          support: parseLedgerAmount(summary.support ?? buckets.support_grant?.available_amount),
          work: parseLedgerAmount(summary.work ?? buckets.work_balance?.available_amount),
          task: parseLedgerAmount(summary.task ?? buckets.task_reward?.available_amount),
          referral: parseLedgerAmount(summary.referral ?? buckets.referral_reward?.available_amount),
          available: parseLedgerAmount(summary.available ?? available.available_amount),
          held: parseLedgerAmount(summary.work_held ?? buckets.work_balance?.held_amount ?? summary.held ?? held.held_amount)
        },
        daily_task_quota: payload.daily_task_quota || null,
        daily_task_limit_override: payload.daily_task_limit_override ?? payload.profile?.daily_task_limit_override ?? null,
        extra_task_starts: Number(payload.extra_task_starts ?? payload.profile?.extra_task_starts ?? 0),
        pii_access: payload.pii_access === true,
        pii_masked: payload.pii_masked === true
      };
    }
    return normalizeMemberRow(payload);
  }

  function referralStatusLabel(status) {
    return ({
      joined: '가입',
      verified: '계정 활성화',
      funded: '입금 확인',
      qualified: '조건 충족',
      paid: '보상 확정',
      held: '보상 보류',
      rejected: '보상 반려'
    })[status] || '확인 중';
  }

  function financeStatusLabel(status) {
    return ({
      submitted: '접수',
      checking: '확인 중',
      pending: '대기',
      approved: '승인',
      rejected: '반려',
      cancelled: '취소',
      sent: '완료',
      completed: '완료',
      processing: '처리 중'
    })[status] || '처리 중';
  }

  function memberStatusLabel(status) {
    return ({
      active: '활동 중',
      pending: '대기',
      blocked: '차단',
      suspended: '정지'
    })[status] || '확인 중';
  }

  function kycStatusLabel(status) {
    return ({
      pending: '미제출',
      submitted: '검수 대기',
      review_pending: '검수 대기',
      checking: '확인 중',
      approved: '확인 완료',
      rejected: '반려'
    })[status] || '미제출';
  }

  const MEMBER_TIERS = ['일반 파트너', '인증 파트너', '우수 파트너', '글로벌 디렉터'];
  const MEMBER_BANDS = [
    { raw: '일반 파트너', label: '라인', tone: 'line', badge: '01', ladder: '소액 3·5·7·10만 칸', perks: ['기본 라인 근무', '다음 한 칸씩 완료 해금', '잠금 잔액이 있으면 그 금액 칸부터 출근'], stats: [{ icon: 'briefcase', label: '오늘 선택', value: '기본 라인' }, { icon: 'hourglass', label: '검수 순서', value: '보통' }, { icon: 'unlock', label: '다음 칸', value: '한 칸씩 해금' }] },
    { raw: '인증 파트너', label: '크루', tone: 'crew', badge: '02', ladder: '중간 30·50·100만 칸', perks: ['주간 근무 자리', '중간 금액 칸 안내', '기본 라인 근무 유지'], stats: [{ icon: 'briefcase', label: '오늘 선택', value: '라인보다 여유' }, { icon: 'hourglass', label: '검수 순서', value: '조금 빠름' }, { icon: 'building-2', label: '자리', value: '같은 협력사 이어서' }] },
    { raw: '우수 파트너', label: '선임', tone: 'lead', badge: '03', ladder: '고액 300·500·1000만 칸', perks: ['우선 집기', '고액 사전 공지', '주간 근무 자리'], stats: [{ icon: 'star', label: '우선 집기', value: '주간 물량' }, { icon: 'hourglass', label: '검수 순서', value: '더 빨리' }, { icon: 'bell', label: '안내', value: '다음 칸 먼저' }] },
    { raw: '글로벌 디렉터', label: '전담', tone: 'desk', badge: '04', ladder: '초고액은 운영자 배정', perks: ['전담 라인', '우선 집기', '고액 사전 공지', '주간 근무 자리'], stats: [{ icon: 'shield-check', label: '전담 큐', value: '고액 사전 공지' }, { icon: 'hourglass', label: '검수 순서', value: '가장 먼저' }, { icon: 'lock', label: '초고액', value: '운영자 배정' }] }
  ];
  const NODE_FILTER_HINTS = {
    all: '오늘 열린 라인을 모두 봐요.',
    '빠른 확인': '짧은 시간 칸이에요. 처음 출근하기 좋아요.',
    '일반 처리': '기본 근무 칸이에요. 잠금과 수당을 보고 골라요.',
    '집중 처리': '조금 더 오래 보는 칸이에요.',
    '전문 검수': '검수가 촘촘한 칸이에요. 잠금이 더 커요.'
  };

  function normalizePhone(value) {
    const digits = String(value || '').replace(/\D/g, '');
    if (digits.startsWith('010') && digits.length === 11) return `+82${digits.slice(1)}`;
    if (digits.startsWith('82')) return `+${digits}`;
    return digits ? `+${digits}` : '';
  }

  function normalizeBirth(value) {
    const digits = String(value || '').replace(/\D/g, '');
    if (!/^\d{6}$/.test(digits)) return '';
    const yy = Number(digits.slice(0, 2));
    const year = yy <= Number(String(new Date().getFullYear()).slice(2)) ? 2000 + yy : 1900 + yy;
    return `${year}-${digits.slice(2, 4)}-${digits.slice(4, 6)}`;
  }

  function formatDuration(seconds) {
    const total = Math.max(1, Math.round(Number(seconds || 60)));
    if (total < 60) return `${total}초`;
    const minutes = Math.floor(total / 60);
    const remainder = total % 60;
    return remainder ? `${minutes}분 ${remainder}초` : `${minutes}분`;
  }

  const CATALOG_BRAND_SELECT_PHOTO = 'id,slug,display_name_ko,category,description_ko,verification_status,logo_usage_status,logo_asset_path,photo_asset_path,published';
  const CATALOG_BRAND_SELECT = 'id,slug,display_name_ko,category,description_ko,verification_status,logo_usage_status,logo_asset_path,published';
  const CATALOG_NODE_SELECT_STAKE = 'id,public_id,partner_brand_id,title_ko,description_ko,node_family,difficulty,estimated_seconds,reward_min,reward_max,stake_krw,stipend_krw,is_trial,tier_band,requires_assign,question_prompt_ko,question_image_path,choice_a_ko,choice_b_ko,daily_cap,daily_capacity,motion_profile,motion_version,enabled,catalog_status';
  const CATALOG_NODE_SELECT = 'id,public_id,partner_brand_id,title_ko,description_ko,node_family,difficulty,estimated_seconds,reward_min,reward_max,daily_capacity,motion_profile,motion_version,enabled,catalog_status';
  const BRAND_PALETTE = ['#0d9f76', '#d49a17', '#5d4fb2', '#0a7180', '#c85b27', '#2b5da7', '#bc2039', '#78502c'];

  function mapPublishedBrand(row, index) {
    return {
      id: row.id,
      slug: row.slug,
      name: row.display_name_ko,
      label: row.category,
      mark: String(row.display_name_ko || 'PD').slice(0, 3),
      color: BRAND_PALETTE[index % BRAND_PALETTE.length],
      status: '공개 승인',
      category: row.category,
      copy: row.description_ko || '',
      logo_asset_path: row.logo_asset_path || '',
      photo_asset_path: row.photo_asset_path || '',
      logoUrl: brandAssetSrc(row.logo_asset_path, row.slug, 'logo'),
      photoUrl: brandAssetSrc(row.photo_asset_path, row.slug, 'photo'),
      verified: true,
      published: true
    };
  }

  function mapPublishedNode(row, companyColors) {
    return {
      id: row.id,
      publicId: row.public_id,
      companyId: row.partner_brand_id,
      title: row.title_ko,
      copy: row.description_ko,
      time: Number(row.estimated_seconds || 60),
      minutes: formatDuration(Number(row.estimated_seconds || 60)),
      reward: Number(row.stipend_krw ?? row.reward_max ?? row.reward_min ?? 0),
      rewardMin: Number(row.reward_min ?? 0),
      rewardMax: Number(row.reward_max ?? row.reward_min ?? 0),
      stake: Number(row.stake_krw || 0),
      stipend: Number(row.stipend_krw ?? row.reward_min ?? 0),
      level: row.difficulty || '일반 처리',
      icon: 'scan-line',
      color: companyColors[row.partner_brand_id] || '#0d9f76',
      available: Number(row.daily_cap || row.daily_capacity || 0),
      motion: row.motion_profile || 'default',
      motionVersion: row.motion_version || '1.0.0',
      enabled: row.enabled === true && row.catalog_status === 'published',
      isTrial: row.is_trial === true || row.tier_band === '체험',
      tierBand: row.tier_band || '',
      requiresAssign: row.requires_assign === true || row.tier_band === '초고액',
      question: row.question_prompt_ko || '',
      questionImage: row.question_image_path || '',
      choiceA: row.choice_a_ko || '맞아요',
      choiceB: row.choice_b_ko || '달라요',
      assigned: false
    };
  }

  function applyAssignmentOverlay(assignment) {
    const node = nodes.find((item) => String(item.id) === String(assignment.node_id));
    if (!node) return;
    node.assigned = true;
    node.assignmentId = assignment.id;
    node.enabled = true;
    if (assignment.reward_amount != null && assignment.reward_amount !== '') {
      const pay = Number(assignment.reward_amount);
      if (Number.isFinite(pay) && pay >= 0) {
        node.reward = pay;
        node.stipend = pay;
      }
    }
    if (assignment.estimated_seconds != null) {
      const seconds = Number(assignment.estimated_seconds);
      if (seconds >= 30) {
        node.time = seconds;
        node.minutes = formatDuration(seconds);
      }
    }
  }

  async function hydrateMemberAssignments() {
    if (isAdmin || !supabaseClient || !authState.session) {
      state.assignments = [];
      return;
    }
    const result = await supabaseClient
      .from('task_assignments')
      .select('id,node_id,partner_brand_id,reward_amount,estimated_seconds,reason,status,visible_from,visible_until')
      .eq('user_id', authState.session.user.id)
      .eq('status', 'active');
    if (result.error || !Array.isArray(result.data)) return;
    state.assignments = result.data;
    const missingNodeIds = result.data
      .map((row) => row.node_id)
      .filter((id) => id && !nodes.some((node) => String(node.id) === String(id)));
    if (missingNodeIds.length) {
      let extraNodes = await supabaseClient.from('nodes').select(CATALOG_NODE_SELECT_STAKE).in('id', missingNodeIds);
      if (extraNodes.error && /stake_krw|stipend_krw|is_trial|tier_band|requires_assign|question_prompt_ko/i.test(String(extraNodes.error.message || extraNodes.error))) {
        extraNodes = await supabaseClient.from('nodes').select(CATALOG_NODE_SELECT).in('id', missingNodeIds);
      }
      if (!extraNodes.error && Array.isArray(extraNodes.data)) {
        const companyColors = Object.fromEntries(companies.map((company) => [company.id, company.color]));
        extraNodes.data.forEach((row) => {
          if (nodes.some((node) => String(node.id) === String(row.id))) return;
          nodes.push(mapPublishedNode(row, companyColors));
        });
      }
    }
    const missingBrandIds = result.data
      .map((row) => row.partner_brand_id)
      .filter((id) => id && !companies.some((company) => String(company.id) === String(id)));
    if (missingBrandIds.length) {
      let extraBrands = await supabaseClient.from('partner_brands').select(CATALOG_BRAND_SELECT_PHOTO).in('id', missingBrandIds);
      if (extraBrands.error && /photo_asset_path/i.test(String(extraBrands.error.message || extraBrands.error))) {
        extraBrands = await supabaseClient.from('partner_brands').select(CATALOG_BRAND_SELECT).in('id', missingBrandIds);
      }
      if (!extraBrands.error && Array.isArray(extraBrands.data)) {
        extraBrands.data.forEach((row) => {
          if (companies.some((company) => String(company.id) === String(row.id))) return;
          companies.push(mapPublishedBrand(row, companies.length));
        });
        const companyColors = Object.fromEntries(companies.map((company) => [company.id, company.color]));
        nodes.forEach((node) => {
          if (!node.color || node.color === '#0d9f76') node.color = companyColors[node.companyId] || node.color;
        });
      }
    }
    result.data.forEach(applyAssignmentOverlay);
    state.companies = companies;
    state.nodeEnabled = Object.fromEntries(nodes.map((node) => [node.id, node.enabled !== false]));
  }

  async function hydratePublishedCatalog() {
    if (isAdmin || !supabaseClient || !authState.session) return;
    let brandQuery = supabaseClient.from('partner_brands').select(CATALOG_BRAND_SELECT_PHOTO).order('display_name_ko', { ascending: true });
    const [brandFirst, nodeFirst] = await Promise.all([
      brandQuery,
      supabaseClient.from('nodes').select(CATALOG_NODE_SELECT_STAKE).order('created_at', { ascending: false })
    ]);
    let brandResult = brandFirst;
    let nodeResult = nodeFirst;
    if (brandResult.error && /photo_asset_path/i.test(String(brandResult.error.message || brandResult.error))) {
      brandResult = await supabaseClient.from('partner_brands').select(CATALOG_BRAND_SELECT).order('display_name_ko', { ascending: true });
    }
    if (nodeResult.error && /stake_krw|stipend_krw|is_trial|tier_band|requires_assign|question_prompt_ko/i.test(String(nodeResult.error.message || nodeResult.error))) {
      nodeResult = await supabaseClient.from('nodes').select(CATALOG_NODE_SELECT).order('created_at', { ascending: false });
    }
    if (brandResult.error || nodeResult.error) {
      authState.error = brandResult.error || nodeResult.error;
      return;
    }
    const brandRows = Array.isArray(brandResult.data) ? brandResult.data : [];
    const nodeRows = Array.isArray(nodeResult.data) ? nodeResult.data : [];
    companies = brandRows.map((row, index) => mapPublishedBrand(row, index));
    const companyColors = Object.fromEntries(companies.map((company) => [company.id, company.color]));
    nodes = nodeRows.map((row) => mapPublishedNode(row, companyColors));
    state.companies = companies;
    state.nodeEnabled = Object.fromEntries(nodes.map((node) => [node.id, node.enabled !== false]));
    await hydrateMemberAssignments();
  }

  function motionProfileOf(node) {
    return String(node?.motion || node?.motion_profile || 'default');
  }

  function motionSceneCopy(node, progress) {
    const profile = motionProfileOf(node);
    if (progress < 0.25) return { label: '데이터센터·회선 연결', copy: '서울 노드와 연결 중이에요.', icon: 'radio-tower' };
    if (progress < 0.58) {
      if (profile.includes('ocean') || profile === 'ocean_vessel') return { label: '해상 항로 이동', copy: '컨테이너 상태를 대조하고 있어요.', icon: 'ship' };
      if (profile.includes('air') || profile === 'air_cargo' || profile === 'document') return { label: '항공 운송 비교', copy: '항공 운송 데이터를 비교하고 있어요.', icon: 'plane' };
      if (profile.includes('catalog') || profile === 'commerce_catalog') return { label: '상품 속성 정리', copy: '상품 속성 정보를 정리하고 있어요.', icon: 'package' };
      if (profile.includes('warehouse')) return { label: '창고 격자 확인', copy: '재고 위치를 한 칸씩 맞추고 있어요.', icon: 'warehouse' };
      return { label: '배송 경로 분석', copy: '배송 데이터 경로를 분석하고 있어요.', icon: 'truck' };
    }
    if (progress < 0.83) return { label: '비교·품질검사', copy: '오류 항목을 분리하고 있어요.' };
    return { label: '검수 대기·동기화', copy: '보상은 운영자 검수 후 확정돼요.' };
  }

  function formatNoticeTime(value) {
    const at = new Date(value || Date.now());
    if (Number.isNaN(at.getTime())) return '';
    return at.toLocaleString('ko-KR', { month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit' });
  }

  function mapNoticeRow(row) {
    const body = sanitizeMemberNotice(row?.body);
    const title = sanitizeMemberNotice(row?.title);
    return {
      id: row?.id,
      title: title || '안내',
      text: body || title || '📬 새 안내가 도착했어요.',
      time: formatNoticeTime(row?.created_at),
      type: row?.notification_type || 'info',
      read: Boolean(row?.read_at)
    };
  }

  function unreadNoticeCount() {
    return (state.notifications || []).filter((item) => item && !item.read).length;
  }

  function noticeBellLabel() {
    const unread = unreadNoticeCount();
    return unread ? `알림, 안 읽은 안내 ${unread}건` : '알림';
  }

  function noticeBellButtonHtml() {
    const unread = unreadNoticeCount();
    const badge = unread > 0 ? `<span class="notice-badge">${unread > 99 ? '99+' : unread}</span>` : '';
    return `<button type="button" class="icon-button notice-bell" data-notification="1" aria-label="알림${unread ? `, 안 읽은 안내 ${unread}건` : ''}">${icon('bell', 17)}${badge}</button>`;
  }

  function notificationsOverlayBody() {
    const rows = Array.isArray(state.notifications) ? state.notifications : [];
    const unread = unreadNoticeCount();
    const digest = rows.slice(0, 16).map((item) => `${item?.id || ''}:${item?.read ? 1 : 0}`).join('|');
    return `${unread}:${rows.length}:${digest}`;
  }

  function noticeListMarkup() {
    const hasItems = (state.notifications || []).length > 0;
    if (!hasItems) {
      return `<div class="empty-state compact"><strong>새 안내가 없어요.</strong><p>운영자가 보내면 종 숫자에 바로 보여요.</p></div>`;
    }
    return (state.notifications || []).map((item) => {
      const unreadMark = item.read ? '읽음' : '안 읽음';
      return `<div class="notice-row ${item.read ? '' : 'is-unread'}" data-notice-id="${esc(item.id || '')}"><span class="notice-dot" aria-hidden="true"></span><div class="company-info"><strong>${esc(item.text)}</strong><small>${esc(item.time)} · ${unreadMark}</small></div><button type="button" class="small-button notice-delete" style="margin-left:auto;flex:0 0 auto" data-notice-delete="${esc(item.id || '')}" aria-label="알림 삭제">삭제</button></div>`;
    }).join('');
  }

  function noticeToolbarMarkup() {
    const unread = unreadNoticeCount();
    const hasItems = (state.notifications || []).length > 0;
    if (!hasItems) return '';
    const markAll = unread > 0
      ? `<button class="text-link" type="button" data-action="mark-notices-read">모두 읽음</button>`
      : '';
    return `<div class="notice-toolbar">${unread ? `<span>📬 안 읽은 안내 ${unread}건</span>` : '<span>✅ 모두 확인했어요</span>'}${markAll}</div>`;
  }

  function patchNotificationsModal() {
    const root = document.querySelector('[data-modal="notifications"]');
    if (!root) return;
    const toolbar = root.querySelector('.notice-toolbar');
    const list = root.querySelector('.notice-list');
    const nextToolbar = noticeToolbarMarkup();
    if (toolbar) toolbar.outerHTML = nextToolbar;
    else if (nextToolbar) root.querySelector('.modal-body')?.insertAdjacentHTML('afterbegin', nextToolbar);
    if (list) list.innerHTML = noticeListMarkup();
    root.setAttribute('data-stable', '1');
  }

  function paintNoticeBadge() {
    document.querySelectorAll('[data-notification]').forEach((button) => {
      const unread = unreadNoticeCount();
      button.setAttribute('aria-label', noticeBellLabel());
      let badge = button.querySelector('.notice-badge');
      if (unread > 0) {
        if (!badge) {
          badge = document.createElement('span');
          badge.className = 'notice-badge';
          button.appendChild(badge);
        }
        badge.textContent = unread > 99 ? '99+' : String(unread);
      } else if (badge) {
        badge.remove();
      }
    });
  }

  function flushPendingToast() {
    if (!state.toast) return;
    const pending = state.toast;
    state.toast = null;
    showToast(pending.text, pending.kind, true, pending.action || null);
  }

  function arrivedNoticeToast(item) {
    if (item?.type === 'work') return '📬 새 근무가 배정됐어요. 라인 찾기에서 확인해 주세요.';
    return '📬 새 안내가 도착했어요. 종을 눌러 확인해 주세요.';
  }

  function ingestNoticeRow(row, { toast = false } = {}) {
    if (!row?.id) return;
    const mapped = mapNoticeRow(row);
    const list = Array.isArray(state.notifications) ? state.notifications.slice() : [];
    const index = list.findIndex((item) => item.id === mapped.id);
    if (index >= 0) list[index] = { ...list[index], ...mapped };
    else list.unshift(mapped);
    state.notifications = list.slice(0, 50);
    if (toast && !mapped.read && state.modal !== 'notifications') {
      state.toast = { text: arrivedNoticeToast(mapped), kind: 'info', action: { id: 'open-notices', label: '확인' } };
    }
  }

  async function refreshMemberNotices({ toastNew = false } = {}) {
    if (!supabaseClient || !authState.session) return state.notifications || [];
    const previousIds = new Set((state.notifications || []).map((item) => item.id).filter(Boolean));
    const noticeResult = await supabaseClient
      .from('notifications')
      .select('id,title,body,notification_type,created_at,read_at')
      .eq('user_id', authState.session.user.id)
      .order('created_at', { ascending: false })
      .limit(50);
    if (noticeResult.error || !Array.isArray(noticeResult.data)) return state.notifications || [];
    const mapped = noticeResult.data.map(mapNoticeRow);
    const arrived = toastNew && noticesHydrated
      ? mapped.find((item) => item.id && !item.read && !previousIds.has(item.id))
      : null;
    state.notifications = mapped;
    noticesHydrated = true;
    if (arrived && state.modal !== 'notifications') {
      state.toast = { text: arrivedNoticeToast(arrived), kind: 'info', action: { id: 'open-notices', label: '확인' } };
    }
    return mapped;
  }

  async function deleteNotification(id) {
    const notificationId = String(id || '').trim();
    if (!notificationId || !supabaseClient || !authState.session) return false;
    const result = await supabaseClient.rpc('putduk_archive_notification', { p_notification_id: notificationId });
    if (result.error || result.data !== true) {
      showToast('알림을 삭제하지 못했어요. 잠시 후 다시 시도해 주세요.', 'info');
      return false;
    }
    state.notifications = (state.notifications || []).filter((item) => String(item?.id || '') !== notificationId);
    paintNoticeBadge();
    if (state.modal === 'notifications') patchNotificationsModal();
    return true;
  }

  async function markNoticesRead(ids) {
    const unique = [...new Set((ids || []).filter(Boolean))];
    if (!unique.length || !supabaseClient || !authState.session) return;
    const now = new Date().toISOString();
    const { error } = await supabaseClient
      .from('notifications')
      .update({ read_at: now })
      .in('id', unique)
      .is('read_at', null);
    if (error) {
      showToast('읽음으로 바꾸지 못했어요. 잠시 후 다시 눌러 주세요.', 'info');
      return;
    }
    state.notifications = (state.notifications || []).map((item) => unique.includes(item.id) ? { ...item, read: true } : item);
  }

  function stopMemberLive() {
    if (memberLiveChannel && supabaseClient) {
      try { supabaseClient.removeChannel(memberLiveChannel); } catch (_) {}
    }
    memberLiveChannel = null;
    memberLiveUserId = null;
  }

  function startMemberLive(userId) {
    if (isAdmin || !supabaseClient || !userId) {
      stopMemberLive();
      return;
    }
    if (memberLiveUserId === userId && memberLiveChannel) return;
    stopMemberLive();
    memberLiveUserId = userId;
    memberLiveChannel = supabaseClient
      .channel(`member-live:${userId}`)
      .on('postgres_changes', {
        event: 'INSERT',
        schema: 'public',
        table: 'notifications',
        filter: `user_id=eq.${userId}`
      }, (payload) => {
        ingestNoticeRow(payload.new, { toast: true });
        const work = payload.new?.notification_type === 'work';
        const job = work ? hydrateMemberAssignments() : Promise.resolve();
        job.then(() => {
          if (state.modal === 'notifications' || work || !state.modal) render();
          else {
            paintNoticeBadge();
            flushPendingToast();
          }
        }).catch(() => {});
      })
      .on('postgres_changes', {
        event: 'UPDATE',
        schema: 'public',
        table: 'notifications',
        filter: `user_id=eq.${userId}`
      }, (payload) => {
        ingestNoticeRow(payload.new, { toast: false });
        if (state.modal === 'notifications') render();
        else paintNoticeBadge();
      })
      .on('postgres_changes', {
        event: '*',
        schema: 'public',
        table: 'task_assignments',
        filter: `user_id=eq.${userId}`
      }, () => {
        hydrateMemberAssignments().then(() => {
          if (!state.modal) render();
        }).catch(() => {});
      })
      .subscribe();
  }

  async function openNoticeItem(id) {
    if (id) await markNoticesRead([id]);
    paintNoticeBadge();
    const item = (state.notifications || []).find((row) => String(row.id) === String(id));
    if (item?.type === 'work') {
      state.memberPage = 'nodes';
      await hydrateMemberAssignments();
      closeModal();
      showToast('✅ 배정된 라인을 라인 찾기에서 확인해요.', 'success');
      return;
    }
    if (state.modal === 'notifications') {
      patchNotificationsModal();
      return;
    }
    render();
  }

  async function markAllNoticesRead() {
    const ids = (state.notifications || []).filter((item) => item && !item.read).map((item) => item.id).filter(Boolean);
    if (!ids.length) return;
    await markNoticesRead(ids);
    paintNoticeBadge();
    if (state.modal === 'notifications') {
      patchNotificationsModal();
      return;
    }
    render();
  }

  async function openMemberNotices() {
    await refreshMemberNotices({ toastNew: false });
    const unreadIds = (state.notifications || []).filter((item) => item && !item.read).map((item) => item.id).filter(Boolean);
    openModal('notifications');
    if (unreadIds.length) {
      await markNoticesRead(unreadIds);
      paintNoticeBadge();
    }
    if (state.modal === 'notifications') {
      if (document.querySelector('[data-modal="notifications"]')) patchNotificationsModal();
      else render();
    }
  }

  async function hydrateSession(session, options = {}) {
    const light = options.light === true;
    const previousHistory = Array.isArray(state.history) ? state.history : [];
    const previousHistoryMap = new Map(previousHistory.map((item) => [item.id, item.status]));
    authState.session = session || null;
    authState.error = null;
    if (!session) {
      dailyQuotaRequestId += 1;
      clearDailyQuotaRetry();
      noticesHydrated = false;
      stopMemberLive();
      authState.loading = false;
      authState.profile = null;
      activeStorageKey = storageKey;
      state = loadState(storageKey);
      return;
    }
    if (signedOutLock) return;
    const sameUser = activeStorageKey === `${storageKey}:${session.user.id}`;
    switchToUserState(session.user.id);
    if (isAdmin) {
      authState.loading = false;
      return;
    }
    void hydrateDailyTaskQuota();
    startMemberLive(session.user.id);
    if (!sameUser) {
      state.wallet = { support: null, work: null, task: null, referral: null, available: null, held: null };
      state.dailyTaskQuota = null;
      state.history = [];
      state.referrals = [];
      state.deposits = [];
      state.withdrawals = [];
    }
    if (!supabaseClient) { authState.loading = false; return; }
    try {
      const [profileResult, walletResult, runResult] = await Promise.all([
        supabaseClient
          .from('profiles')
          .select('public_id,display_name,member_tier,status,referral_code,trial_consumed_at')
          .eq('id', session.user.id)
          .maybeSingle(),
        supabaseClient
          .from('wallet_accounts')
          .select('bucket,currency,available_amount,held_amount')
          .eq('user_id', session.user.id)
          .eq('currency', 'KRW'),
        supabaseClient
          .from('task_runs')
          .select('id,public_id,node_id,status,reward_amount,reward_status,started_at,created_at,completed_at,expected_completed_at,motion_variant,motion_seed,updated_at')
          .eq('user_id', session.user.id)
          .order('created_at', { ascending: false })
          .limit(50)
      ]);
      if (signedOutLock || authState.session?.user?.id !== session.user.id) return;
      const runRows = Array.isArray(runResult.data) ? runResult.data : [];
      const needsCatalogForRunState = runRows.some((row) => row.status === 'approved' || isActiveRunStatus(row.status) || isReviewWaitStatus(row.status) || REWORK_RUN_STATUSES.includes(row.status));
      if (needsCatalogForRunState) {
        await hydratePublishedCatalog();
      } else if (!light || nodes.length === 0) {
        void hydratePublishedCatalog().then(() => {
          if (authState.session?.user?.id === session.user.id && !state.modal) render();
        }).catch(() => {});
      }
      if (profileResult.error) throw profileResult.error;
      authState.profile = profileResult.data || null;
      if (!walletResult.error && Array.isArray(walletResult.data) && walletResult.data.length) {
        applyWalletRows(walletResult.data);
      }
      if (!runResult.error && Array.isArray(runResult.data)) {
        state.history = runResult.data.map((row) => ({
          id: row.public_id,
          dbId: row.id,
          nodeId: row.node_id,
          status: runStatusLabel(row.status),
          statusRaw: row.status,
          runStatus: row.status,
          rewardStatus: row.reward_status || '',
          reward: parseLedgerAmount(row.reward_amount),
          date: new Date(row.completed_at || row.updated_at || row.created_at).toLocaleString('ko-KR', { month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit' }),
          createdAt: row.created_at,
          submittedAt: row.completed_at || row.updated_at || row.created_at,
          duration: row.completed_at && row.created_at ? `${Math.max(1, Math.round((new Date(row.completed_at) - new Date(row.created_at)) / 1000))}초` : '진행 중'
        }));
        const newlyApproved = runResult.data.find((row) => row.status === 'approved' && ['검수 대기', '제출 완료'].includes(previousHistoryMap.get(row.public_id)) && state.lastReviewToastId !== row.public_id);
        if (newlyApproved) {
          const approvedNode = nodeById(newlyApproved.node_id);
          state.lastReviewToastId = newlyApproved.public_id;
          const posted = isPostedReward(newlyApproved.reward_status, newlyApproved.status);
          const availableNow = parseLedgerAmount(state.wallet.available);
          state.toast = {
            text: posted && availableNow != null && availableNow > 0
              ? '🎉 검수가 끝났어요. 확정 수당이 출금가능 칸에 보여요.'
              : '🎉 검수가 끝났어요. 확정 보상은 원장에 오른 뒤에 출금가능에 보여요.',
            kind: 'success'
          };
          openResultScene(approvedNode, {
            cut: 'approve',
            principal: nodeStake(approvedNode),
            stipend: Number(newlyApproved.reward_amount || nodePay(approvedNode))
          });
        }
        if (state.history[0]?.nodeId) rememberCrewPartner(nodeById(state.history[0].nodeId).companyId);
        if (config.enableWorkApi === true) {
          const active = runResult.data.find((row) => isActiveRunStatus(row.status));
          const waiting = runResult.data.find((row) => isReviewWaitStatus(row.status) || REWORK_RUN_STATUSES.includes(row.status));
          if (active) {
            const activeNode = nodeById(active.node_id);
            rememberCrewPartner(activeNode.companyId);
            const startedAt = Date.parse(active.started_at || '') || Date.now();
            const expectedAt = Date.parse(active.expected_completed_at || '') || (startedAt + activeNode.time * 1000);
            const duration = Math.max(1000, expectedAt - startedAt);
            state.run = {
              id: active.public_id,
              dbId: active.id,
              nodeId: active.node_id,
              status: active.status,
              startedAt,
              expectedCompletedAt: expectedAt,
              duration,
              progress: Math.min(1, Math.max(0, (Date.now() - startedAt) / duration)),
              overlayOpen: overlayDismissed ? false : true,
              logs: state.run?.logs || ['[복원] 서버에 저장된 업무 상태를 다시 연결했어요.'],
              serverBacked: true,
              rewardAmount: parseLedgerAmount(active.reward_amount),
              motionVariant: active.motion_variant || 'a',
              motionSeed: active.motion_seed || '',
              choice: state.player?.choice || state.run?.choice || null,
              _submitted: false
            };
            state.reviewWait = null;
            if (!state.player) {
              const photo = activeNode.questionImage
                ? brandAssetSrc(activeNode.questionImage, companyById(activeNode.companyId).slug, 'photo')
                : null;
              state.player = {
                nodeId: active.node_id,
                choice: null,
                question: playerQuestion(activeNode),
                photo,
                bundle: initBundleForNode(activeNode, companyById(activeNode.companyId), state.run),
                listing: {}
              };
            } else {
              state.player.bundle = syncInspectBundle(state.player.bundle, activeNode, state.run);
              if (!isInspectBundleComplete(state.player.bundle)) state.player.choice = null;
            }
            const draftResult = await supabaseClient
              .from('task_checkpoints')
              .select('checkpoint_payload')
              .eq('task_run_id', active.id)
              .eq('checkpoint_key', 'work-draft')
              .maybeSingle();
            const draft = draftResult.data?.checkpoint_payload;
            if (draft && typeof draft === 'object') {
              if (draft.listing) state.player.listing = readCatalogListing(draft.listing);
              if (Array.isArray(draft.answers) && state.player.bundle) {
                state.player.bundle.answers = draft.answers.slice(0, INSPECT_TOTAL);
                state.player.bundle.current = Math.min(INSPECT_TOTAL, Number(draft.current || draft.answers.length || 0));
              }
            }
          } else if (waiting) {
            const waitNode = nodeById(waiting.node_id);
            rememberCrewPartner(waitNode.companyId);
            state.player = null;
            state.run = null;
            state.startNodeId = null;
            const sameWait = [state.reviewWait?.dbId, state.reviewWait?.id]
              .filter(Boolean)
              .some((id) => String(id) === String(waiting.id) || String(id) === String(waiting.public_id));
            state.reviewWait = {
              id: waiting.public_id,
              dbId: waiting.id,
              nodeId: waiting.node_id,
              status: waiting.status,
              rewardAmount: parseLedgerAmount(waiting.reward_amount),
              rewardStatus: waiting.reward_status || '',
              submittedAt: waiting.completed_at || waiting.updated_at || waiting.created_at,
              overlayOpen: sameWait
                ? Boolean(state.reviewWait?.overlayOpen)
                : !isReviewWaitDismissed(waiting.id, waiting.public_id)
            };
          } else {
            state.reviewWait = null;
            if (state.run?.serverBacked) state.run = null;
          }
        }
      }

      // 하루 한도 조회는 세션 전체 hydration 실패와 분리되어 있어야 합니다.
      void hydrateDailyTaskQuota();
      void refreshMemberNotices({ toastNew: !light }).catch(() => {});
      syncMemberPush(session, { prompt: false });
      if (!light) {
        void Promise.all([
          supabaseClient
            .from('referral_relations')
            .select('id,invitee_id,status,created_at,updated_at')
            .eq('referrer_id', session.user.id)
            .order('created_at', { ascending: false })
            .limit(50),
          supabaseClient
            .from('deposit_requests')
            .select('id,public_id,currency,amount,status,note,created_at,updated_at')
            .eq('user_id', session.user.id)
            .order('created_at', { ascending: false })
            .limit(20),
          supabaseClient
            .from('withdrawal_requests')
            .select('id,public_id,currency,amount,destination_type,status,transaction_reference,created_at,updated_at')
            .eq('user_id', session.user.id)
            .order('created_at', { ascending: false })
            .limit(20)
        ]).then(([referralResult, depositResult, withdrawalResult]) => {
          if (!referralResult.error && Array.isArray(referralResult.data)) {
            state.referrals = referralResult.data.map((row, index) => ({
              id: row.id,
              label: `추천 회원 ${index + 1}`,
              status: row.status,
              createdAt: row.created_at
            }));
          }
          if (!depositResult.error && Array.isArray(depositResult.data)) state.deposits = depositResult.data;
          if (!withdrawalResult.error && Array.isArray(withdrawalResult.data)) state.withdrawals = withdrawalResult.data;
        }).catch(() => {});
      }
    } catch (error) {
      authState.error = error;
    } finally {
      authState.loading = false;
      syncChannelTalk();
    }
  }

  async function hydrateAdminAuthorization() {
    authState.adminAuthorized = !isAdmin;
    authState.adminRoles = [];
    authState.adminAuthError = null;
    if (!isAdmin) return;

    authState.adminLoading = true;
    if (!authState.session || !adminFunctionUrl) {
      authState.adminLoading = false;
      return;
    }

    try {
      const response = await fetch(adminFunctionUrl, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${authState.session.access_token}`,
          apikey: config.supabasePublishableKey || '',
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ action: 'me' })
      });
      const result = await response.json().catch(() => ({}));
      if (!response.ok || result.ok !== true) {
        authState.adminAuthError = String(result.error || '운영자 권한을 확인하지 못했어요.');
        return;
      }
      authState.adminAuthorized = true;
      authState.adminRoles = Array.isArray(result.roles) ? result.roles : [];
      authState.adminAuthError = null;
      void refreshMemberNotices({ toastNew: false }).then(() => paintNoticeBadge()).catch(() => {});
    } catch (error) {
      authState.adminAuthError = error?.message || '운영자 권한을 확인하지 못했어요.';
    } finally {
      authState.adminLoading = false;
      if (isAdmin && !state.modal) render();
    }
  }

  function settleMobileViewportAfterAuth() {
    if (isAdmin || typeof window === 'undefined') return;
    if (document.activeElement instanceof HTMLElement) document.activeElement.blur();
    window.scrollTo(0, 0);
  }

  function syncMemberPush(session, options = {}) {
    const push = window.PUTDUK_PUSH;
    if (isAdmin || !push || typeof push.subscribeWithSession !== 'function' || !session?.access_token) return;
    const prompt = options.prompt === true;
    const task = prompt && typeof push.maybePromptAfterLogin === 'function'
      ? push.maybePromptAfterLogin(session)
      : push.subscribeWithSession(session, { prompt: false });
    void Promise.resolve(task).catch(() => {});
  }

  function queueAdminPageData(options = {}) {
    if (!isAdmin || !authState.adminAuthorized) return;
    void refreshAdminPageData(options).then(() => {
      if (!state.modal) render();
    });
  }

  async function runAdminAuthorization({ toast = false } = {}) {
    if (!isAdmin) return false;
    const authorization = hydrateAdminAuthorization();
    if (!state.modal) render();
    await authorization;
    if (authState.adminAuthorized) queueAdminPageData({ silent: true });
    if (toast) {
      showToast(
        authState.adminAuthorized ? '운영 화면을 열었어요.' : '운영자 권한을 확인해 주세요.',
        authState.adminAuthorized ? 'success' : 'info'
      );
    }
    return authState.adminAuthorized;
  }

  let sessionRecorded = false;
  async function recordOwnSession() {
    if (!authState.session || sessionRecorded) return;
    sessionRecorded = true;
    try {
      if (isAdmin) await edgeRequest('record_session', {});
      else await memberFinanceRequest('record_session', {});
    } catch (_) {
      sessionRecorded = false;
    }
  }

  async function edgeRequest(action, payload = {}) {
    if (!authState.session || !adminFunctionUrl) {
      throw new Error('로그인이 필요해요.');
    }
    const response = await fetch(adminFunctionUrl, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${authState.session.access_token}`,
        apikey: config.supabasePublishableKey || '',
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ action, ...payload })
    });
    const result = await response.json().catch(() => ({}));
    if (!response.ok || result.ok !== true) {
      throw new Error(result.error || '요청을 처리하지 못했어요.');
    }
    return result;
  }

  async function memberFinanceRequest(action, payload = {}) {
    if (!memberFinanceUrl || !supabaseClient) {
      if (!authState.session) throw new Error('로그인이 필요해요.');
      throw new Error('인증 서버가 준비되지 않았어요.');
    }

    // Supabase JS가 자동 갱신한 최신 세션을 먼저 동기화한다.
    let session = authState.session;
    try {
      const { data, error } = await supabaseClient.auth.getSession();
      if (error) throw error;
      if (data?.session) {
        session = data.session;
        authState.session = data.session;
      }
    } catch (_) {
      session = authState.session;
    }

    if (!session) throw new Error('로그인이 필요해요.');

    const request = async (accessToken) => fetch(memberFinanceUrl, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${accessToken}`,
        apikey: config.supabasePublishableKey || '',
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ action, ...payload })
    });

    let response = await request(session.access_token);

    // 토큰이 갱신되는 순간의 경쟁 상태로 401이 나면 최신 세션을 한 번만 재확인한다.
    if (response.status === 401) {
      try {
        const { data, error } = await supabaseClient.auth.refreshSession();
        if (!error && data?.session) {
          session = data.session;
          authState.session = data.session;
          response = await request(session.access_token);
        }
      } catch (_) {}
    }

    const result = await response.json().catch(() => ({}));
    if (!response.ok || result.ok !== true) {
      const err = new Error(result.error || '요청을 처리하지 못했어요.');
      err.code = result.code;
      err.status = response.status;
      throw err;
    }
    return result;
  }

  let dailyQuotaRequestId = 0;
  let dailyQuotaRetryTimer = null;

  function clearDailyQuotaRetry() {
    if (dailyQuotaRetryTimer) {
      window.clearTimeout(dailyQuotaRetryTimer);
      dailyQuotaRetryTimer = null;
    }
  }

  async function hydrateDailyTaskQuota({ retry = 0 } = {}) {
    if (isAdmin || !authState.session) return;
    if (!memberFinanceUrl) {
      state.dailyTaskQuota = null;
      state.dailyTaskQuotaError = '오늘 남은 횟수를 조회할 경로가 설정되지 않았어요.';
      paintDailyQuota();
      return;
    }
    const requestId = ++dailyQuotaRequestId;
    const userId = authState.session.user.id;
    clearDailyQuotaRetry();
    state.dailyTaskQuotaError = null;
    paintDailyQuota();

    try {
      const request = memberFinanceRequest('daily_task_quota');
      const timeout = new Promise((_, reject) => {
        window.setTimeout(() => reject(new Error('오늘 남은 횟수 조회 시간이 초과됐어요.')), 8000);
      });
      const quotaResult = await Promise.race([request, timeout]);
      if (requestId !== dailyQuotaRequestId || authState.session?.user?.id !== userId) return;
      const quota = quotaResult?.quota;
      if (!quota || typeof quota !== 'object') throw new Error('오늘 남은 횟수 응답이 올바르지 않아요.');
      if (!Object.prototype.hasOwnProperty.call(quota, 'daily_limit') || !Object.prototype.hasOwnProperty.call(quota, 'remaining_today')) {
        throw new Error('오늘 남은 횟수 정보가 비어 있어요.');
      }
      state.dailyTaskQuota = quota;
      state.dailyTaskQuotaError = null;
      scheduleKstQuotaReset(quota.resets_at);
      paintDailyQuota();
    } catch (error) {
      if (requestId !== dailyQuotaRequestId || authState.session?.user?.id !== userId) return;
      if (retry < 2) {
        dailyQuotaRetryTimer = window.setTimeout(() => {
          dailyQuotaRetryTimer = null;
          void hydrateDailyTaskQuota({ retry: retry + 1 });
        }, 750 * (retry + 1));
        return;
      }

      // Edge Function/CORS가 일시적으로 실패해도 authenticated 전용 RPC로 한 번 더 조회한다.
      if (supabaseClient) {
        try {
          const fallbackRequest = supabaseClient.rpc('putduk_member_daily_task_quota', { p_user_id: userId });
          const fallbackTimeout = new Promise((_, reject) => {
            window.setTimeout(() => reject(new Error('오늘 남은 횟수 직접 조회 시간이 초과됐어요.')), 5000);
          });
          const fallbackResult = await Promise.race([fallbackRequest, fallbackTimeout]);
          if (requestId !== dailyQuotaRequestId || authState.session?.user?.id !== userId) return;
          if (fallbackResult?.error) throw fallbackResult.error;
          const quota = fallbackResult?.data;
          if (!quota || typeof quota !== 'object') throw new Error('오늘 남은 횟수 정보가 비어 있어요.');
          if (!Object.prototype.hasOwnProperty.call(quota, 'daily_limit') || !Object.prototype.hasOwnProperty.call(quota, 'remaining_today')) {
            throw new Error('오늘 남은 횟수 정보가 올바르지 않아요.');
          }
          state.dailyTaskQuota = quota;
          state.dailyTaskQuotaError = null;
          scheduleKstQuotaReset(quota.resets_at);
          paintDailyQuota();
          return;
        } catch (fallbackError) {
          if (requestId !== dailyQuotaRequestId || authState.session?.user?.id !== userId) return;
          state.dailyTaskQuota = null;
          state.dailyTaskQuotaError = fallbackError?.message || error?.message || '오늘 남은 횟수를 불러오지 못했어요.';
          paintDailyQuota();
          return;
        }
      }

      state.dailyTaskQuota = null;
      state.dailyTaskQuotaError = error?.message || '오늘 남은 횟수를 불러오지 못했어요.';
      paintDailyQuota();
    }
  }

  let depositRevealTimer = null;

  function clearDepositRevealTimer() {
    if (depositRevealTimer) {
      clearInterval(depositRevealTimer);
      depositRevealTimer = null;
    }
  }

  function depositRevealRemaining() {
    const until = state.depositRevealExpiresAt ? new Date(state.depositRevealExpiresAt).getTime() : 0;
    return Math.max(0, Math.ceil((until - Date.now()) / 1000));
  }

  function isDepositRevealed() {
    return Boolean(state.depositReveal && depositRevealRemaining() > 0);
  }

  async function lockDepositReveal({ silent = false } = {}) {
    const token = state.depositRevealToken;
    clearDepositRevealTimer();
    state.depositReveal = null;
    state.depositRevealExpiresAt = null;
    state.depositRevealToken = null;
    try {
      if (authState.session && token) {
        await memberFinanceRequest('deposit_info_lock', { token, scope: 'deposit_info_reveal' });
      }
    } catch (_) {}
    if (!silent && state.modal === 'deposit') render();
  }

  function startDepositRevealTimer() {
    clearDepositRevealTimer();
    depositRevealTimer = setInterval(() => {
      if (!isDepositRevealed()) {
        lockDepositReveal({ silent: false });
        showToast('🔒 입금 안내를 다시 잠갔어요. 필요할 때 PIN을 다시 입력해 주세요.', 'info');
      } else if (state.modal === 'deposit') {
        const remain = document.getElementById('depositRevealRemain');
        if (remain) remain.textContent = `${depositRevealRemaining()}초 뒤 자동 잠금`;
      }
    }, 1000);
  }

  async function loadDepositDestinations() {
    if (!authState.session) {
      state.depositDestinations = [];
      state.depositDestinationsError = false;
      state.depositPinSet = false;
      state.depositPinCopy = '👋 로그인 후 보안 PIN으로 입금 안내를 확인할 수 있어요.';
      return;
    }
    try {
      const result = await memberFinanceRequest('deposit_info_challenge');
      state.depositDestinations = Array.isArray(result.destinations) ? result.destinations : [];
      state.depositDestinationsError = false;
      state.depositPinSet = result.pin_set === true;
      state.depositPinLocked = result.locked === true;
      state.depositPinCopy = result.copy || '🔐 보안 PIN 입력 후 입금 안내 확인';
      state.depositCatalogVersion = result.catalog_version || null;
      state.depositMethods = Array.isArray(result.methods) ? result.methods : [];
      state.depositAssets = Array.isArray(result.assets) ? result.assets : [];
    } catch (_) {
      state.depositDestinations = [];
      state.depositDestinationsError = true;
      state.depositPinCopy = '입금 계좌 안내를 확인하지 못했어요. 잠시 후 다시 열어 주세요.';
    }
  }

  function depositDestinationKind(item) {
    return String(item.destination_type || '') === 'usdt' ? 'usdt' : 'krw';
  }

  function filterDepositItems(list) {
    const method = state.depositMethod;
    const rows = Array.isArray(list) ? list : [];
    return rows.filter((item) => {
      if (item && item.enabled === false) return false;
      if (!method) return true;
      return depositDestinationKind(item) === method;
    });
  }

  function renderDepositMethodPicker() {
    return `<div class="deposit-method-grid"><button type="button" class="deposit-method" data-deposit-method="krw"><strong>원화 계좌</strong><span>은행으로 넣을 때</span></button><button type="button" class="deposit-method" data-deposit-method="usdt"><strong>USDT</strong><span>테더로 넣을 때</span></button></div>`;
  }

  function renderDepositDestinations() {
    if (!state.depositMethod && !isDepositRevealed()) {
      return renderDepositMethodPicker();
    }
    const methodBack = state.depositMethod && !isDepositRevealed()
      ? `<button class="text-link" type="button" data-deposit-method="">다른 방법으로</button>`
      : '';
    if (isDepositRevealed()) {
      const remain = depositRevealRemaining();
      const list = filterDepositItems(state.depositReveal);
      const cards = list.map((item) => {
        const isUsdt = String(item.destination_type || '') === 'usdt';
        const title = item.label || item.bank_name || (isUsdt ? 'USDT' : '입금 계좌');
        const secret = isUsdt
          ? `${item.usdt_network || 'TRC20'} · ${item.usdt_address || ''}`
          : [item.bank_name, item.account_holder, item.account_number].filter(Boolean).join(' · ');
        const qr = item.qr_signed_url
          ? `<img class="deposit-qr" alt="입금 QR" src="${esc(item.qr_signed_url)}" />`
          : (isUsdt && item.usdt_address ? `<div class="deposit-qr-host" data-usdt-qr="${esc(item.usdt_address)}"></div>` : '');
        const memo = item.memo || item.guidance_text
          ? `<p>${esc(item.memo || item.guidance_text)}</p>`
          : '';
        return `<article class="deposit-dest revealed"><strong>${esc(title)}</strong><p>${esc(secret || '확인 필요')}</p>${memo}${qr}</article>`;
      }).join('');
      return `<div class="notice" style="margin-bottom:12px"><span style="color:var(--gold)">${icon('timer',17)}</span><div><strong id="depositRevealRemain">${remain}초 뒤 자동 잠금</strong><br>${state.depositMethod === 'usdt' ? '주소는 지금만 보여요.' : '계좌는 지금만 보여요.'} 화면에서 잔액을 올리지 않아요.</div></div><div class="deposit-dest-list">${cards || '<div class="notice">이 방법으로 보여줄 입금 안내가 없어요.</div>'}</div><div class="modal-actions" style="margin-bottom:12px"><button class="secondary-button" type="button" data-action="lock-deposit-info">지금 잠그기</button></div>`;
    }
    const list = filterDepositItems(state.depositDestinations);
    const methods = state.depositMethod === 'usdt' ? 'USDT' : state.depositMethod === 'krw' ? '원화 계좌' : ((state.depositMethods || []).join(' · ') || '원화 계좌 · USDT');
    const assets = state.depositMethod === 'usdt' ? 'USDT' : state.depositMethod === 'krw' ? 'KRW' : ((state.depositAssets || []).join(' · ') || 'KRW · USDT');
    const masked = list.map((item) => {
      const title = item.label || item.bank_name || (String(item.destination_type || '') === 'usdt' ? 'USDT' : '입금 계좌');
      const line = [item.bank_name, item.masked_value, item.usdt_network].filter(Boolean).join(' · ');
      return `<article class="deposit-dest"><strong>${esc(title)}</strong><p>${esc(line || '마스킹된 안내')}</p></article>`;
    }).join('');
    const pinForm = state.depositPinLocked
      ? `<div class="notice"><span style="color:var(--gold)">${icon('lock',17)}</span><div>${esc(state.depositPinCopy || '🔒 보안 PIN이 잠시 잠겨 있어요.')}</div></div>`
      : state.depositPinSet
        ? `<form id="depositPinForm" class="pin-gate"><label class="field" for="depositPin"><span>보안 PIN 6자리</span><input id="depositPin" name="pin" type="password" inputmode="numeric" maxlength="6" pattern="[0-9]{6}" required placeholder="••••••" autocomplete="one-time-code" /></label><div class="modal-actions"><button class="secondary-button" type="button" data-action="close-modal">닫기</button><button class="primary-button" type="submit">안내 확인</button></div></form>`
        : `<form id="depositPinSetForm" class="pin-gate"><p class="page-copy">입금 계좌를 보려면 보안 PIN 6자리를 먼저 만들어요. 출금 비밀번호와는 따로 잠겨 있어요.</p><label class="field" for="depositPinNew"><span>새 보안 PIN</span><input id="depositPinNew" name="pin" type="password" inputmode="numeric" maxlength="6" pattern="[0-9]{6}" required placeholder="숫자 6자리" /></label><label class="field" for="depositPinConfirm"><span>한 번 더</span><input id="depositPinConfirm" name="pin_confirm" type="password" inputmode="numeric" maxlength="6" pattern="[0-9]{6}" required placeholder="다시 입력" /></label><div class="modal-actions"><button class="secondary-button" type="button" data-action="close-modal">닫기</button><button class="primary-button" type="submit">PIN 만들기</button></div></form>`;
    if (state.depositDestinationsError) {
      return `${methodBack}<div class="notice" style="margin-bottom:14px"><span style="color:var(--gold)">${icon('landmark',17)}</span><div>${esc(state.depositPinCopy || '입금 계좌 안내를 확인하지 못했어요.')}</div></div>${pinForm}`;
    }
    return `${methodBack}<div class="notice" style="margin-bottom:12px"><span style="color:var(--emerald)">${icon('shield-check',17)}</span><div>${esc(methods)} · ${esc(assets)}<br>${esc(state.depositPinCopy || '🔐 보안 PIN 입력 후 입금 안내 확인')}</div></div><div class="deposit-dest-list">${masked || '<p class="page-copy">이 방법으로 보여줄 입금 안내가 아직 없어요.</p>'}</div>${pinForm}`;
  }

  async function openDepositModal() {
    state.depositJump = null;
    state.depositMethod = '';
    openModal('deposit');
    await loadDepositDestinations();
    if (state.modal === 'deposit') render();
    if (isDepositRevealed()) startDepositRevealTimer();
    paintDepositQr();
  }

  async function submitDepositPinSet(event) {
    event.preventDefault();
    const values = formValues(event.target);
    if (String(values.pin || '') !== String(values.pin_confirm || '')) {
      showToast('🙂 같은 PIN을 두 칸에 똑같이 적어 주세요.', 'info');
      return;
    }
    try {
      await memberFinanceRequest('set_security_pin', { pin: values.pin, scope: 'deposit_info_reveal' });
      state.depositPinSet = true;
      showToast('🔐 보안 PIN을 저장했어요. 이제 입금 안내를 확인할 수 있어요.', 'success');
      await loadDepositDestinations();
      render();
    } catch (error) {
      showToast(error?.message || '보안 PIN을 저장하지 못했어요.', 'warning');
    }
  }

  async function submitDepositPin(event) {
    event.preventDefault();
    const values = formValues(event.target);
    try {
      const result = await memberFinanceRequest('deposit_info_reveal', { pin: values.pin, scope: 'deposit_info_reveal' });
      state.depositReveal = Array.isArray(result.destinations) ? result.destinations : [];
      state.depositRevealToken = result.token || null;
      state.depositRevealExpiresAt = result.expires_at || new Date(Date.now() + Number(result.expires_in || 90) * 1000).toISOString();
      startDepositRevealTimer();
      render();
      paintDepositQr();
      showToast('✅ 입금 계좌와 USDT 주소를 확인했어요. 잠시 후 자동으로 잠겨요.', 'success');
    } catch (error) {
      showToast(error?.message || '보안 PIN을 확인해 주세요.', 'warning');
      if (error?.code === 'DEPOSIT_INFO_LOCKED' || error?.code === 'DEPOSIT_INFO_PIN_UNSET') {
        await loadDepositDestinations();
        render();
      }
    }
  }

  async function paintDepositQr() {
    const hosts = document.querySelectorAll('[data-usdt-qr]');
    if (!hosts.length) return;
    try {
      if (!window.qrcode) {
        await new Promise((resolve, reject) => {
          const script = document.createElement('script');
          script.src = isAdmin ? '../assets/vendor/qrcode.min.js?v=20260918-perf1' : './assets/vendor/qrcode.min.js?v=20260918-perf1';
          script.onload = resolve;
          script.onerror = reject;
          document.head.appendChild(script);
        });
      }
      hosts.forEach((el) => {
        const address = el.getAttribute('data-usdt-qr') || '';
        if (!address || !window.qrcode) return;
        const qr = window.qrcode(0, 'M');
        qr.addData(address);
        qr.make();
        el.innerHTML = qr.createSvgTag({ scalable: true });
      });
    } catch (_) {}
  }

  async function adminRequest(action, payload = {}) {
    if (!isAdmin) throw new Error('운영자 세션이 필요합니다.');
    return edgeRequest(action, payload);
  }

  async function loadAdminReviews({ silent = false } = {}) {
    if (!isAdmin || !authState.adminAuthorized || !authState.session) return;
    if (!authState.adminRoles.includes('super_admin') && !authState.adminRoles.includes('work_review')) {
      state.adminReviews = [];
      state.adminReviewPendingCount = 0;
      state.adminReviewCompletedCount = 0;
      state.adminReviewError = '검수 권한이 연결된 운영자 계정에서만 확인할 수 있어요.';
      return;
    }
    state.adminReviewLoading = true;
    if (!silent) render();
    try {
      const result = await adminRequest('list_reviews');
      state.adminReviews = Array.isArray(result.reviews) ? result.reviews : [];
      state.adminReviewPendingCount = Number(result.pending_count || 0);
      state.adminReviewCompletedCount = Number(result.completed_count || 0);
      state.adminReviewError = null;
    } catch (error) {
      state.adminReviewError = error;
    } finally {
      state.adminReviewLoading = false;
      if (!silent) render();
    }
  }

  function adminBrandViews() {
    const rows = state.adminCatalogLoaded
      ? (Array.isArray(state.adminCatalog?.brands) ? state.adminCatalog.brands : [])
      : state.companies;
    const palette = ['#0d9f76', '#d49a17', '#5d4fb2', '#0a7180', '#c85b27', '#2b5da7', '#bc2039', '#78502c'];
    return rows.map((row, index) => {
      const name = row.display_name_ko || row.name || row.legal_name || '협력사';
      return {
        ...row,
        id: row.id,
        name,
        label: row.category || row.label || '데이터 업무',
        slug: row.slug || '',
        mark: String(name).replace(/\s+/g, '').slice(0, 3) || 'PD',
        color: row.color || palette[index % palette.length],
        category: row.category || row.label || '데이터 업무',
        copy: row.description_ko || row.copy || '',
        logo_asset_path: row.logo_asset_path || '',
        photo_asset_path: row.photo_asset_path || '',
        logoUrl: brandAssetSrc(row.logo_asset_path, row.slug, 'logo'),
        photoUrl: brandAssetSrc(row.photo_asset_path, row.slug, 'photo'),
        verified: row.verification_status ? row.verification_status === 'approved' : row.verified !== false,
        logoApproved: row.logo_usage_status ? row.logo_usage_status === 'approved' : row.verified !== false,
        published: row.published === true
      };
    });
  }

  function adminNodeViews() {
    const rows = state.adminCatalogLoaded
      ? (Array.isArray(state.adminCatalog?.nodes) ? state.adminCatalog.nodes : [])
      : nodes;
    const brands = adminBrandViews();
    return rows.map((row) => ({
      ...row,
      id: row.id,
      publicId: row.public_id || row.publicId,
      companyId: row.partner_brand_id || row.companyId,
      title: row.title_ko || row.title || '업무 카드',
      copy: row.description_ko || row.copy || '',
      time: Number(row.estimated_seconds ?? row.time ?? 60),
      minutes: row.estimated_seconds ? formatDuration(Number(row.estimated_seconds)) : (row.minutes || formatDuration(Number(row.time || 60))),
      reward: Number(row.reward_max ?? row.reward ?? row.reward_min ?? 0),
      rewardMin: Number(row.reward_min ?? row.rewardMin ?? 0),
      rewardMax: Number(row.reward_max ?? row.rewardMax ?? row.reward_min ?? row.reward ?? 0),
      level: row.difficulty || row.level || '일반 처리',
      available: Number(row.daily_capacity ?? row.available ?? 0),
      motion: row.motion_profile || row.motion || 'default',
      enabled: row.catalog_status ? row.enabled === true && row.catalog_status === 'published' : row.enabled !== false,
      catalogStatus: row.catalog_status || (row.enabled === false ? 'paused' : 'published')
    }));
  }

  function adminBrandById(id) {
    return adminBrandViews().find((brand) => brand.id === id) || {
      id,
      name: '협력사 미지정',
      category: '데이터 업무',
      mark: 'PD',
      color: '#0d9f76',
      verified: false,
      logoApproved: false,
      published: false
    };
  }

  async function loadAdminCatalog({ silent = false } = {}) {
    if (!isAdmin || !authState.adminAuthorized || !authState.session) return;
    if (!authState.adminRoles.includes('super_admin') && !authState.adminRoles.includes('content')) {
      state.adminCatalogLoaded = true;
      state.adminCatalog = { brands: [], nodes: [] };
      state.adminCatalogError = '기업·업무 관리 권한이 연결된 운영자 계정에서만 확인할 수 있어요.';
      return;
    }
    state.adminCatalogLoading = true;
    state.adminCatalogError = null;
    if (!silent) render();
    try {
      const result = await adminRequest('catalog');
      state.adminCatalog = {
        brands: Array.isArray(result.brands) ? result.brands : [],
        nodes: Array.isArray(result.nodes) ? result.nodes : []
      };
      state.adminCatalogLoaded = true;
      state.nodeEnabled = Object.fromEntries(state.adminCatalog.nodes.map((node) => [node.id, node.enabled === true && node.catalog_status === 'published']));
    } catch (error) {
      state.adminCatalogError = error;
    } finally {
      state.adminCatalogLoading = false;
      if (!silent) render();
    }
  }

  async function loadAdminMembers({ silent = false } = {}) {
    if (!isAdmin || !authState.adminAuthorized || !authState.session) return;
    state.adminMembersLoading = true;
    if (!silent) render();
    try {
      const result = await adminRequest('list_members', {
        query: state.adminMemberQuery || '',
        status: state.adminMemberFilter === 'all' ? undefined : state.adminMemberFilter
      });
      const raw = Array.isArray(result.members) ? result.members : [];
      const mapped = raw.map(normalizeMemberRow);
      const filter = state.adminMemberFilter || 'all';
      state.adminMembers = filter === 'all' ? mapped : mapped.filter((item) => item.status === filter);
      state.adminMemberTotal = Number(result.total || mapped.length);
      state.adminMembersError = null;
      state.adminMembersContract = true;
    } catch (error) {
      state.adminMembers = [];
      state.adminMemberTotal = 0;
      state.adminMembersContract = !isUnsupportedAction(error);
      state.adminMembersError = isUnsupportedAction(error)
        ? '회원 목록을 이 운영 서버에서 아직 열지 못했어요. 잠시 후 다시 시도해 주세요.'
        : friendlyAdminError(error);
    } finally {
      state.adminMembersLoading = false;
      if (!silent) render();
    }
  }

  async function loadAdminFinance({ silent = false } = {}) {
    if (!isAdmin || !authState.adminAuthorized || !authState.session) return;
    state.adminFinanceLoading = true;
    if (!silent) render();
    try {
      const result = await adminRequest('list_finance', {});
      state.adminFinance = {
        deposits: Array.isArray(result.deposits) ? result.deposits : [],
        withdrawals: Array.isArray(result.withdrawals) ? result.withdrawals : [],
        kyc: Array.isArray(result.kyc) ? result.kyc : [],
        referrals: Array.isArray(result.referrals) ? result.referrals : [],
        destinations: Array.isArray(result.destinations) ? result.destinations : [],
        pin_audit: Array.isArray(result.pin_audit) ? result.pin_audit : []
      };
      state.adminFinanceError = null;
      state.adminFinanceContract = true;
    } catch (error) {
      state.adminFinance = { deposits: [], withdrawals: [], kyc: [], referrals: [], destinations: [] };
      state.adminFinanceContract = !isUnsupportedAction(error);
      state.adminFinanceError = friendlyAdminError(error);
    } finally {
      state.adminFinanceLoading = false;
      if (!silent) render();
    }
  }

  async function loadAdminCampaigns({ silent = false } = {}) {
    if (!isAdmin || !authState.adminAuthorized || !authState.session) return;
    try {
      const result = await adminRequest('list_campaigns', {});
      state.adminCampaigns = Array.isArray(result.campaigns) ? result.campaigns : [];
      state.adminCampaignsError = null;
      state.adminCampaignsContract = true;
      const first = state.adminCampaigns[0];
      if (first && first.amount != null) state.supportGrant = Number(first.amount);
    } catch (error) {
      state.adminCampaigns = [];
      state.adminCampaignsContract = !isUnsupportedAction(error);
      state.adminCampaignsError = friendlyAdminError(error);
    } finally {
      if (!silent) render();
    }
  }

  async function refreshAdminPageData({ silent = true } = {}) {
    if (!isAdmin || !authState.adminAuthorized) return;
    const page = state.adminPage || 'overview';
    const jobs = [
      loadAdminReviews({ silent: true }),
      loadAdminFinance({ silent: true }),
      refreshMemberNotices({ toastNew: false }).catch(() => [])
    ];
    if (page === 'overview') {
      jobs.push(loadAdminCatalog({ silent: true }), loadAdminMembers({ silent: true }));
    } else if (page === 'operations' || page === 'companies' || page === 'nodes') {
      jobs.push(loadAdminCatalog({ silent: true }));
    } else if (page === 'members') {
      jobs.push(loadAdminMembers({ silent: true }));
    } else if (page === 'settings') {
      jobs.push(loadAdminCampaigns({ silent: true }));
    }
    if (window.PUTDUK_ADMIN && typeof window.PUTDUK_ADMIN.refreshPage === 'function') {
      jobs.push(window.PUTDUK_ADMIN.refreshPage());
    }
    await Promise.all(jobs);
    if (!silent) render();
  }

  function openModal(type, payload = null) {
    state.modal = type;
    state.modalPayload = payload;
    render();
  }

  async function initializeAuth() {
    if (!supabaseClient) {
      authState.loading = false;
      authState.adminLoading = false;
      return;
    }
    try {
      const { data, error } = await supabaseClient.auth.getSession();
      if (error) throw error;
      authState.loading = false;
      if (data.session) {
        signedOutLock = false;
        authState.session = data.session;
        switchToUserState(data.session.user.id);
      }
      render();
      await hydrateSession(data.session);
      if (authState.session) recordOwnSession();
      if (authState.session && !isAdmin) queueOnboarding();
      if (isAdmin) {
        await runAdminAuthorization();
      }
      supabaseClient.auth.onAuthStateChange((event, session) => {
        if (event === 'SIGNED_OUT') {
          applySignedOutState({ navigate: !isAdmin });
          return;
        }
        if (signedOutLock) {
          return;
        }
        if (event === 'TOKEN_REFRESHED') {
          if (!session) return;
          authState.session = session;
          return;
        }
        if (event === 'INITIAL_SESSION') {
          if (!session) {
            authState.session = null;
            return;
          }
          authState.session = session;
          if (isAdmin && authState.session && !authState.adminAuthorized && !authState.adminLoading) {
            window.setTimeout(() => {
              void runAdminAuthorization();
            }, 0);
          }
          return;
        }
        window.setTimeout(async () => {
          if (signedOutLock) return;
          let liveSession = session || null;
          try {
            const current = await supabaseClient.auth.getSession();
            liveSession = current?.data?.session || null;
          } catch (_) {
            liveSession = null;
          }
          if (signedOutLock) return;
          if (!liveSession) {
            if (authState.session || document.querySelector('[data-action="logout"]')) {
              applySignedOutState({ navigate: !isAdmin });
            }
            return;
          }
          await hydrateSession(liveSession);
          if (authState.session) recordOwnSession();
          if (isAdmin) {
            await runAdminAuthorization();
          } else {
            queueOnboarding();
            settleMobileViewportAfterAuth();
          }
          if (!state.modal) render();
        }, 0);
      });
      if (!syncTimer) {
        syncTimer = window.setInterval(async () => {
          if (signedOutLock || !authState.session || document.hidden) return;
          if (isLiveWorkOverlay() || state._startingWork || state.run?._submitting || state.run?._submitWaiting) return;
          if (state.modal) {
            if (isAdmin && authState.adminAuthorized) await refreshAdminPageData({ silent: true });
            if (!isAdmin) {
              await refreshMemberNotices({ toastNew: true });
              await hydrateMemberAssignments();
              if (state.modal === 'notifications') render();
              else {
                paintNoticeBadge();
                flushPendingToast();
              }
            }
            return;
          }
          if (isAdmin) {
            if (authState.adminAuthorized) await refreshAdminPageData({ silent: true });
          } else {
            await hydrateSession(authState.session, { light: true });
          }
          if (document.hidden) return;
          render();
        }, isAdmin ? 5000 : 30000);
      }
    } catch (error) {
      authState.loading = false;
      authState.adminLoading = false;
      authState.error = error;
    }
  }
  function esc(value) {
    return String(value ?? '').replace(/[&<>"']/g, (char) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#039;' }[char]));
  }

  function brandAssetSrc(path, slug, kind) {
    const raw = String(path || '').trim();
    if (/^https?:\/\//i.test(raw) || raw.startsWith('/')) return raw;
    if (raw.startsWith('brand-logos/')) return `/assets/${raw}`;
    const key = String(slug || '').trim().toLowerCase();
    if (key) return `/assets/brand-logos/${key}-${kind === 'photo' ? 'photo' : 'logo'}.png`;
    return '';
  }

  function renderBrandVisual(company, extraClass = '') {
    const src = company.logoUrl || brandAssetSrc(company.logo_asset_path, company.slug, 'logo');
    if (src) {
      return `<div class="company-logo has-image ${extraClass}"><img src="${esc(src)}" alt="${esc(company.name || '협력사')} 로고" /></div>`;
    }
    return `<div class="company-logo ${extraClass}" style="--node-color:${company.color || '#0d9f76'};background:${company.color || '#0d9f76'}">${esc(company.mark || 'PD')}</div>`;
  }

  function money(value) {
    return formatLedgerAmount(value);
  }

  function icon(name, size = 17) {
    if (window.PutdukIcons && typeof window.PutdukIcons.svg === 'function') return window.PutdukIcons.svg(name, size);
    const px = Number(size) || 17;
    return `<svg xmlns="http://www.w3.org/2000/svg" width="${px}" height="${px}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"></svg>`;
  }

  function uiLead(name, label, size = 15) {
    return `<span class="ui-lead">${icon(name, size)}<span>${label}</span></span>`;
  }

  function settleNote(tag = 'p', trial = false) {
    const copy = trial
      ? '🎁 지원금은 근무에 다 쓰이고 돌려주지 않아요. 수당만 나와요'
      : '✅ 일이 끝나면 원금과 수당이 잔액에 같이 반영돼요';
    return `<${tag} class="settle-note"><span>${copy}</span></${tag}>`;
  }

  function refreshIcons() {
  }

  function companyById(id) {
    return companies.find((company) => company.id === id) || companies[0] || {
      id: 'unknown-company',
      name: '퍼뜩 협력사',
      mark: 'PD',
      color: '#0d9f76',
      category: '데이터 업무'
    };
  }

  function motionPartner(node) {
    const company = companyById(node?.companyId);
    return {
      company: company.name,
      partner_name: company.name,
      slug: company.slug || company.mark || 'putduk',
      name: company.name,
      title: node?.title || company.name,
      motion: node?.motion,
      motion_profile: node?.motion || node?.motion_profile,
      color: node?.color || company.color,
      motion_seed: node?.motion_seed || state.run?.motionSeed
    };
  }

  function playMemberWorkPhase(canvas, partner, phase, extras = {}) {
    if (isAdmin || !canvas || !window.PutdukMotion || typeof window.PutdukMotion.playWorkPhase !== 'function') {
      return false;
    }
    window.PutdukMotion.playWorkPhase(canvas, partner, phase, extras);
    return true;
  }
  function nodeById(id) {
    return nodes.find((node) => node.id === id) || {
      id,
      companyId: 'unknown-company',
      title: '업무 정보가 갱신 중이에요',
      copy: '운영자가 공개한 업무 정보를 불러오는 중입니다.',
      time: 60,
      minutes: '1분',
      reward: 0,
      level: '확인 중',
      icon: 'loader-circle',
      color: '#0d9f76',
      available: 0,
      motion: 'default'
    };
  }

  function fomoSlotsLeft(node) {
    return Math.max(0, Number(node?.available || 0));
  }

  function renderFomoBoardPlaceholder(kind) {
    const title = kind === 'nodes' ? '지금 라인' : '지금 작업실';
    return `<section class="fomo-board is-off" aria-label="${title}"><p class="fomo-off-copy">${icon('users', 16)}<span>방금 들어온 크루 안내를 불러오고 있어요.</span></p></section>`;
  }

  function pendingFinanceCount() {
    const pending = (row) => ['submitted', 'checking', 'pending', 'queued', 'review_pending'].includes(String(row?.status || ''));
    const deposits = Array.isArray(state.adminFinance.deposits) ? state.adminFinance.deposits : [];
    const withdrawals = Array.isArray(state.adminFinance.withdrawals) ? state.adminFinance.withdrawals : [];
    const kyc = Array.isArray(state.adminFinance.kyc) ? state.adminFinance.kyc : [];
    return deposits.filter(pending).length + withdrawals.filter(pending).length + kyc.filter(pending).length;
  }

  function navItems() {
    const financeCount = pendingFinanceCount();
    return isAdmin ? [
      { id: 'overview', label: '전체 현황', icon: 'layout-dashboard' },
      { id: 'members', label: '회원 관리', icon: 'users', count: state.adminMembersContract ? state.adminMemberTotal : undefined },
      { id: 'operations', label: '업무 운영', icon: 'waypoints', count: state.adminCatalogLoaded ? state.adminCatalog.nodes.length : undefined },
      { id: 'reviews', label: '업무 검수', icon: 'clipboard-check', count: state.adminReviewPendingCount || undefined },
      { id: 'finance', label: '입출금 처리', icon: 'wallet-cards', count: state.adminFinanceContract ? financeCount : undefined },
      { id: 'notifications', label: '공지·알림', icon: 'bell', count: unreadNoticeCount() || undefined },
      { id: 'settings', label: '설정·기타 운영', icon: 'sliders-horizontal' }
    ] : [
      { id: 'dashboard', label: '근무', icon: 'briefcase' },
      { id: 'nodes', label: '업무 매칭', icon: 'waypoints' },
      { id: 'history', label: '내역', icon: 'clipboard-list' },
      { id: 'wallet', label: '지갑', icon: 'wallet-cards' },
      { id: 'referrals', label: '추천', icon: 'user-plus' },
      { id: 'membership', label: '사원증', icon: 'id-card' },
      { id: 'support', label: '도움말', icon: 'circle-help' }
    ];
  }

  function renderSidebar() {
    const current = isAdmin ? state.adminPage : state.memberPage;
    const items = navItems();
    return `
      <aside class="sidebar" id="sidebar">
        <div class="brand-mark">
          <div class="brand-symbol">${icon('orbit', 21)}</div>
          <div><div class="brand-name">퍼뜩</div><div class="brand-kicker">${isAdmin ? '운영자 관리센터' : '협력사 라인 근무'}</div></div>
        </div>
        <div class="nav-label">${isAdmin ? '운영 메뉴' : '내 서비스'}</div>
        <nav aria-label="주요 메뉴">
          ${items.map((item) => `<button class="nav-item ${current === item.id ? 'active' : ''}" data-nav="${item.id}">${icon(item.icon, 17)}<span>${item.label}</span>${item.count ? `<span class="nav-count">${item.count > 99 ? '99+' : item.count}</span>` : ''}</button>`).join('')}
        </nav>
        <div class="side-footer">
          ${isAdmin ? `<div class="mode-card"><div class="eyebrow">${icon('shield-check', 14)} 안전한 운영</div><p style="margin:8px 0 0;color:var(--muted);font-size:11px;line-height:1.5">모든 회원·금액 변경은 관리자 기록에 남습니다.</p></div>` : `<div class="mode-card"><div style="display:flex;align-items:center;gap:8px;font-size:12px;font-weight:800">${icon('id-card',15)} 근무 안내</div><p style="margin:7px 0 0;color:var(--muted);font-size:11px;line-height:1.5">오늘 라인 근무와 등급·혜택을 쉽게 안내해요.</p><button class="text-link" data-nav="support" style="padding:6px 0 0">도움말 보기</button></div>`}
        </div>
      </aside>
      <div class="sidebar-backdrop" id="sidebarBackdrop"></div>
    `;
  }

  function renderTopbar() {
    const title = isAdmin ? ({ overview: '전체 현황', members: '회원 관리', operations: '업무 운영', companies: '기업 관리', nodes: '업무 카드 관리', reviews: '업무 검수', finance: '입출금 처리', motion: '연출', 'landing-content': '랜딩 현황·후기', notifications: '공지·알림', settings: '설정·기타 운영' }[state.adminPage] || '전체 현황') : ({ dashboard: '작업실', nodes: '업무 매칭', history: '내역', wallet: '지갑', membership: '사원증', benefits: '등급·혜택', referrals: '추천', support: '도움말' }[state.memberPage] || '작업실');
    const memberIdentity = authState.session && !signedOutLock
      ? `<div class="profile-chip"><span class="avatar">${esc(profileInitial())}</span><span>${esc(profileName())}</span><button class="profile-logout" data-action="logout">로그아웃</button></div>`
      : `<button class="small-button" data-action="open-login">로그인</button>`;
    const adminIdentity = authState.adminAuthorized && authState.session && !signedOutLock
      ? `<div class="profile-chip"><span class="avatar">관</span><span>운영자 계정</span><button class="profile-logout" data-action="logout">로그아웃</button></div>`
      : `<button class="small-button" data-action="open-login">운영자 로그인</button>`;
    const installButton = !isAdmin ? `<button class="icon-button" data-action="install-app" aria-label="퍼뜩 앱 설치">${icon('download', 17)}</button>` : '';
    const alertButton = noticeBellButtonHtml();
    const mobileMenu = isAdmin
      ? `<button class="icon-button" data-menu="open" aria-label="메뉴 열기">${icon('menu', 19)}</button>`
      : '';
    const brandSrc = isAdmin ? '../favicon.svg' : './favicon.svg';
    const crumbTitle = (!isAdmin && state.memberPage === 'membership') ? '' : ` <strong>${title}</strong>`;
    return `
      <div class="mobile-topbar">${mobileMenu}<button type="button" class="mobile-brand" data-nav="${isAdmin ? 'overview' : 'dashboard'}" aria-label="퍼뜩 홈"><img class="mobile-brand-logo" src="${brandSrc}" alt="" width="28" height="28" /><span class="brand-name">퍼뜩</span></button><div class="mobile-topbar-actions">${installButton}${alertButton}<button class="icon-button" data-theme-toggle aria-label="테마 전환">${icon(state.theme === 'dark' ? 'sun' : 'moon', 17)}</button></div></div>
      <div class="topbar"><div class="breadcrumb">퍼뜩 ${isAdmin ? '운영자 관리센터' : '라인 근무'}${crumbTitle}</div><div class="top-actions">${installButton}<button class="icon-button" data-theme-toggle aria-label="테마 전환">${icon(state.theme === 'dark' ? 'sun' : 'moon', 17)}</button>${alertButton}${isAdmin ? adminIdentity : memberIdentity}</div></div>
    `;
  }

  function renderTrustStrip() {
    const modeText = authState.session ? '회원 계정 연결됨' : '로그인 후 공개 협력사 확인';
    const pills = companies.length
      ? companies.map((company) => {
        const src = company.logoUrl || brandAssetSrc(company.logo_asset_path, company.slug, 'logo');
        const mark = src
          ? `<span class="pill-logo"><img src="${esc(src)}" alt="" /></span>`
          : `<span class="dot"></span>`;
        return `<span class="partner-pill">${mark}${esc(company.name)}</span>`;
      }).join('')
      : `<span class="partner-pill"><span class="dot"></span>공개된 협력사 없음</span>`;
    return `<div class="trust-strip"><div class="trust-title">${icon('badge-check', 15)} 연결 출처</div><div class="trust-pills">${pills}</div><span class="trust-mode">${modeText} · 공개 상태는 운영자 확인 후 반영</span></div>`;
  }

  function renderCrewChip() {
    const band = tierBand();
    return `<button type="button" class="crew-chip" data-nav="membership" aria-label="사원증 보기"><span class="avatar">${esc(profileInitial())}</span><div><strong>내 카드 보기</strong><small>${esc(displayPublicId())} · ${esc(band.label)} 등급</small></div></button>`;
  }

  function renderCrewIdCard() {
    const band = tierBand();
    const signedIn = Boolean(authState.session);
    const company = signedIn ? crewPartnerCompany() : null;
    const partnerName = company?.name || (signedIn ? '라인 배정 전' : '로그인 후 배정');
    const markSrc = company ? (company.logoUrl || brandAssetSrc(company.logo_asset_path, company.slug, 'logo')) : '';
    const mark = markSrc
      ? `<div class="id-badge has-image"><img src="${esc(markSrc)}" alt="${esc(partnerName)} 마크" /></div>`
      : `<div class="id-badge">${esc(company?.mark || 'PD')}</div>`;
    const flipped = Boolean(state.idCardFlipped);
    const attendance = crewAttendance(company);
    const publicId = displayPublicId();
    const displayName = signedIn ? profileName() : '퍼뜩 회원';
    const lineCopy = company
      ? `오늘 ${partnerName} 라인 근무예요`
      : (signedIn ? '라인이 열리면 배지가 이 카드에 보여요' : '로그인하면 오늘 라인이 이 카드에 보여요');
    return `<div class="id-stage"><button type="button" class="id-flip${flipped ? ' is-flipped' : ''}" data-action="flip-idcard" aria-pressed="${flipped ? 'true' : 'false'}" aria-label="${flipped ? '사원증 앞면 보기' : '사원증 뒷면 보기'}">
      <div class="id-flip-inner">
        <div class="id-face id-front">
          <div class="id-face-head">
            <span class="id-chip" aria-hidden="true"></span>
            ${mark}
          </div>
          <div class="id-face-body">
            <div class="id-portrait" aria-hidden="true"><span>${esc(profileInitial())}</span></div>
            <div class="id-identity">
              <div class="id-card-title">${esc(displayName)}</div>
              <div class="id-band">${esc(band.label)} 등급</div>
              <div class="id-number" title="${esc(publicId)}">${esc(publicId)}</div>
            </div>
          </div>
          <div class="id-face-foot">
            <div class="id-status">
              <span class="id-role">${esc(attendance.label)}</span>
            </div>
          </div>
        </div>
        <div class="id-face id-back">
          <div class="id-face-body id-face-body-back">
            <p class="id-back-kicker">사원증 뒷면</p>
            <p class="id-back-meta"><span class="id-number" title="${esc(publicId)}">사원번호 ${esc(publicId)}</span><span class="id-back-sep" aria-hidden="true">|</span><span>${esc(band.label)} 등급</span></p>
            <p class="id-back-copy">${esc(lineCopy)}</p>
            <p class="id-legal">퍼뜩 멤버십 운영이며, 근로계약·4대보험·협력사 인사 채용은 아니에요.</p>
          </div>
        </div>
      </div>
    </button></div>`;
  }

  function renderNextLadderHero() {
    const work = Number(state.wallet.work ?? state.wallet.task ?? 0);
    const nextStake = nextStakeSlot(work || 30000);
    if (!nextStake || nextStake >= 30000000) return '';
    const diff = Math.max(0, nextStake - work);
    const pct = Math.min(100, Math.round((work / nextStake) * 100));
    const nextPay = payForStake(nextStake);
    return `
      <div class="next-ladder-card" style="margin: 0 0 18px;">
        <div class="next-ladder-head">
          <span class="next-ladder-label">${icon('trending-up', 15)} 다음 ${money(nextStake)} 상위 라인 해금 게이지</span>
          <strong class="next-ladder-pct">${pct}% 달성</strong>
        </div>
        <div class="next-ladder-bar">
          <div class="next-ladder-fill" style="width:${pct}%"></div>
        </div>
        <div style="display:flex;align-items:center;justify-content:space-between;flex-wrap:wrap;gap:10px;margin-top:12px;">
          <div style="font-size:13px;color:var(--fg);">
            ${diff > 0 ? `<strong>${money(diff)}</strong>만 채우면 건당 수당 <strong>${money(nextPay)}</strong> 라인이 즉시 열려요.` : `다음 라인이 해금되었어요! 바로 출근해 보세요.`}
          </div>
          ${diff > 0 ? `
            <button class="gold-button" style="min-height:38px;padding:8px 14px;font-size:13px;" data-action="deposit-shortcut" data-amount="${diff}">
              ${icon('credit-card', 14)} ${money(diff)} 채우고 바로 열기
            </button>
          ` : ''}
        </div>
      </div>
    `;
  }

  function renderMemberDashboard() {
    const inProgress = state.run ? nodeById(state.run.nodeId) : null;
    const waiting = state.reviewWait ? nodeById(state.reviewWait.nodeId) : null;
    const accountButton = authState.session
      ? ''
      : `<button class="secondary-button" data-action="open-signup">회원가입·로그인</button>`;
    const partner = crewPartnerCompany();
    const attendance = crewAttendance(partner);
    const heroLine = partner ? `오늘 ${esc(partner.name)} 라인 근무` : (authState.session ? '오늘 라인 근무' : '로그인하면 오늘 라인에 출근해요');
    const dashboardQuota = dailyQuotaDisplay();
    const hasEarnings = state.history.some((item) => rewardUiKind(item) === 'posted');
    return `
      ${renderTrustStrip()}
      ${renderFomoBoardPlaceholder('dashboard')}
      <section class="grid-hero">
        <div class="hero-card">
          <div class="eyebrow"><span class="pulse-dot"></span> ${heroLine}</div>
          <h1 class="hero-title">작업실에 출근하고<br><span style="color:var(--emerald-strong)">한 칸만 확인해요.</span></h1>
          <p class="hero-copy">오늘 배정된 물량 5건의 실물 라벨 번호를 입력해 대조하면 돼요.</p>
          <div class="hero-actions"><button class="primary-button" data-nav="nodes">${icon('waypoints', 18)} 라인 찾기</button>${accountButton}</div>
          <div class="hero-metrics"><div><div class="metric-label">오늘 라인</div><div class="metric-value">${memberCatalogNodes().length}<small>칸</small></div></div><div><div class="metric-label">검수 완료</div><div class="metric-value">${state.history.filter((item) => item.status === '검수 완료').length}<small>건</small></div></div><div><div class="metric-label" data-daily-quota-label>오늘 남은 횟수</div><div class="metric-value"><span data-daily-quota-value>${esc(dashboardQuota.value)}</span><small data-daily-quota-suffix>${esc(dashboardQuota.suffix)}</small></div></div><div><div class="metric-label">근무 상태</div><div class="metric-value" style="font-size:18px;color:var(--emerald-strong)">${esc(attendance.label)}</div></div></div>
        </div>
        <div class="panel panel-pad crew-side">
          ${renderCrewIdCard()}
          <p class="page-copy" style="margin-top:12px">탭하면 사원증이 한 번 돌아가요.</p>
        </div>
      </section>
      ${inProgress ? `<div class="notice" style="margin-bottom:18px"><span style="color:var(--emerald)">${icon('activity',17)}</span><div style="flex:1"><strong>${esc(inProgress.title)}</strong> 근무를 이어가고 있어요.<br><span style="color:var(--muted)">화면을 닫아도 서버 기준으로 이어져요.</span></div><button class="small-button primary" data-action="open-run">근무 화면 열기</button></div>` : ''}
      ${waiting ? `<div class="notice" style="margin-bottom:18px"><span style="color:var(--gold)">${icon('clipboard-check',17)}</span><div style="flex:1"><strong>검수를 기다리고 있어요</strong><br><span style="color:var(--muted)">${esc(waiting.title)} · 새 출근은 검수가 끝난 뒤에 할 수 있어요.</span></div><button class="small-button primary" data-action="open-review-wait">검수 대기 보기</button></div>` : ''}
      <section class="dashboard-grid">
        <div class="panel"><div class="panel-head"><div><div class="panel-title">최근 수당 흐름</div><div class="panel-subtitle">검수 완료된 수당만 표시해요</div></div>${hasEarnings ? `<span class="status-badge">${icon('trending-up', 13)} 서버 기록</span>` : ''}</div>${hasEarnings ? `<div class="chart-wrap"><canvas id="earningsChart" aria-label="최근 7일 수당 흐름"></canvas></div>` : `<div class="empty-state compact earnings-empty"><div class="empty-icon">${icon('wallet-cards', 22)}</div><strong>아직 수당 기록이 없어요.</strong><p>첫 업무가 승인되면 여기에 수당 흐름이 나타납니다.</p></div>`}</div>
        <div class="wallet-card"><div class="eyebrow" style="color:#a8f3d2">${icon('layout-grid', 14)} 내 지갑 세 칸</div>${renderWalletSlots()}<div class="wallet-cta"><button class="secondary-button" data-nav="wallet">지갑 보기</button><button class="gold-button" data-action="deposit-info">${icon('credit-card', 16)} 입금하기</button></div></div>
      </section>
      ${renderPartnerGallery()}
      ${renderNextLadderHero()}
      <div class="section-heading"><div><h2>오늘 추천 근무</h2><p>잠금 금액과 끝나면 받을 수당을 먼저 봐요.</p></div><button class="text-link" data-nav="nodes">라인 더 보기 ${icon('arrow-right', 14)}</button></div>
      <section class="node-grid">${memberCatalogNodes().slice(0, 3).map(renderNodeCard).join('') || `<div class="empty-state compact action-empty" style="grid-column:1/-1"><div class="empty-icon">${icon('waypoints', 22)}</div><strong>현재 참여 가능한 업무가 없습니다.</strong><p>새 업무가 열리면 이곳에 표시됩니다.</p><button class="secondary-button" type="button" data-nav="nodes">업무 매칭 확인</button></div>`}</section>
      <section class="dashboard-grid" style="margin-top:18px"><div class="panel"><div class="panel-head"><div><div class="panel-title">최근 근무</div><div class="panel-subtitle">제출·검수 상태가 여기에 쌓여요.</div></div><button class="text-link" data-nav="history">전체보기</button></div>${renderTimeline()}</div><div class="panel panel-pad"><div class="panel-title">처음 출근하는 분께</div><div class="notice" style="margin-top:14px"><span style="color:var(--gold)">${icon('lightbulb',17)}</span><div>한 화면에서 전표와 실물 번호 5건을 대조하고 제출하면 돼요. ${settleNote('span')}</div></div><button class="secondary-button" data-nav="support" style="width:100%;margin-top:13px">도움말 보기</button></div></section>
    `;
  }

  function renderNodeCard(node) {
    const company = companyById(node.companyId);
    const enabled = state.nodeEnabled[node.id] !== false;
    const busy = Boolean(state.reviewWait) || Boolean(state.run);
    const ready = enabled && canStartNode(node) && !busy;
    const markSrc = company.logoUrl || brandAssetSrc(company.logo_asset_path, company.slug, 'logo');
    const mark = markSrc
      ? `<div class="company-mark has-image"><img src="${esc(markSrc)}" alt="${esc(company.name)} 로고" /></div>`
      : `<div class="company-mark">${esc(company.mark)}</div>`;
    const cta = !enabled ? '대기 중' : state.reviewWait ? '검수 대기 중' : ready ? '출근하기' : '입금 안내';
    const slotsLeft = fomoSlotsLeft(node);
    return `<article class="node-card compact-node" data-level="${esc(node.level || '')}" style="--node-color:${node.color};opacity:${enabled ? 1 : .55}"><div class="node-accent"></div><div class="node-top">${mark}</div><div class="node-company">${esc(company.name)}</div><div class="node-title">${esc(node.title)}</div>${cardMoneyLines(node).html}<div class="node-bottom"><div class="node-meta"><span>시간 ${esc(node.minutes)}</span><span data-fomo-slot="${esc(node.id)}">${slotsLeft.toLocaleString('ko-KR')}자리 남음</span></div><button class="small-button ${ready ? 'primary' : ''}" data-start-node="${node.id}" ${enabled && !state.reviewWait ? '' : 'disabled'}>${cta}</button></div></article>`;
  }

  function renderTimeline() {
    const recent = state.history.slice(0, 4);
    if (!recent.length) {
      return `<div class="empty-state compact"><div class="empty-icon">${icon('clipboard-list', 22)}</div><strong>아직 기록된 업무가 없어요.</strong><p>업무를 제출하면 진행·검수·보상 상태가 이곳에 순서대로 표시됩니다.</p></div>`;
    }
    return `<div class="timeline">${recent.map((item) => {
      const node = nodeById(item.nodeId);
      const company = companyById(node.companyId);
      const kind = rewardUiKind(item);
      const done = kind === 'posted';
      return `<div class="timeline-item"><div class="timeline-dot ${done ? '' : 'pending'}"></div><div class="timeline-content"><strong>${esc(item.status)}</strong><p>${esc(company.name)} · ${esc(node.title)} · ${esc(rewardUiLabel(kind))}</p></div><div class="timeline-time">${esc(item.date)}</div></div>`;
    }).join('')}</div>`;
  }

  function renderNodesPage() {
    const grid = memberCatalogNodes().map(renderNodeCard).join('') || `<div class="empty-state compact action-empty" style="grid-column:1/-1"><div class="empty-icon">${icon('waypoints',22)}</div><strong>현재 참여 가능한 업무가 없습니다.</strong><p>새 업무가 공개되면 이 화면에 바로 표시됩니다.</p><button class="secondary-button" type="button" data-nav="nodes">새로 확인</button></div>`;
    const quotaLine = authState.session
      ? `<div class="notice" style="margin-bottom:14px" data-daily-quota-summary-wrap><span style="color:var(--emerald)">${icon('clock-3', 17)}</span><div data-daily-quota-summary>${esc(dailyQuotaSummaryText())}</div></div>`
      : '';
    return `<div class="section-heading" style="margin-top:0"><div><h1 class="page-title">라인 찾기</h1><p class="page-copy">오늘 배정된 라인이에요. 잠금 금액과 수당을 보고 출근하세요.</p></div><button class="secondary-button" data-action="deposit-info">${icon('wallet', 16)} 입금 안내</button></div>${quotaLine}<div class="filter-row"><button class="filter-button active" data-filter="all">전체</button><button class="filter-button" data-filter="빠른 확인">빠른 확인</button><button class="filter-button" data-filter="일반 처리">일반 처리</button><button class="filter-button" data-filter="집중 처리">집중 처리</button><button class="filter-button" data-filter="전문 검수">전문 검수</button></div><p class="filter-hint" id="nodeFilterHint">${esc(NODE_FILTER_HINTS.all)}</p><section class="node-grid" id="nodeGrid">${grid}</section><div class="notice" style="margin-top:18px"><span style="color:var(--emerald)">${icon('info',17)}</span><div><strong>정산 안내</strong><br>${settleNote('span')} 화면에서 금액을 더하거나 빼지 않아요.</div></div>`;
  }

  function renderHistoryPage() {
    const completed = state.history.filter((item) => item.runStatus === 'approved' || item.status === '검수 완료').length;
    const empty = `<div class="empty-state compact record-empty"><strong>아직 제출한 근무가 없어요.</strong><p>근무를 시작하면 검수와 수당이 여기에 쌓여요.</p></div>`;
    const cards = state.history.length
      ? state.history.map((item) => {
        const node = nodeById(item.nodeId);
        const companyName = lineNameForNode(node);
        const kind = rewardUiKind(item);
        const posted = kind === 'posted';
        return `<article class="record-card"><div class="record-card-top"><strong>${esc(companyName)} · ${esc(node.title)}</strong><span class="pill ${posted ? 'ok' : 'wait'}">${esc(item.status)}</span></div><div class="record-card-meta"><span>${esc(rewardUiLabel(kind))} ${formatLedgerAmount(item.reward)}</span></div><p class="record-card-id">${esc(item.date)} · 문의 번호 ${esc(item.id)}</p></article>`;
      }).join('')
      : '';
    const rows = state.history.length
      ? state.history.map((item) => {
        const node = nodeById(item.nodeId);
        const companyName = lineNameForNode(node);
        const kind = rewardUiKind(item);
        const posted = kind === 'posted';
        return `<tr><td><strong>${esc(companyName)} · ${esc(node.title)}</strong><div class="cell-sub">문의 번호 ${esc(item.id)}</div></td><td><span class="pill ${posted ? 'ok' : 'wait'}">${esc(item.status)}</span></td><td><strong>${formatLedgerAmount(item.reward)}</strong><div class="cell-sub">${esc(rewardUiLabel(kind))}</div></td><td>${esc(item.date)}</td></tr>`;
      }).join('')
      : '';
    const body = state.history.length
      ? `<div class="record-list">${cards}</div><div class="record-table-wrap"><table class="record-table"><thead><tr><th>근무</th><th>상태</th><th>보상</th><th>일시</th></tr></thead><tbody>${rows}</tbody></table></div>`
      : empty;
    const available = formatLedgerAmount(state.wallet.available);
    return `<div class="section-heading" style="margin-top:0"><div><h1 class="page-title">내 근무 내역</h1><p class="page-copy">예상 보상과 확정 보상, 출금 가능 금액을 나눠 봐요.</p></div></div><div class="stat-grid" style="max-width:680px;margin-bottom:18px"><div class="mini-stat"><div class="metric-label">누적 완료</div><div class="num">${completed}건</div><div class="change">검수 완료만 집계</div></div><div class="mini-stat"><div class="metric-label">출금 가능</div><div class="num">${available}</div><div class="change">원장에 오른 수당만</div></div></div><div class="panel"><div class="panel-pad record-panel">${body}</div></div>`;
  }

  function walletRows() {
    const rows = [];
    state.deposits.forEach((row) => {
      rows.push({
        kind: '입금',
        copy: row.note || `${row.currency} 입금 확인 요청`,
        amount: `+${Number(row.amount || 0).toLocaleString('ko-KR')}${row.currency === 'USDT' ? ' USDT' : '원'}`,
        status: financeStatusLabel(row.status),
        ok: row.status === 'approved',
        at: row.created_at
      });
    });
    state.withdrawals.forEach((row) => {
      rows.push({
        kind: '출금',
        copy: row.destination_type === 'usdt' ? 'USDT 출금 신청' : '원화 출금 신청',
        amount: `-${Number(row.amount || 0).toLocaleString('ko-KR')}${row.currency === 'USDT' ? ' USDT' : '원'}`,
        status: financeStatusLabel(row.status),
        ok: row.status === 'sent' || row.status === 'approved',
        at: row.created_at
      });
    });
    state.history.filter((item) => rewardUiKind(item) === 'posted').forEach((item) => {
      const rewardNode = nodeById(item.nodeId);
      rows.push({
        kind: '작업 보상',
        copy: rewardNode ? `${lineNameForNode(rewardNode)} · ${rewardNode.title}` : '근무 확인 보상',
        amount: `+${Number(item.reward || 0).toLocaleString('ko-KR')}원`,
        status: '확정',
        ok: true,
        at: item.createdAt
      });
    });
    return rows.sort((a, b) => Date.parse(b.at || 0) - Date.parse(a.at || 0)).slice(0, 12);
  }

  function visibleWalletRows() {
    const tab = state.walletLedgerTab || 'all';
    const rows = walletRows();
    if (tab === 'in') return rows.filter((row) => row.kind === '입금');
    if (tab === 'out') return rows.filter((row) => row.kind === '출금');
    return rows;
  }

  function renderWalletLedgerBody(allRows, rows) {
    const emptyCopy = allRows.length
      ? { title: '이 구분에는 아직 기록이 없어요.', body: '다른 칸을 눌러 입금·출금을 확인해 보세요.' }
      : { title: '아직 기록된 입출금이 없어요.', body: '잔액은 서버가 정하고, 화면에서 더하거나 빼지 않아요.' };
    const empty = `<div class="empty-state compact record-empty"><strong>${esc(emptyCopy.title)}</strong><p>${esc(emptyCopy.body)}</p></div>`;
    const cards = rows.map((row) => `<article class="record-card"><div class="record-card-top"><strong>${esc(row.kind)}</strong><span class="pill ${row.ok ? 'ok' : 'wait'}">${esc(row.status)}</span></div><div class="record-card-meta"><span>${esc(row.copy)}</span><span>${esc(row.amount)}</span></div><p class="record-card-id">${row.at ? new Date(row.at).toLocaleString('ko-KR', { month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit' }) : '-'}</p></article>`).join('');
    const tableRows = rows.map((row) => `<tr><td>${esc(row.kind)}</td><td>${esc(row.copy)}</td><td><strong>${esc(row.amount)}</strong></td><td><span class="pill ${row.ok ? 'ok' : 'wait'}">${esc(row.status)}</span></td><td>${row.at ? new Date(row.at).toLocaleString('ko-KR', { month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit' }) : '-'}</td></tr>`).join('');
    return rows.length
      ? `<div class="record-list">${cards}</div><div class="record-table-wrap"><table class="record-table"><thead><tr><th>구분</th><th>내용</th><th>금액</th><th>상태</th><th>일시</th></tr></thead><tbody>${tableRows}</tbody></table></div>`
      : empty;
  }

  function renderWalletPage() {
    const allRows = walletRows();
    const rows = visibleWalletRows();
    const pendingOut = (state.withdrawals || []).filter((row) => ['submitted', 'checking', 'pending', 'queued'].includes(String(row.status || ''))).length;
    const tab = state.walletLedgerTab || 'all';
    const tabs = [
      { id: 'all', label: '전체' },
      { id: 'in', label: '입금' },
      { id: 'out', label: '출금' }
    ];
    const emptyCopy = allRows.length
      ? { title: '이 구분에는 아직 기록이 없어요.', body: '다른 칸을 눌러 입금·출금을 확인해 보세요.' }
      : { title: '아직 기록된 입출금이 없어요.', body: '잔액은 서버가 정하고, 화면에서 더하거나 빼지 않아요.' };
    const empty = `<div class="empty-state compact record-empty"><strong>${esc(emptyCopy.title)}</strong><p>${esc(emptyCopy.body)}</p></div>`;
    const cards = rows.map((row) => `<article class="record-card"><div class="record-card-top"><strong>${esc(row.kind)}</strong><span class="pill ${row.ok ? 'ok' : 'wait'}">${esc(row.status)}</span></div><div class="record-card-meta"><span>${esc(row.copy)}</span><span>${esc(row.amount)}</span></div><p class="record-card-id">${row.at ? new Date(row.at).toLocaleString('ko-KR', { month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit' }) : '-'}</p></article>`).join('');
    const tableRows = rows.map((row) => `<tr><td>${esc(row.kind)}</td><td>${esc(row.copy)}</td><td><strong>${esc(row.amount)}</strong></td><td><span class="pill ${row.ok ? 'ok' : 'wait'}">${esc(row.status)}</span></td><td>${row.at ? new Date(row.at).toLocaleString('ko-KR', { month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit' }) : '-'}</td></tr>`).join('');
    const body = renderWalletLedgerBody(allRows, rows);
    return `<div class="section-heading" style="margin-top:0"><div><h1 class="page-title">지갑</h1><p class="page-copy">지원금·업무잔액·출금가능 세 칸을 나눠 봐요.</p></div><div class="wallet-toolbar"><button class="secondary-button" data-action="open-kyc">${icon('shield-check', 16)} 본인확인</button><button class="secondary-button" data-action="deposit-info">${icon('credit-card', 16)} 입금하기</button></div></div>
      <div class="wallet-card" style="margin-bottom:18px"><div class="eyebrow" style="color:#a8f3d2">${icon('layout-grid',14)} 세 칸 잔액</div>${renderWalletSlots()}</div>
      ${pendingOut ? `<div class="notice" style="margin-bottom:18px"><span style="color:var(--gold)">${icon('hourglass',17)}</span><div><strong>출금 ${pendingOut}건이 처리 중이에요.</strong><br>운영자가 같은 날 바로 처리해요. 화면에서 금액을 숨기지 않아요.</div></div>` : ''}
      <div class="withdraw-actions"><button class="primary-button" data-action="withdraw-allowance">${icon('banknote', 16)} 수당만 출금</button><button class="secondary-button" data-action="withdraw-principal">${icon('landmark', 16)} 보증금까지 출금</button></div>
      <div class="notice" style="margin-bottom:18px"><span style="color:var(--emerald)">${icon('info',17)}</span><div>기본 출금은 수당만이에요. 원금은 업무잔액에 남아 보여요. 보증금까지 신청하면 운영자 확인 후 지급 처리되며, 완료된 원금만큼 업무잔액이 줄어요. 회원 등급은 출금 자체로 변경되지 않아요.</div></div>
      <div class="section-heading"><div><h2>최근 지갑 내역</h2><p>입금·출금 신청과 검수 완료 수당만 표시합니다.</p></div></div>
      <div class="ledger-tabs">${tabs.map((item) => `<button type="button" class="filter-button ${tab === item.id ? 'active' : ''}" data-ledger-tab="${item.id}">${item.label}</button>`).join('')}</div>
      <div class="panel"><div class="panel-pad record-panel">${body}</div></div>`;
  }

  function renderMembershipPage() {
    const band = tierBand();
    return `<div class="membership-page"><div class="section-heading" style="margin-top:0"><div><h1 class="page-title">사원증</h1><p class="page-copy">이름·사진·사원번호가 한 장에 있어요. 탭하면 뒷면이 돌아와요.</p></div><span class="status-badge gold">${icon('sparkles',13)} ${esc(band.label)} 등급</span></div><div class="membership-stage">${renderCrewIdCard()}<p class="page-copy membership-hint">탭하면 사원증이 한 번 돌아가요.</p><div class="membership-links"><button type="button" class="text-link" data-nav="benefits">${icon('award', 16)} 등급·혜택 보기</button><button type="button" class="text-link" data-nav="referrals">${icon('gift', 16)} 추천 코드 보기</button></div></div></div>`;
  }

  function renderBenefitsPage() {
    const current = tierBand();
    const next = nextMemberBand(current);
    const quotaLine = dailyQuotaSummaryText();
    const nextLine = next ? `다음 등급은 ${next.label}${ieya(next.label)}.` : '지금이 가장 높은 등급이에요.';
    const cards = MEMBER_BANDS.map((band) => {
      const mine = band.label === current.label || band.raw === current.raw;
      const stats = (band.stats || []).map((stat) => `<div class="benefit-stat">${icon(stat.icon, 15)}<div><small>${esc(stat.label)}</small><strong>${esc(stat.value)}</strong></div></div>`).join('');
      return `<article class="benefit-card${mine ? ' is-current' : ''}" data-tone="${esc(band.tone || 'line')}"><div class="benefit-card-head"><span class="benefit-badge" aria-hidden="true">${esc(band.badge || '')}</span><div><h3>${esc(band.label)}</h3><p class="benefit-ladder">${esc(band.ladder)}</p></div>${mine ? '<span class="status-badge gold">지금 등급</span>' : ''}</div><div class="benefit-stats">${stats}</div></article>`;
    }).join('');
    return `<div class="section-heading" style="margin-top:0"><div><h1 class="page-title">등급·혜택</h1><p class="page-copy">${esc(current.label)} 등급이에요. ${esc(nextLine)} 다음 등급 조건은 곧 안내돼요.</p><p class="page-copy">${esc(quotaLine)}</p></div></div>
      <div class="benefit-grid benefit-ladder">${cards}</div>
      <div class="panel panel-pad benefit-note">
        <h2>보증금까지 출금하면</h2>
        <p class="help-line">${icon('banknote', 16)}<span>운영자가 확인한 뒤 지급 처리해요. 며칠 뒤에 돈을 묶지 않아요.</span></p>
        <p class="help-line">${icon('briefcase', 16)}<span>완료된 원금만큼 업무잔액이 줄어요. 회원 등급은 출금 자체로 변경되지 않아요.</span></p>
        <p class="help-line">${icon('shield-check', 16)}<span>기존 회원 등급·혜택·라인 상태는 원금 출금 자체로 변경하지 않아요.</span></p>
        <p class="help-line">${icon('waypoints', 16)}<span>출금 완료 후 남은 업무잔액이 필요한 보증금보다 적으면 해당 업무는 새로 시작할 수 없어요.</span></p>
        <p class="page-copy">남은 업무잔액에 따라 이용 가능한 업무 규모가 다시 계산돼요.</p>
      </div>
      <p class="page-copy" style="margin-top:12px;font-size:12px;color:var(--muted)">이 등급·혜택은 근무 기회를 나누는 기준이에요. 이율이나 이자는 없어요.</p>`;
  }

  function renderReferralsPage() {
    const rows = Array.isArray(state.referrals) ? state.referrals : [];
    const paid = rows.filter((row) => row.status === 'paid').length;
    const pending = rows.filter((row) => !['paid', 'rejected'].includes(row.status)).length;
    const timeline = rows.length
      ? rows.map((row) => `<div class="timeline-item"><div class="timeline-dot ${row.status === 'paid' ? '' : 'pending'}"></div><div class="timeline-content"><strong>${esc(row.label)}</strong><p>${esc(referralStatusLabel(row.status))} · 입금·업무 여부는 서버 상태값으로만 표시합니다.</p></div><div class="timeline-time">${row.status === 'paid' ? '+5,000원' : referralStatusLabel(row.status)}</div></div>`).join('')
      : `<div class="empty-state compact"><strong>아직 추천한 회원이 없어요.</strong><p>추천 코드로 가입한 회원이 생기면 단계가 여기에 나타납니다.</p></div>`;
    return `<div class="section-heading" style="margin-top:0"><div><h1 class="page-title">추천인 혜택</h1><p class="page-copy">코드를 나눠 주고, 가입·입금·근무가 끝나면 보상이 확정돼요.</p></div><button class="primary-button" data-action="copy-referral" aria-label="추천 코드 복사">${icon('copy',16)} 추천 코드 복사</button></div><div class="grid-hero"><div class="hero-card" style="min-height:220px"><div class="eyebrow"><span class="pulse-dot"></span> 내 추천 코드</div><div style="display:flex;align-items:center;gap:13px;margin-top:18px"><div style="font-size:34px;font-weight:900;letter-spacing:.08em">${esc(referralCode())}</div></div><p class="hero-copy" style="margin-top:14px">초대한 회원이 실제 입금과 유효한 업무를 완료하고 검수를 통과하면 추천 보상이 확정됩니다.</p><ol class="referral-funnel"><li>가입</li><li>입금</li><li>근무 완료</li><li>보상</li></ol></div><div class="panel panel-pad referral-stats"><div class="panel-title">추천 보상 현황</div><div class="wallet-balance" style="color:var(--text);margin:12px 0 18px">${money(state.wallet.referral)}</div><div class="wallet-row"><span>초대한 회원</span><strong>${rows.length}명</strong></div><div class="wallet-row"><span>조건 확인 중</span><strong>${pending}명</strong></div><div class="wallet-row"><span>보상 확정</span><strong>${paid}명</strong></div></div></div><div class="panel"><div class="panel-head"><div><div class="panel-title">추천 회원 단계</div><div class="panel-subtitle">개인정보는 보호된 상태로 표시됩니다.</div></div></div><div class="timeline">${timeline}</div></div>`;
  }

  function renderSupportPage() {
    const tab = state.helpTab || 'work';
    const tabs = [
      { id: 'work', label: '오늘 근무' },
      { id: 'badge', label: '사원증' },
      { id: 'pay', label: '정산·지갑' },
      { id: 'out', label: '출금' }
    ];
    const faq = (question, answer) => `<details class="help-faq"><summary>${question}</summary><div class="help-faq-body">${answer}</div></details>`;
    const bodies = {
      work: `
        ${faq('출근은 어떻게 하나요?', '작업실에서 한 칸을 골라 출근해요. 오늘 배정 물량 5건의 실물 라벨 번호를 전표와 대조하면 돼요. 하루 30~60분이면 충분해요.')}
        ${faq('검수는 언제 끝나나요?', '제출한 칸이 승인되거나 반려되면 다음 칸을 골라 출근할 수 있어요.')}
        ${faq('PC에서도 근무할 수 있나요?', '네. 브라우저에서 바로 근무·입금이 돼요. 홈 화면 아이콘은 있으면 편하고, 없어도 출근할 수 있어요.')}`,
      badge: `
        ${faq('사원번호는 무엇인가요?', 'PDK-로 시작하는 번호가 사원번호예요. 카드 한 장에 이름·사진·사원번호·협력사 배지가 같이 있어요.')}
        ${faq('협력사 배지는 왜 바뀌나요?', '지금 출근하는 라인의 협력사가 카드에 보여요. 다른 라인으로 일하면 배지도 그 라인으로 바뀌어요.')}
        ${faq('등급·혜택은 어디서 보나요?', '<p class="membership-links"><button type="button" class="text-link" data-nav="benefits">등급·혜택 보기</button></p>')}
        <p class="help-legal">퍼뜩 멤버십 운영이며, 근로계약·4대보험·협력사 인사 채용은 아니에요.</p>`,
      pay: `
        ${faq('지갑의 세 칸은 무엇인가요?', '지원금·업무잔액·출금가능. 세 칸은 섞이지 않아요.')}
        ${faq('근무 보증금은 언제 돌아오나요?', '승인되면 원금은 업무잔액으로, 수당은 출금가능 칸에 반영돼요. <br>✅ 일이 끝나면 원금과 수당이 잔액에 같이 반영돼요.')}
        ${faq('화면의 금액은 어떻게 정해지나요?', '서버가 정해요. 화면에서 숫자를 더하거나 빼지 않아요.')}`,
      out: `
        ${faq('수당은 어떻게 출금하나요?', '지갑의 큰 버튼은 수당만 출금이에요. 원금은 업무잔액에 남아 보여요.')}
        ${faq('원금도 출금할 수 있나요?', '네. 운영자 확인 후 지급되고, 완료된 원금만큼 업무잔액이 줄어요. 원금 출금 자체로 회원 등급이나 라인을 낮추지 않아요.')}
        ${faq('첫 출금은 어떻게 하나요?', '체험 수당 3천 원은 1회만, 원화 계좌로 신청할 수 있어요.')}`
    };
    return `<div class="section-heading" style="margin-top:0"><div><h1 class="page-title">도움말</h1><p class="page-copy">궁금한 것을 바로 찾아보세요.</p></div></div>
      <div class="help-tabs">${tabs.map((item) => `<button type="button" class="filter-button ${tab === item.id ? 'active' : ''}" data-help-tab="${item.id}">${item.label}</button>`).join('')}</div>
      <div class="panel panel-pad help-body">${bodies[tab] || bodies.work}</div>
      <p class="help-contact-line">💬 답을 못 찾았으면 <button type="button" class="text-link" data-action="open-channel-talk" aria-label="상담원에게 물어보기">상담원에게 물어보세요</button></p>`;
  }

  function renderMemberPage() {
    if (state.memberPage === 'nodes') return renderNodesPage();
    if (state.memberPage === 'history') return renderHistoryPage();
    if (state.memberPage === 'wallet') return renderWalletPage();
    if (state.memberPage === 'membership') return renderMembershipPage();
    if (state.memberPage === 'benefits') return renderBenefitsPage();
    if (state.memberPage === 'referrals') return renderReferralsPage();
    if (state.memberPage === 'support') return renderSupportPage();
    return renderMemberDashboard();
  }

  function renderAdminOverview() {
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
    return `<div class="admin-stat-grid"><div class="admin-stat"><p>가입 회원</p><strong>${state.adminMembersContract ? state.adminMemberTotal : '—'}</strong><span>${state.adminMembersContract ? '서버 조회 기준' : '운영 서버에서 아직 받지 못함'}</span></div><div class="admin-stat"><p>오늘 처리 업무</p><strong>${reviews.filter((item) => item.updated_at && new Date(item.updated_at).toDateString() === new Date().toDateString()).length}</strong><span>실제 업무 기록 기준</span></div><div class="admin-stat"><p>검수 대기</p><strong>${state.adminReviewPendingCount}</strong><span style="color:var(--gold)">운영자 확인 필요</span></div><div class="admin-stat"><p>오늘 확정 보상</p><strong>${money(approvedToday)}</strong><span>검수 완료 기준</span></div></div><div class="admin-layout"><div><div class="admin-card"><div class="admin-card-head"><div><h3>오늘의 운영 흐름</h3><p>서버에 기록된 업무 상태를 기준으로 확인합니다.</p></div><span class="status-badge">${icon('activity',13)} 정상</span></div><div class="chart-wrap" style="padding:0;height:250px"><canvas id="adminChart" aria-label="운영 현황"></canvas></div></div><div class="admin-card"><div class="admin-card-head"><div><h3>검수 대기 업무</h3><p>승인하면 회원의 작업내역과 지갑에 즉시 반영됩니다.</p></div><button class="text-link" data-nav="reviews">전체보기</button></div><div class="table-wrap"><table><thead><tr><th>회원</th><th>기업·업무</th><th>대기시간</th><th>예상 보상</th><th></th></tr></thead><tbody>${queueBody}</tbody></table></div></div></div><div><div class="admin-card"><div class="admin-card-head"><div><h3>기업 확인 현황</h3><p>협력 자료 승인 상태를 기준으로 회원 공개 여부를 관리합니다.</p></div><button class="text-link" data-nav="companies">관리</button></div>${adminBrandViews().slice(0,5).map(renderCompanyRow).join('') || '<div class="empty-state compact"><strong>등록된 협력사가 없습니다.</strong></div>'}</div><div class="admin-card"><div class="admin-card-head"><div><h3>운영자가 확인할 일</h3><p>회원에게 노출되는 상태를 실제 기록과 함께 관리합니다.</p></div></div><div class="notice"><span style="color:var(--gold)">${icon('clipboard-check',17)}</span><div><strong>${state.adminReviewPendingCount}건의 검수 대기</strong><br>검수 관리에서 승인·재확인·반려를 선택하세요.</div></div><button class="secondary-button" data-nav="reviews" style="width:100%;margin-top:12px">검수 목록 열기</button></div></div></div>`;
  }

  function renderPartnerGallery() {
    if (!companies.length) return '';
    const cards = companies.map((company) => {
      const logo = company.logoUrl || brandAssetSrc(company.logo_asset_path, company.slug, 'logo');
      const photo = company.photoUrl || brandAssetSrc(company.photo_asset_path, company.slug, 'photo') || logo;
      return `<article class="partner-card"><div class="partner-photo">${photo ? `<img src="${esc(photo)}" alt="${esc(company.name)} 사진" />` : ''}</div><div class="partner-card-body">${renderBrandVisual(company)}<div><strong>${esc(company.name)}</strong><small>${esc(company.category)}</small></div></div>${company.copy ? `<p>${esc(company.copy)}</p>` : ''}</article>`;
    }).join('');
    return `<div class="section-heading"><div><h2>공개 협력사</h2><p>운영자가 로고·사진·소개를 넣고 승인한 8곳입니다.</p></div></div><section class="partner-gallery">${cards}</section>`;
  }

  function renderCompanyRow(company) {
    return `<div class="company-row">${renderBrandVisual(company, 'lg')}<div class="company-info"><strong>${esc(company.name)}</strong><small>${esc(company.category)} · ${company.verified ? '자료 확인 완료' : '자료 등록 필요'}</small></div><span class="pill ${company.verified ? 'ok' : 'wait'}">${company.verified ? '공개 가능' : '확인 대기'}</span></div>`;
  }

  function renderAdminMembers() {
    const members = Array.isArray(state.adminMembers) ? state.adminMembers : [];
    const filter = state.adminMemberFilter || 'all';
    const error = state.adminMembersError
      ? `<div class="notice" style="margin-bottom:16px"><span style="color:var(--gold)">${icon('triangle-alert',17)}</span><div>${esc(state.adminMembersError)}</div></div>`
      : '';
    const rows = members.map((item) => {
      const status = item.status || 'pending';
      const ok = status === 'active';
      const memberId = esc(item.id || item.user_id || '');
      return `<tr>
        <td><strong>${esc(item.public_id || '-')}</strong></td>
        <td>${esc(item.display_name || '퍼뜩 회원')}</td>
        <td>${esc(item.email || '-')}</td>
        <td>${esc(item.phone || item.phone_e164 || '-')}</td>
        <td>${esc(item.member_tier || '일반 파트너')}</td>
        <td>${item.last_login_at ? new Date(item.last_login_at).toLocaleString('ko-KR', { month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit' }) : '-'}</td>
        <td>${esc(item.last_login_ip || '-')}</td>
        <td><strong>${money(item.wallet?.available)}</strong></td>
        <td><strong>${money(item.wallet?.work)}</strong></td>
        <td><strong>${money(item.wallet?.held)}</strong></td>
        <td><span class="pill ${ok ? 'ok' : 'wait'}">${esc(memberStatusLabel(status))}</span></td>
        <td><div class="action-row"><button class="small-button" data-action="member-detail" data-member-id="${memberId}">자세히</button><button class="small-button primary" data-action="member-credit" data-member-id="${memberId}">잔액 입금</button><button class="small-button" data-action="member-debit" data-member-id="${memberId}">잔액 차감</button></div></td>
      </tr>`;
    }).join('');
    const body = rows || `<tr><td colspan="12"><div class="empty-state compact"><div class="empty-icon">${icon('users',22)}</div><strong>${state.adminMembersLoading ? '회원 정보를 불러오고 있어요.' : '표시할 회원이 없어요.'}</strong><p>검색은 회원번호·이름·이메일·휴대폰을 기준으로 합니다.</p></div></td></tr>`;
    return `<div class="section-heading" style="margin-top:0"><div><h1 class="page-title">회원 관리</h1><p class="page-copy">출금 가능·업무 진행·잠금 금액을 나눠 확인해요. 목록의 개인정보는 가려져 있어요.</p></div><button class="secondary-button" data-action="refresh-members" ${state.adminMembersLoading ? 'disabled' : ''}>${icon('refresh-cw',16)} ${state.adminMembersLoading ? '불러오는 중…' : '새로고침'}</button></div>${error}<div class="admin-card"><form id="memberSearchForm" class="search-bar"><input id="memberSearchInput" value="${esc(state.adminMemberQuery || '')}" placeholder="회원번호, 이름, 이메일, 휴대폰" /><button class="small-button primary" type="submit">찾기</button></form><div class="filter-row"><button class="filter-button ${filter === 'all' ? 'active' : ''}" data-member-filter="all">전체${state.adminMembersContract ? ` ${state.adminMemberTotal}` : ''}</button><button class="filter-button ${filter === 'active' ? 'active' : ''}" data-member-filter="active">활동 중</button><button class="filter-button ${filter === 'pending' ? 'active' : ''}" data-member-filter="pending">확인 중</button><button class="filter-button ${filter === 'blocked' ? 'active' : ''}" data-member-filter="blocked">차단</button></div><div class="table-wrap"><table><thead><tr><th>회원번호</th><th>이름</th><th>이메일</th><th>휴대폰</th><th>등급</th><th>최근 접속</th><th>접속 주소</th><th>출금 가능</th><th>업무 진행</th><th>잠금</th><th>상태</th><th></th></tr></thead><tbody>${body}</tbody></table></div></div>`;
  }

  function renderAdminCompanies() {
    const brands = adminBrandViews();
    const errorText = state.adminCatalogError ? String(state.adminCatalogError.message || state.adminCatalogError) : '';
    const accessNote = state.adminCatalogError
      ? '<div class="notice" style="margin-bottom:18px"><span style="color:var(--gold)">' + icon('triangle-alert',17) + '</span><div><strong>기업 목록을 불러오지 못했어요.</strong><br>' + esc(errorText) + ' <button class="text-link" data-action="refresh-catalog">다시 불러오기</button></div></div>'
      : state.adminCatalogLoading
        ? '<div class="notice" style="margin-bottom:18px"><span style="color:var(--gold)">' + icon('loader-circle',17) + '</span><div><strong>기업 정보를 불러오는 중이에요.</strong><br>회원에게 공개될 자료를 서버에서 확인하고 있어요.</div></div>'
        : '<div class="notice" style="margin-bottom:18px"><span style="color:var(--gold)">' + icon('file-lock-2',17) + '</span><div><strong>공식 표시 기준</strong><br>협력 확인 자료와 로고 사용 자료를 등록한 뒤 승인하고, 회원 공개를 눌러야 회원 화면에 표시됩니다.</div></div>';
    const rows = brands.map((company) => {
      const verified = company.verification_status === 'approved' || company.verified === true;
      const logoApproved = company.logo_usage_status === 'approved' || company.logoApproved === true;
      const published = company.published === true;
      const action = !verified || !logoApproved ? 'approve' : published ? 'unpublish' : 'publish';
      const label = action === 'approve' ? '자료·로고 승인' : action === 'publish' ? '회원 공개' : '회원 공개 중지';
      const buttonClass = action === 'publish' || action === 'approve' ? 'primary' : '';
      const photoSrc = company.photoUrl || brandAssetSrc(company.photo_asset_path, company.slug, 'photo');
      const detail = company.logo_asset_path
        ? '<small style="display:block;color:var(--muted);max-width:180px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap" title="' + esc(company.logo_asset_path) + '">로고 경로 등록됨</small>'
        : '<small style="display:block;color:var(--muted)">로고 경로 미등록</small>';
      const photo = photoSrc
        ? '<img src="' + esc(photoSrc) + '" alt="' + esc(company.name) + ' 사진" style="width:72px;height:48px;object-fit:contain;background:#fff;border:1px solid var(--line);border-radius:8px;padding:3px" />'
        : '<small style="color:var(--muted)">사진 없음</small>';
      return '<tr><td><div style="display:flex;align-items:center;gap:9px">' + renderBrandVisual(company, 'lg') + '<div><strong>' + esc(company.name) + '</strong>' + detail + '</div></div></td><td>' + photo + '</td><td>' + esc(company.category) + '</td><td><span class="pill ' + (verified ? 'ok' : 'wait') + '">' + (verified ? '승인 완료' : company.verification_status === 'submitted' ? '자료 확인 필요' : '자료 미등록') + '</span></td><td><span class="pill ' + (logoApproved ? 'ok' : 'wait') + '">' + (logoApproved ? '사용 승인' : company.logo_usage_status === 'submitted' ? '사용 확인 필요' : '파일 필요') + '</span></td><td><span class="pill ' + (published ? 'ok' : '') + '">' + (published ? '공개 중' : '비공개') + '</span></td><td><div class="action-row"><button class="small-button ' + buttonClass + '" data-brand-action="' + action + '" data-brand-id="' + esc(company.id) + '">' + label + '</button><button class="small-button" data-action="edit-company" data-brand-id="' + esc(company.id) + '">수정</button></div></td></tr>';
    }).join('');
    const body = rows || '<tr><td colspan="7"><div class="empty-state compact"><div class="empty-icon">' + icon('building-2',22) + '</div><strong>등록된 협력사가 없어요.</strong><p>운영자 권한으로 협력사 자료를 먼저 등록해 주세요.</p></div></td></tr>';
    return '<div class="section-heading" style="margin-top:0"><div><h1 class="page-title">기업 관리</h1><p class="page-copy">협력 자료, 로고, 사진, 회원 공개 상태를 서버에서 관리합니다.</p></div><button class="primary-button" data-action="add-company">' + icon('plus',16) + ' 기업 등록</button></div>' + accessNote + '<div class="admin-card"><div class="table-wrap"><table><thead><tr><th>기업</th><th>사진</th><th>분야</th><th>협력 자료</th><th>로고</th><th>회원 공개</th><th>관리</th></tr></thead><tbody>' + body + '</tbody></table></div></div>';
  }

  function renderAdminNodes() {
    const rows = adminNodeViews();
    const brands = adminBrandViews();
    const body = rows.map((node) => {
      const company = brands.find((item) => item.id === node.companyId) || adminBrandById(node.companyId);
      const status = node.catalogStatus;
      const action = status === 'published' ? 'pause_node' : 'publish_node';
      const label = status === 'published' ? '회원 공개 중지' : status === 'archived' ? '다시 공개' : '회원 공개';
      const statusText = status === 'published' ? '공개 중' : status === 'paused' ? '일시 중지' : status === 'archived' ? '보관됨' : '작성 중';
      return '<tr><td><strong>' + esc(node.title) + '</strong><br><span style="color:var(--muted);font-size:11px">' + esc(node.publicId || node.level || '') + '</span></td><td>' + esc(company.name) + '</td><td>' + esc(node.minutes) + '</td><td>' + money(node.rewardMin) + '~' + money(node.rewardMax) + '</td><td>' + node.available.toLocaleString('ko-KR') + '건</td><td><button class="small-button ' + (status === 'published' ? 'primary' : '') + '" data-catalog-node-action="' + action + '" data-node-id="' + esc(node.id) + '">' + label + '</button><br><span class="pill ' + (status === 'published' ? 'ok' : 'wait') + '" style="margin-top:5px">' + statusText + '</span></td><td><span class="pill ok">' + esc(node.motion) + ' 연출</span></td><td><div class="action-row"><button class="small-button" data-action="edit-node" data-node-id="' + esc(node.id) + '">수정</button><button class="small-button" data-catalog-node-action="archive_node" data-node-id="' + esc(node.id) + '">보관</button></div></td></tr>';
    }).join('');
    const bodyHtml = body || '<tr><td colspan="8"><div class="empty-state compact"><div class="empty-icon">' + icon('waypoints',22) + '</div><strong>등록된 업무 카드가 없어요.</strong><p>협력사를 승인한 뒤 업무 카드를 등록해 주세요.</p></div></td></tr>';
    const errorText = state.adminCatalogError ? String(state.adminCatalogError.message || state.adminCatalogError) : '';
    const notice = state.adminCatalogError
      ? '<div class="notice" style="margin-bottom:18px"><span style="color:var(--gold)">' + icon('triangle-alert',17) + '</span><div><strong>업무 목록을 불러오지 못했어요.</strong><br>' + esc(errorText) + ' <button class="text-link" data-action="refresh-catalog">다시 불러오기</button></div></div>'
      : '';
    return '<div class="section-heading" style="margin-top:0"><div><h1 class="page-title">업무 카드 관리</h1><p class="page-copy">업무 내용, 예상시간, 보상, 공개 상태를 관리합니다.</p></div><button class="primary-button" data-action="add-node">' + icon('plus',16) + ' 업무 카드 만들기</button></div>' + notice + '<div class="admin-card"><div class="table-wrap"><table><thead><tr><th>업무 카드</th><th>기업</th><th>시간</th><th>보상 범위</th><th>하루 수량</th><th>노출</th><th>연출</th><th></th></tr></thead><tbody>' + bodyHtml + '</tbody></table></div></div>';
  }

  function renderAdminReviews() {
    const statusLabel = {
      submitted: '제출 완료',
      review_pending: '검수 대기',
      approved: '검수 완료',
      rework: '재확인 요청',
      rejected: '반려'
    };
    const reviews = Array.isArray(state.adminReviews) ? state.adminReviews : [];
    const rows = reviews.map((item) => {
      const pending = ['submitted', 'review_pending'].includes(item.status);
      const busy = state.adminReviewBusyId === item.id;
      const status = statusLabel[item.status] || '처리 중';
      const date = item.updated_at || item.created_at;
      const when = date ? new Date(date).toLocaleString('ko-KR', { month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit' }) : '-';
      return `<tr>
        <td><strong>${esc(item.member_name)}</strong><br><span style="color:var(--muted);font-size:11px">${esc(item.member_public_id || '')}</span></td>
        <td><strong>${esc(item.company_name)}</strong><br><span style="color:var(--muted);font-size:11px">${esc(item.node_title)}</span></td>
        <td>${when}</td>
        <td>${Math.round(Number(item.progress || 0) * 100)}%</td>
        <td>${money(item.reward_amount)}</td>
        <td><span class="pill ${item.status === 'approved' ? 'ok' : 'wait'}">${status}</span></td>
        <td>${pending ? `<div style="display:flex;gap:6px;flex-wrap:wrap"><button class="small-button primary" data-review-action="approved" data-review-id="${esc(item.id)}" ${busy ? 'disabled' : ''}>${busy ? '처리 중…' : '검수 완료'}</button><button class="small-button" data-review-action="rework" data-review-id="${esc(item.id)}" ${busy ? 'disabled' : ''}>재확인</button><button class="small-button" data-review-action="rejected" data-review-id="${esc(item.id)}" ${busy ? 'disabled' : ''}>반려</button></div>` : `<span style="color:var(--muted);font-size:12px">처리 완료</span>`}</td>
      </tr>`;
    }).join('');
    const body = rows || `<tr><td colspan="7"><div class="empty-state compact"><div class="empty-icon">${icon('clipboard-check', 22)}</div><strong>현재 검수할 업무가 없어요.</strong><p>회원이 업무를 제출하면 이 목록에 자동으로 나타납니다.</p></div></td></tr>`;
    const error = state.adminReviewError ? `<div class="notice" style="margin-bottom:16px"><span style="color:var(--gold)">${icon('triangle-alert',17)}</span><div>${esc(state.adminReviewError.message || state.adminReviewError)}</div></div>` : '';
    return `<div class="section-heading" style="margin-top:0"><div><h1 class="page-title">업무 검수</h1><p class="page-copy">제출 완료와 검수 대기 업무를 확인하고, 승인하면 회원 화면에 즉시 검수 완료와 보상이 표시됩니다.</p></div><div class="action-row"><button class="secondary-button" data-action="create-review-run">검수 대상 만들기</button><button class="secondary-button" data-action="refresh-reviews" ${state.adminReviewLoading ? 'disabled' : ''}>${icon('refresh-cw',16)} ${state.adminReviewLoading ? '불러오는 중…' : '새로고침'}</button></div></div>${error}<div class="admin-stat-grid"><div class="admin-stat"><p>검수 대기</p><strong>${state.adminReviewPendingCount}</strong><span>제출·대기 상태</span></div><div class="admin-stat"><p>검수 완료</p><strong>${state.adminReviewCompletedCount}</strong><span>최근 처리 내역 포함</span></div></div><div class="admin-card"><div class="filter-row"><span class="filter-button active">실제 서버 기록 ${reviews.length}건</span><span class="filter-button">완료하면 회원 지갑에 반영</span></div><div class="table-wrap"><table><thead><tr><th>회원</th><th>업무</th><th>최근 상태 시각</th><th>진행률</th><th>예상 보상</th><th>상태</th><th>처리</th></tr></thead><tbody>${body}</tbody></table></div></div>`;
  }

  function renderAdminFinance() {
    const finance = state.adminFinance || { deposits: [], withdrawals: [], kyc: [], referrals: [] };
    const depositWait = finance.deposits.filter((row) => ['submitted', 'checking'].includes(row.status)).length;
    const withdrawWait = finance.withdrawals.filter((row) => ['submitted', 'checking'].includes(row.status)).length;
    const approvedToday = (Array.isArray(state.adminReviews) ? state.adminReviews : [])
      .filter((item) => item.status === 'approved' && item.updated_at && new Date(item.updated_at).toDateString() === new Date().toDateString())
      .reduce((sum, item) => sum + Number(item.reward_amount || 0), 0);
    const contractNote = state.adminFinanceContract === false
      ? `<p class="contract-note">입출금·본인확인·추천 보상 처리 연결이 아직 없습니다. 예시 대기 목록은 표시하지 않아요.</p>`
      : '';
    const error = state.adminFinanceError && state.adminFinanceContract !== false
      ? `<div class="notice" style="margin-bottom:16px"><span style="color:var(--gold)">${icon('triangle-alert',17)}</span><div>${esc(state.adminFinanceError)}</div></div>`
      : '';
    const combined = [
      ...finance.deposits.map((row) => ({ ...row, kind: '입금', action: 'review_deposit' })),
      ...finance.withdrawals.map((row) => ({ ...row, kind: '출금', action: 'review_withdrawal' })),
      ...finance.kyc.map((row) => ({ ...row, kind: '본인확인', action: 'review_kyc' })),
      ...finance.referrals.map((row) => ({ ...row, kind: '추천 보상', action: 'review_referral' }))
    ];
    const rows = combined.map((item) => {
      const amount = item.amount != null ? (item.currency === 'USDT' ? `${Number(item.amount).toLocaleString('ko-KR')} 테더` : money(item.amount)) : '-';
      const when = item.created_at || item.updated_at;
      const pending = ['submitted', 'checking', 'pending'].includes(item.status);
      const pillClass = item.status === 'approved' || item.status === 'sent' ? 'ok' : 'wait';
      const actions = pending
        ? `<div class="action-row"><button class="small-button primary" data-finance-action="${esc(item.action)}" data-finance-id="${esc(item.id)}" data-finance-decision="approved" aria-label="승인">승인</button><button class="small-button" data-finance-action="${esc(item.action)}" data-finance-id="${esc(item.id)}" data-finance-decision="rejected" aria-label="반려">반려</button></div>`
        : `<span style="color:var(--muted);font-size:12px">처리 완료</span>`;
      return `<tr><td>${esc(item.kind)}</td><td>${esc(item.member_name || item.member_public_id || '-')}</td><td>${esc(amount)}</td><td><span class="pill ${pillClass}">${esc(financeStatusLabel(item.status))}</span></td><td>${when ? new Date(when).toLocaleString('ko-KR', { hour: '2-digit', minute: '2-digit' }) : '-'}</td><td>${actions}</td></tr>`;
    }).join('');
    const body = rows || `<tr><td colspan="6"><div class="empty-state compact"><div class="empty-icon">${icon('wallet-cards',22)}</div><strong>처리할 입출금·본인확인이 없어요.</strong><p>회원 신청이 들어오면 서버 기록만 이 목록에 나타납니다.</p></div></td></tr>`;
    return `<div class="section-heading" style="margin-top:0"><div><h1 class="page-title">입출금 처리</h1><p class="page-copy">입금과 출금을 운영자가 직접 확인하고 처리합니다.</p></div><div class="action-row"><button class="secondary-button" data-action="create-operator-deposit">처리 대기 입금 만들기</button><button class="secondary-button" data-action="refresh-finance" ${state.adminFinanceLoading ? 'disabled' : ''}>${icon('refresh-cw',16)} ${state.adminFinanceLoading ? '불러오는 중…' : '새로고침'}</button></div></div>${contractNote}${error}<div class="admin-stat-grid"><div class="admin-stat"><p>입금 확인 대기</p><strong>${depositWait}</strong><span style="color:var(--gold)">수동 확인 필요</span></div><div class="admin-stat"><p>출금 신청</p><strong>${withdrawWait}</strong><span style="color:var(--gold)">본인확인 필요</span></div><div class="admin-stat"><p>오늘 확정 보상</p><strong>${money(approvedToday)}</strong><span>검수 완료 기준</span></div><div class="admin-stat"><p>본인확인 대기</p><strong>${finance.kyc.length}</strong><span>원본 주소는 공개하지 않음</span></div></div><div class="admin-card"><div class="admin-card-head"><div><h3>처리 대기 목록</h3><p>회원에게 표시되는 상태와 처리 기록을 함께 관리합니다.</p></div></div><div class="table-wrap"><table><thead><tr><th>구분</th><th>회원</th><th>금액</th><th>확인 상태</th><th>요청 시간</th><th></th></tr></thead><tbody>${body}</tbody></table></div></div>`;
  }

  function renderAdminNotifications() {
    return `<div class="section-heading" style="margin-top:0"><div><h1 class="page-title">공지·알림</h1><p class="page-copy">회원에게 보여줄 안내와 실제 업무 배정 알림을 관리합니다.</p></div><button class="primary-button" data-action="new-notice">${icon('plus',16)} 새 안내 만들기</button></div><div class="admin-card"><div class="notice"><span style="color:var(--emerald)">${icon('bell-ring',17)}</span><div><strong>알림 원칙</strong><br>실제 배정·검수·입출금 상태를 바탕으로 안내하고, 가짜 마감이나 확정 수익 문구는 사용하지 않습니다.</div></div><div style="margin-top:18px"><div class="company-row"><div class="company-logo" style="background:var(--emerald)">${icon('target',17)}</div><div class="company-info"><strong>특정 회원 업무 배정</strong><small>실제 노드를 배정한 뒤에만 알림을 보냅니다.</small></div><button class="small-button primary" data-action="assign-task">배정하기</button></div><div class="company-row"><div class="company-logo" style="background:var(--gold)">${icon('megaphone',17)}</div><div class="company-info"><strong>특정 회원 알림</strong><small>회원 ID를 지정해 안내를 보냅니다.</small></div><button class="small-button" data-action="target-notice">보내기</button></div><div class="company-row"><div class="company-logo" style="background:#5d4fb2">${icon('users',17)}</div><div class="company-info"><strong>전체 공지</strong><small>서비스 점검·업무 안내·지원금 정책</small></div><button class="small-button" data-action="new-notice">작성</button></div></div></div>`;
  }

  function renderAdminOperations() {
    const brandCount = state.adminCatalogLoaded ? state.adminCatalog.brands.length : 0;
    const nodeCount = state.adminCatalogLoaded ? state.adminCatalog.nodes.length : 0;
    const pending = Number(state.adminReviewPendingCount || 0);
    return `<div class="section-heading" style="margin-top:0"><div><h1 class="page-title">업무 운영</h1><p class="page-copy">협력사와 업무 카드를 한곳에서 관리합니다.</p></div></div>
      <div class="admin-layout">
        <div>
          <div class="admin-card"><div class="admin-card-head"><div><h3>기업 관리</h3><p>협력 자료 승인·공개 상태와 브랜드 정보를 관리합니다.</p></div><span class="pill ok">${brandCount}개</span></div>
            <div class="notice"><span style="color:var(--emerald)">기업</span><div><strong>협력사 공개 상태를 관리</strong><br>승인된 협력사만 회원 화면에 공개됩니다.</div></div>
            <button class="secondary-button" data-nav="companies" style="width:100%;margin-top:12px">기업 관리 열기</button>
          </div>
        </div>
        <div>
          <div class="admin-card"><div class="admin-card-head"><div><h3>업무 카드 관리</h3><p>회원에게 공개할 실제 업무 카드의 등록·공개·중지를 관리합니다.</p></div><span class="pill ok">${nodeCount}개</span></div>
            <div class="notice"><span style="color:var(--gold)">업무</span><div><strong>현재 검수 대기 ${pending}건</strong><br>공개된 업무는 회원의 오늘 업무와 연결됩니다.</div></div>
            <button class="primary-button" data-nav="nodes" style="width:100%;margin-top:12px">업무 카드 관리 열기</button>
          </div>
        </div>
      </div>`;
  }

  function renderAdminSettings() {
    const campaign = state.adminCampaigns[0] || {};
    const contractNote = state.adminCampaignsContract === false
      ? `<p class="contract-note">지원금 캠페인 저장 계약(<code>list_campaigns</code>, <code>update_campaign</code>)이 아직 없습니다. 브라우저에만 저장하지 않으며, 서버 응답이 있을 때만 반영합니다.</p>`
      : '';
    return `<div class="section-heading" style="margin-top:0"><div><h1 class="page-title">설정·기타 운영</h1><p class="page-copy">자주 쓰지 않는 운영 도구는 한곳에 모았습니다.</p></div><button class="primary-button" data-action="save-settings">설정 저장</button></div>
      <div class="admin-card" style="margin-bottom:14px"><div class="admin-card-head"><div><h3>기타 운영 도구</h3><p>메인 메뉴를 단순하게 유지하면서 필요한 기능은 여기에서 엽니다.</p></div></div>
        <div class="form-grid">
          <button class="secondary-button" type="button" data-nav="motion">연출 관리</button>
          <button class="secondary-button" type="button" data-nav="landing-content">랜딩 현황·후기</button>
        </div>
      </div>${contractNote}<div class="admin-card"><div class="admin-card-head"><div><h3>신규 회원 업무 지원금</h3><p>기존 지급 기록은 변경하지 않고, 앞으로 가입하는 회원에게만 적용됩니다.</p></div><span class="pill ${campaign.enabled === false ? 'wait' : 'ok'}">${campaign.enabled === false ? '중지' : '사용 중'}</span></div><div class="form-grid"><div class="field"><label>기본 지급 금액</label><input id="supportGrantInput" type="number" value="${Number(campaign.amount ?? state.supportGrant)}" min="0" step="1000" /></div><div class="field"><label>지급 시점</label><select id="supportTriggerInput"><option value="signup" ${campaign.trigger_type === 'signup' ? 'selected' : ''}>가입 완료 후</option><option value="email_verified" ${campaign.trigger_type === 'email_verified' ? 'selected' : ''}>이메일 인증 후</option><option value="phone_verified" ${campaign.trigger_type === 'phone_verified' ? 'selected' : ''}>휴대폰 인증 후</option><option value="kyc_approved" ${campaign.trigger_type === 'kyc_approved' ? 'selected' : ''}>본인확인 완료 후</option></select></div><div class="field"><label>사용 범위</label><select id="supportScopeInput"><option value="work_only" ${campaign.usage_scope === 'work_only' ? 'selected' : ''}>업무 전용</option><option value="withdrawable" ${campaign.usage_scope === 'withdrawable' ? 'selected' : ''}>출금 가능</option></select></div><div class="field"><label>유효기간(일)</label><input id="supportExpireInput" type="number" min="0" value="${Number(campaign.expires_in_days || 0)}" /></div><div class="field"><label>캠페인 상태</label><select id="supportEnabledInput"><option value="true" ${campaign.enabled !== false ? 'selected' : ''}>활성화</option><option value="false" ${campaign.enabled === false ? 'selected' : ''}>중지</option></select></div><div class="field full"><label>회원에게 보여줄 안내</label><textarea id="supportCopyInput" rows="3">가입을 환영해요. 업무를 시작하는 데 사용할 수 있는 지원금입니다.</textarea></div></div></div>`;
  }

  function renderAdminGate() {
    const waiting = authState.loading || authState.adminLoading;
    const sessionEmail = String(authState.session?.user?.email || '').trim();
    const title = waiting ? '운영자 권한을 확인하고 있어요' : authState.session ? '운영자 권한이 없어요' : '운영자 로그인이 필요해요';
    const copy = waiting
      ? '잠시만 기다려 주세요. 안전한 운영자 확인을 진행하고 있어요.'
      : authState.session
        ? '회원 앱과 같은 이메일이라도, 운영자 권한은 따로 연결된 계정만 들어갈 수 있어요.'
        : '운영자 계정으로 로그인하면 회원·업무·입출금 메뉴가 열립니다.';
    const emailLine = authState.session && sessionEmail && !waiting
      ? `<p class="page-copy" style="margin:0 auto 10px;font-weight:600">🔐 지금 로그인: ${esc(sessionEmail)}</p>`
      : '';
    const reasonLine = authState.session && authState.adminAuthError && !waiting
      ? `<p class="page-copy" style="margin:0 auto 14px;color:var(--muted,#888)">ℹ️ ${esc(authState.adminAuthError)}</p>`
      : '';
    return `<section class="empty-state" style="max-width:640px;margin:80px auto;text-align:center"><div class="empty-icon">${icon(waiting ? 'loader-circle' : 'shield-alert', 28)}</div><h1 class="page-title">${title}</h1><p class="page-copy" style="margin:12px auto 22px">${copy}</p>${emailLine}${reasonLine}${!authState.session && !waiting ? '<button class="primary-button" data-action="open-login">운영자 로그인</button>' : ''}${authState.session && !waiting ? '<button class="secondary-button" data-action="logout" style="margin-left:8px">로그아웃</button>' : ''}</section>`;
  }

  function renderAdminPage() {
    if (window.PUTDUK_ADMIN && typeof window.PUTDUK_ADMIN.renderPage === 'function') {
      const override = window.PUTDUK_ADMIN.renderPage(state.adminPage);
      if (typeof override === 'string') return override;
    }
    if (state.adminPage === 'members') return renderAdminMembers();
    if (state.adminPage === 'companies') return renderAdminCompanies();
    if (state.adminPage === 'nodes') return renderAdminNodes();
    if (state.adminPage === 'reviews') return renderAdminReviews();
    if (state.adminPage === 'finance') return renderAdminFinance();
    if (state.adminPage === 'notifications') return renderAdminNotifications();
    if (state.adminPage === 'operations') return renderAdminOperations();
    if (state.adminPage === 'settings') return renderAdminSettings();
    return renderAdminOverview();
  }

  function renderCatalogOverlay(node, company, photo) {
    const runId = inspectSeedKey(state.run, node);
    const expected = catalogListingForRun(runId);
    const draft = readCatalogListing(state.player.listing);
    const ready = gradeCatalogListing(runId, draft);
    return `<div class="modal-backdrop player-backdrop"><div class="player-sheet">
      <div class="player-stage"><canvas id="motionCanvas" aria-hidden="true"></canvas></div>
      <div class="player-card">
        <div class="player-toolbar">
          <div class="player-kicker">${icon('package', 15)} ${esc(company.name)} · 상품 정리</div>
          <button type="button" class="icon-button" data-action="close-run" aria-label="닫기">${icon('x', 18)}</button>
        </div>
        <div class="wms-mission-copy">${icon('clipboard-check', 13)} 카드에 적힌 상품명·가격·옵션·배송을 그대로 적어 주세요. 한 화면에서 끝나요.</div>
        <div class="wms-inspect-box">
          <div class="wms-invoice-card">
            <div class="wms-card-tag">${icon('file-text', 13)} 오늘 배정 상품 카드</div>
            <div class="wms-card-grid">
              <div class="wms-card-col"><span class="wms-field-label">상품명</span><span class="wms-field-val">${esc(expected.productName)}</span></div>
              <div class="wms-card-col"><span class="wms-field-label">가격</span><span class="wms-field-val">${esc(expected.price)}원</span></div>
              <div class="wms-card-col"><span class="wms-field-label">옵션</span><span class="wms-field-val">${esc(expected.option)}</span></div>
              <div class="wms-card-col"><span class="wms-field-label">배송 조건</span><span class="wms-field-val">${esc(expected.shipping)}</span></div>
            </div>
          </div>
          <div class="wms-target-card">
            <div class="wms-card-tag">${icon('package', 13)} 상품 사진</div>
            <div class="player-photo">${photo ? `<img src="${esc(photo)}" alt="${esc(company.name)} 근무 사진" />` : `<div class="player-photo-fallback">${esc(company.mark || '라인')}</div>`}</div>
          </div>
        </div>
        <form class="catalog-entry" data-catalog-entry="1">
          <label class="field" for="catalogProductName"><span>상품명</span><input id="catalogProductName" name="product_name" maxlength="80" value="${esc(draft.productName)}" placeholder="카드에 적힌 상품명" /></label>
          <label class="field" for="catalogPrice"><span>가격</span><input id="catalogPrice" name="price" inputmode="numeric" maxlength="12" value="${esc(draft.price)}" placeholder="숫자만" /></label>
          <label class="field" for="catalogOption"><span>옵션</span><input id="catalogOption" name="option" maxlength="80" value="${esc(draft.option)}" placeholder="색상·수량" /></label>
          <label class="field" for="catalogShipping"><span>배송 조건</span><input id="catalogShipping" name="shipping" maxlength="80" value="${esc(draft.shipping)}" placeholder="배송비·기간" /></label>
          <div class="player-actions">
            <button type="button" class="secondary-button" data-action="checkpoint-work">중간 저장</button>
            <button type="submit" class="primary-button">제출하기</button>
          </div>
        </form>
      </div>
    </div></div>`;
  }

  function renderRunOverlay() {
    if (!state.player || !state.run?.overlayOpen) return '';
    const node = nodeById(state.player.nodeId || state.run.nodeId);
    const company = companyById(node.companyId);
    if (isCatalogWork(node)) {
      const photo = state.player.photo || node.questionImage
        ? brandAssetSrc(state.player.photo || node.questionImage, company.slug, 'photo')
        : (company.photoUrl || brandAssetSrc(company.photo_asset_path, company.slug, 'photo'));
      return renderCatalogOverlay(node, company, photo);
    }
    const photo = state.player.photo || node.questionImage
      ? brandAssetSrc(state.player.photo || node.questionImage, company.slug, 'photo')
      : (company.photoUrl || brandAssetSrc(company.photo_asset_path, company.slug, 'photo'));
    const choice = state.player.choice;
    const bundle = syncInspectBundle(state.player.bundle, node, state.run);
    state.player.bundle = bundle;
    const currentItem = bundle.items[Math.min(bundle.current, bundle.total - 1)] || bundle.items[0];
    const isCompleted = isInspectBundleComplete(bundle);
    const currentDisplayCount = isCompleted ? bundle.total : (bundle.current + 1);
    const progressPct = isCompleted ? 100 : Math.round((bundle.current / bundle.total) * 100);
    const invoiceTail = inspectCodeTail(currentItem.invoiceCode);
    const targetTail = inspectCodeTail(currentItem.targetCode);

    return `<div class="modal-backdrop player-backdrop"><div class="player-sheet">
      <div class="player-stage"><canvas id="motionCanvas" aria-hidden="true"></canvas></div>
      <div class="player-card">
        <div class="player-toolbar">
          <div class="player-kicker">${icon('scan-barcode', 15)} ${esc(company.name)} · 현장 검수 단말</div>
          <button type="button" class="icon-button" data-action="close-run" aria-label="닫기">${icon('x', 18)}</button>
        </div>

        <div class="wms-bundle-progress">
          <div class="wms-bundle-header">
            <span class="wms-bundle-badge">${icon('clipboard-check', 13)} 오늘 배정 물량</span>
            <span class="wms-bundle-count"><strong>${currentDisplayCount}</strong> / ${bundle.total}건</span>
          </div>
          <div class="wms-bundle-bar">
            <div class="wms-bundle-fill" style="width:${progressPct}%"></div>
          </div>
          <div class="wms-mission-copy">
            ${icon('shield-check', 13)} 전표 번호를 보고, 실물 라벨 번호를 직접 입력해 주세요.
          </div>
        </div>

        <div class="wms-inspect-box">
          <div class="wms-invoice-card">
            <div class="wms-card-tag">${icon('file-text', 13)} 기준 발송 전표</div>
            <div class="wms-card-grid">
              <div class="wms-card-col">
                <span class="wms-field-label">도착지</span>
                <span class="wms-field-val">${esc(currentItem.destination)}</span>
              </div>
              <div class="wms-card-col">
                <span class="wms-field-label">화물 품목</span>
                <span class="wms-field-val">${esc(currentItem.category)}</span>
              </div>
            </div>
            <div class="wms-code-highlight">
              <span class="wms-code-label">전표 송장 번호</span>
              <span class="wms-code-num" aria-label="전표 송장 번호 ${esc(currentItem.invoiceCode)}"><span class="wms-code-prefix">PDK-</span><span class="wms-code-tail">${esc(invoiceTail)}</span></span>
            </div>
          </div>

          <div class="wms-target-card">
            <div class="wms-card-tag">${icon('package', 13)} 현장 입고 화물 사진</div>
            <div class="player-photo">${photo ? `<img src="${esc(photo)}" alt="${esc(company.name)} 근무 사진" />` : `<div class="player-photo-fallback">${esc(company.mark || '라인')}</div>`}</div>
            <div class="wms-target-match-bar">
              <span class="wms-match-label">실물 부착 라벨</span>
              <span class="wms-match-code" aria-label="실물 부착 라벨 ${esc(currentItem.targetCode)}"><span class="wms-code-prefix">PDK-</span><span class="wms-code-tail">${esc(targetTail)}</span></span>
            </div>
          </div>
        </div>

        ${isCompleted
          ? `<div class="player-actions"><button type="button" class="secondary-button" data-action="checkpoint-work">중간 저장</button><button type="button" class="primary-button is-ready-pulse" data-action="submit-player">오늘 배정 물량 검수 완료 · 제출하기</button></div>`
          : `<form class="inspect-entry" data-inspect-entry="1">
          <label class="field" for="inspectLabelInput"><span>실물에 적힌 라벨 번호</span>
            <input id="inspectLabelInput" name="label" inputmode="numeric" autocomplete="off" maxlength="12" placeholder="예: ${esc(targetTail)}" />
          </label>
          <div class="player-actions"><button type="button" class="secondary-button" data-action="checkpoint-work">중간 저장</button><button type="submit" class="primary-button">이 번호로 확인</button></div>
        </form>`}
      </div>
    </div></div>`;
  }

  function renderReviewWaitOverlay() {
    if (!state.reviewWait?.overlayOpen) return '';
    const wait = state.reviewWait;
    const node = nodeById(wait.nodeId);
    const company = companyById(node.companyId);
    const submitted = wait.submittedAt ? new Date(wait.submittedAt).toLocaleString('ko-KR', { month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit' }) : '확인 필요';
    const operatorResult = wait.status === 'rework'
      ? '운영자가 다시 확인해 달라고 했어요.'
      : wait.status === 'rejected'
        ? '운영자가 반려했어요. 원금만 돌아와요.'
        : '운영자가 확인하면 수당이 출금가능에 보여요.';
    return `<div class="modal-backdrop player-backdrop" data-modal="review-wait"><div class="player-sheet review-wait-sheet">
      <div class="player-card">
        <div class="player-toolbar">
          <div class="player-kicker">${icon('clipboard-check', 15)} 검수를 기다리고 있어요</div>
          <button type="button" class="icon-button" data-action="close-review-wait" aria-label="닫기">${icon('x', 18)}</button>
        </div>
        <div class="work-receipt-card">
          <div class="work-receipt-row"><span class="work-receipt-label">업무</span><span class="work-receipt-val">${esc(company.name)} · ${esc(node.title)}</span></div>
          <div class="work-receipt-row"><span class="work-receipt-label">상태</span><span class="work-receipt-val">${esc(runStatusLabel(wait.status))}</span></div>
          <div class="work-receipt-row"><span class="work-receipt-label">제출</span><span class="work-receipt-val">${esc(submitted)}</span></div>
          <div class="work-receipt-row highlight"><span class="work-receipt-label">예정 수당</span><span class="work-receipt-val">${formatLedgerAmount(wait.rewardAmount)}</span></div>
        </div>
        <p class="page-copy review-wait-copy">${esc(operatorResult)}</p>
        ${wait.status === 'rework' ? '<p class="page-copy review-wait-copy">제출한 번호를 다시 보고, 안내가 오면 이어서 확인해요.</p>' : ''}
        <div class="notice" style="margin-top:14px"><span style="color:var(--gold)">${icon('hourglass',17)}</span><div>화면을 닫아도 서버에 남아 있어요. 검수가 끝난 뒤에 새 출근을 할 수 있어요.</div></div>
        <div class="modal-actions"><button class="secondary-button" type="button" data-action="close-review-wait">작업실로</button><button class="primary-button" type="button" disabled aria-disabled="true">새 업무 시작</button></div>
      </div>
    </div></div>`;
  }

  function renderStartConfirm() {
    if (!state.startNodeId) return '';
    const node = nodeById(state.startNodeId);
    const company = companyById(node.companyId);
    const lines = cardMoneyLines(node);
    const outcome = lines.trial
      ? `<ul class="outcome-list"><li>✅ 승인되면 지원금은 다 쓰이고 돌려주지 않아요. 수당만 나와요.</li><li>↩️ 반려돼도 지원금은 돌아가지 않아요.</li></ul>`
      : `<ul class="outcome-list"><li>✅ 승인되면 원금과 수당이 잔액에 같이 반영돼요.</li><li>↩️ 반려되면 원금만 돌아와요.</li></ul>`;
    const quotaNote = dailyQuotaSummaryText();
    const quotaLine = quotaNote
      ? `<p class="page-copy assign-meta" data-daily-quota-summary>${icon('clock-3', 13)} ${esc(quotaNote)}</p>`
      : '';
    return `<div class="modal-backdrop" data-modal="start-confirm"><div class="modal assign-modal"><div class="modal-head"><div><p class="assign-kicker">업무 배정</p><h2>${esc(node.title)}</h2><p>${esc(company.name)}</p></div><button class="icon-button" data-action="close-start" aria-label="닫기">${icon('x',18)}</button></div><div class="modal-body"><div class="work-receipt-card assign-receipt"><div class="work-receipt-row"><span class="work-receipt-label">${lines.trial ? '지원금 잠금' : '근무 보증'}</span><span class="work-receipt-val">${money(lines.stake)}</span></div><div class="work-receipt-row highlight"><span class="work-receipt-label">수당</span><span class="work-receipt-val">+${money(lines.pay)}</span></div><div class="work-receipt-row"><span class="work-receipt-label">시간</span><span class="work-receipt-val">${esc(node.minutes)}</span></div></div>${outcome}<p class="page-copy assign-copy">${isCatalogWork(node) ? '한 화면에서 상품명·가격·옵션·배송을 적어 제출해요.' : '한 화면에서 실물 라벨 번호 5건을 입력해 대조해요.'}</p>${quotaLine}<div class="modal-actions"><button class="secondary-button" type="button" data-action="close-start">다음에</button><button class="primary-button" type="button" data-action="confirm-start">출근하기</button></div></div></div></div>`;
  }

  function renderResultOverlay() {
    if (!state.resultScene) return '';
    const scene = state.resultScene;
    const approved = scene.cut === 'approve';
    const nextStake = scene.nextStake;
    const nextCopy = nextStake
      ? (nextStake >= 30000000
        ? '이 금액 구간은 운영자 확인 후 열립니다.'
        : `다음 근무는 ${money(nextStake)} 라인이에요.`)
      : '';
    const title = approved ? '운영자 검수가 완료됐어요' : '근무 완료 전표';
    const kicker = approved ? '업무 완료' : '오늘 근무 완료';
    const pill = approved ? '검수 완료' : '검수 대기';
    const stipendLabel = approved ? '확정 수당' : '예정 수당';
    const note = approved
      ? '✅ 확정 수당이 출금가능 칸에 반영됐어요'
      : '✅ 일이 끝나면 원금과 수당이 잔액에 같이 반영돼요';
    const trial = Boolean(nodeById(scene.nodeId)?.isTrial);
    return `<div class="modal-backdrop" data-modal="result-scene"><div class="modal result-modal receipt-modal"><div class="modal-body">
      <p class="assign-kicker">${icon('clipboard-check', 16)} ${kicker}</p>
      <h2>${title}</h2>
      <div class="work-receipt-card">
        <div class="work-receipt-head">
          <span class="work-receipt-title">${approved ? '검수 완료 영수증' : '근무 전표'}</span>
          <span class="pill ${approved ? 'ok' : 'wait'}">${pill}</span>
        </div>
        <div class="work-receipt-body">
          <div class="work-receipt-row">
            <span class="work-receipt-label">검수 물량</span>
            <span class="work-receipt-val">오늘 배정 물량 5건</span>
          </div>
          <div class="work-receipt-row">
            <span class="work-receipt-label">${trial ? '지원금 잠금' : '근무 보증'}</span>
            <span class="work-receipt-val">${money(scene.principal)}</span>
          </div>
          <div class="work-receipt-row highlight">
            <span class="work-receipt-label">${stipendLabel}</span>
            <span class="work-receipt-val" style="color:var(--emerald-strong)">+${money(scene.stipend)}</span>
          </div>
        </div>
        <div class="work-receipt-note">${note}</div>
      </div>
      ${nextCopy ? `<p class="page-copy result-next">${nextCopy}</p>` : ''}
      <div class="modal-actions"><button class="primary-button" data-action="close-result">${approved ? '확인했어요' : '작업실로'}</button></div>
    </div></div></div>`;
  }

  function renderOnboarding() {
    if (isAdmin || !state.onboardingStep) return '';
    if (state.onboardingStep === 'first-work') {
      const trial = memberCatalogNodes().find((node) => node.isTrial && canAttendNode(node));
      const reward = trial ? nodePay(trial) : 3000;
      return `<div class="modal-backdrop" data-modal="onboard-first-work"><div class="modal grant-modal"><div class="modal-body"><p class="eyebrow">🎉 퍼뜩에 오신 걸 환영합니다</p><h2 class="modal-title-row">첫 업무는 퍼뜩이 지원해요.</h2><p class="page-copy">회원 부담 없이 실제 업무 흐름을 먼저 경험해 보세요. 제출하고 승인되면 완료 수당 ${money(reward)}이 출금 가능 금액에 반영됩니다.</p><div class="notice" style="margin-top:16px"><span style="color:var(--emerald)">✓</span><div>입금이나 보증금 설명은 첫 업무를 마친 뒤, 일반 업무가 필요할 때 안내합니다.</div></div><div class="modal-actions"><button class="primary-button" type="button" data-action="start-first-work" ${trial ? '' : 'disabled'}>${trial ? '첫 업무 시작' : '현재 가능한 첫 업무 없음'}</button></div></div></div></div>`;
    }
    if (state.onboardingStep === 'general-work') {
      const approved = (state.history || []).find((item) => String(item.statusRaw || item.runStatus || '') === 'approved' && nodeById(item.nodeId)?.isTrial);
      const reward = Number(approved?.reward || state.wallet.available || 0);
      return `<div class="modal-backdrop" data-modal="onboard-general-work"><div class="modal grant-modal"><div class="modal-body"><p class="eyebrow">✅ 첫 업무가 승인됐어요</p><h2 class="modal-title-row">완료 수당 <span style="color:var(--emerald)">+${money(reward)}</span></h2><p class="page-copy">이제 일반 업무를 둘러볼 수 있어요. 일반 업무의 업무 보증금은 진행 중에만 잠기고, 완료하면 업무 잔액으로 돌아옵니다. 수당은 출금 가능 금액에 따로 쌓입니다.</p><div class="modal-actions"><button class="primary-button" type="button" data-action="ack-general-work">일반 업무 보기</button></div></div></div></div>`;
    }
    return '';
  }

  function renderMemberTabbar() {
    if (isAdmin) return '';
    const current = state.memberPage;
    const tabs = [
      { id: 'dashboard', label: '근무', icon: 'briefcase', match: ['dashboard', 'nodes'] },
      { id: 'membership', label: '사원증', icon: 'id-card', match: ['membership', 'benefits'] },
      { id: 'wallet', label: '지갑', icon: 'wallet', match: ['wallet'] },
      { id: 'history', label: '내역', icon: 'clipboard-list', match: ['history'] },
      { id: 'support', label: '도움말', icon: 'circle-help', match: ['support'] }
    ];
    return `<nav class="member-tabbar" aria-label="하단 메뉴">${tabs.map((tab) => `<button type="button" class="member-tab ${tab.match.includes(current) ? 'active' : ''}" data-nav="${tab.id}"><span class="member-tab-icon">${icon(tab.icon, 20)}</span><span class="member-tab-label">${tab.label}</span></button>`).join('')}</nav>`;
  }

  function renderAuthModal() {
    return `<div class="modal-backdrop" data-modal="auth"><div class="modal"><div class="modal-head"><div><h2>퍼뜩 회원가입</h2><p>간단한 정보로 나만의 노드 카드를 발급해요.</p></div><button class="icon-button" data-action="close-modal" aria-label="닫기">${icon('x',18)}</button></div><div class="modal-body"><form id="signupForm"><div class="form-grid"><div class="field"><label for="signupName">이름</label><input id="signupName" required placeholder="실명을 입력해 주세요" /></div><div class="field"><label for="signupBirth">생년월일</label><input id="signupBirth" required inputmode="numeric" placeholder="예: 900101" /></div><div class="field"><label for="signupEmail">이메일</label><div style="display:flex;gap:7px"><input id="signupEmail" required type="email" placeholder="name@example.com" style="min-width:0" /><button class="small-button" type="button" data-action="email-check">중복확인</button></div></div><div class="field"><label for="signupPhone">휴대폰번호</label><input id="signupPhone" required inputmode="tel" placeholder="010-0000-0000" /></div><div class="field"><label for="signupPassword">비밀번호</label><input id="signupPassword" required type="password" minlength="8" placeholder="8자 이상 입력" /></div><div class="field"><label for="signupPasswordConfirm">비밀번호 확인</label><input id="signupPasswordConfirm" required type="password" minlength="8" placeholder="한 번 더 입력" /></div><div class="field full"><label for="signupReferral">추천인 코드 <span style="font-weight:500;color:var(--muted)">(선택)</span></label><input id="signupReferral" placeholder="추천인 코드가 있으면 입력해 주세요" /></div></div><label class="check-row"><input type="checkbox" required /> <span>필수 약관과 개인정보 수집 안내를 확인하고 동의합니다.</span></label><label class="check-row"><input type="checkbox" /> <span>작업 상태와 서비스 안내 알림을 받습니다. (선택)</span></label><div class="notice" style="margin-top:16px"><span style="color:var(--gold)">${icon('info',17)}</span><div>가입 후 이메일 인증을 완료하면 회원 계정과 고유 카드가 활성화됩니다. 인증 상태에 따라 일부 기능이 제한될 수 있어요.</div></div><div class="modal-actions"><button class="secondary-button" type="button" data-action="close-modal">나중에 하기</button><button class="primary-button" type="submit">회원가입하고 카드 발급</button></div></form></div></div></div>`;
  }

  function renderAuthModalLive() {
    const isLogin = state.authMode === 'login';
    const connectionCopy = supabaseClient
      ? '가입 버튼을 누르면 안전한 인증 서버에 계정이 만들어지고, 이메일 인증 설정에 따라 확인 메일이 발송됩니다.'
      : '이메일 인증을 완료하면 회원 계정이 안전하게 활성화됩니다.';
    if (isLogin) return `<div class="modal-backdrop" data-modal="auth"><div class="modal auth-modal"><div class="modal-head"><div><h2>퍼뜩 로그인</h2><p>내 작업내역과 멤버십 카드를 이어서 확인해요.</p></div><button class="icon-button" data-action="close-modal" aria-label="닫기">${icon('x',18)}</button></div><div class="auth-tabs"><button type="button" class="active" data-auth-mode="login">로그인</button><button type="button" data-auth-mode="signup">회원가입</button></div><div class="modal-body"><form id="loginForm"><div class="field"><label for="loginEmail">이메일</label><input id="loginEmail" required type="email" autocomplete="email" placeholder="name@example.com" /></div><div class="field" style="margin-top:13px"><label for="loginPassword">비밀번호</label><input id="loginPassword" required type="password" autocomplete="current-password" placeholder="비밀번호를 입력해 주세요" /></div><div data-auth-feedback hidden role="alert" aria-live="assertive" style="margin:12px 0 0;padding:10px 12px;border:1px solid color-mix(in srgb,var(--danger,#c94a4a) 38%,transparent);border-radius:12px;background:color-mix(in srgb,var(--danger,#c94a4a) 7%,var(--surface,#fff));color:var(--text,#19352c);font-size:13px;line-height:1.5"></div><div class="modal-actions"><button class="secondary-button" type="button" data-action="forgot-password">비밀번호 재설정</button><button class="primary-button" type="submit">로그인</button></div><div class="notice" style="margin-top:14px"><span style="color:var(--gold)">${icon('shield-check',17)}</span><div>${connectionCopy}</div></div></form></div></div></div>`;
    return `<div class="modal-backdrop" data-modal="auth"><div class="modal auth-modal"><div class="modal-head"><div><h2>퍼뜩 회원가입</h2><p>간단한 정보로 나만의 노드 카드를 발급해요.</p></div><button class="icon-button" data-action="close-modal" aria-label="닫기">${icon('x',18)}</button></div><div class="auth-tabs"><button type="button" class="active" data-auth-mode="signup">회원가입</button><button type="button" data-auth-mode="login">이미 계정이 있어요</button></div><div class="modal-body"><form id="signupForm"><div class="form-grid"><div class="field"><label for="signupName">이름</label><input id="signupName" required autocomplete="name" placeholder="실명을 입력해 주세요" /></div><div class="field"><label for="signupBirth">생년월일 6자리</label><input id="signupBirth" required inputmode="numeric" pattern="[0-9]{6}" maxlength="6" placeholder="예: 900101" /></div><div class="field"><label for="signupEmail">이메일</label><div style="display:flex;gap:7px"><input id="signupEmail" required type="email" autocomplete="email" placeholder="name@example.com" style="min-width:0" /><button class="small-button" type="button" data-action="email-check">형식 확인</button></div></div><div class="field"><label for="signupPhone">휴대폰번호</label><input id="signupPhone" required inputmode="tel" autocomplete="tel" placeholder="010-0000-0000" /></div><div class="field"><label for="signupPassword">비밀번호</label><input id="signupPassword" required type="password" autocomplete="new-password" minlength="8" placeholder="8자 이상 입력" /></div><div class="field"><label for="signupPasswordConfirm">비밀번호 확인</label><input id="signupPasswordConfirm" required type="password" autocomplete="new-password" minlength="8" placeholder="한 번 더 입력" /></div><div class="field full"><label for="signupReferral">추천인 코드 <span style="font-weight:500;color:var(--muted)">(선택)</span></label><input id="signupReferral" placeholder="추천인 코드가 있으면 입력해 주세요" /></div></div><label class="check-row"><input id="signupTerms" type="checkbox" required /> <span>필수 <button type="button" class="text-link inline-link" data-action="open-terms">이용약관</button>과 <button type="button" class="text-link inline-link" data-action="open-privacy">개인정보 안내</button>를 확인하고 동의합니다.</span></label><label class="check-row"><input id="signupMarketing" type="checkbox" /> <span>작업 상태와 서비스 안내 알림을 받습니다. (선택)</span></label><div class="notice" style="margin-top:16px"><span style="color:var(--gold)">${icon('info',17)}</span><div>${connectionCopy}</div></div><div class="modal-actions"><button class="secondary-button" type="button" data-action="close-modal">나중에 하기</button><button class="primary-button" type="submit">회원가입하고 카드 발급</button></div></form></div></div></div>`;
  }

  function renderLegalModal(kind) {
    const isPrivacy = kind === 'privacy';
    return `<div class="modal-backdrop" data-modal="legal"><div class="modal legal-modal"><div class="modal-head"><div><h2>${isPrivacy ? '개인정보 수집·이용 안내' : '퍼뜩 이용약관'}</h2><p>버전 2026.09.16 · 가입 전에 내용을 확인해 주세요.</p></div><button class="icon-button" data-action="close-modal" aria-label="닫기">${icon('x',18)}</button></div><div class="modal-body legal-copy">${isPrivacy ? '<h3>수집 항목</h3><p>가입 시 이름, 생년월일 입력값, 이메일, 휴대폰번호를 받습니다. 업무·출금 기능을 사용할 때 추가 본인확인 자료가 별도 요청될 수 있습니다.</p><h3>이용 목적</h3><p>회원 계정 생성, 작업내역 제공, 고객 문의 응대, 부정 이용 방지와 운영 기록 보관에 사용합니다.</p><h3>보관 및 열람</h3><p>필요한 기간 동안 보호된 저장소에 보관하며, 운영자 권한에 따라 접근을 기록합니다. 화면에 표시되는 정보는 최소화합니다.</p>' : '<h3>서비스 이용</h3><p>퍼뜩은 공개된 업무 조건에 따라 데이터 확인 작업을 제공하며, 제출 내용은 자동검사와 운영 검수를 거칩니다.</p><h3>보상 기준</h3><p>카드에 표시된 금액은 예상 보상이며, 실제 보상은 작업 결과와 검수 완료 후 확정됩니다. 입금만으로 수익이 발생한다고 안내하지 않습니다.</p><h3>계정 보호</h3><p>본인 계정의 비밀번호와 인증 수단을 안전하게 보관해야 합니다. 이상 활동이 확인되면 작업·출금이 일시 제한될 수 있습니다.</p>'}<div class="modal-actions"><button class="primary-button" data-action="close-modal">확인했어요</button></div></div></div></div>`;
  }

  function renderInfoModal(kind) {
    if (kind === 'deposit') {
      const method = state.depositMethod;
      const currency = method === 'usdt' ? 'USDT' : 'KRW';
      const lead = !method
        ? '원화와 USDT를 나눠 보여 드려요.'
        : method === 'usdt'
          ? '테더 주소는 PIN 뒤에만 보여요. 금액은 직접 적어요.'
          : '계좌는 PIN 뒤에만 보여요. 금액은 직접 적어요.';
      const amountForm = isDepositRevealed()
        ? `<form id="depositForm"><div class="notice"><span style="color:var(--emerald)">${icon('wallet',17)}</span><div>보낸 뒤 운영자가 확인해요. 화면에서 잔액을 올리지 않아요.</div></div><div class="form-grid" style="margin-top:16px"><div class="field"><label for="depositAmount">입금 금액</label><input id="depositAmount" name="amount" type="number" min="1000" step="1" required placeholder="보낼 금액을 직접 입력" value="${state.depositPresetAmount || ''}" /></div><div class="field"><label for="depositCurrency">통화</label><select id="depositCurrency" name="currency"><option value="KRW" ${currency === 'KRW' ? 'selected' : ''}>원화</option><option value="USDT" ${currency === 'USDT' ? 'selected' : ''}>USDT</option></select></div></div><input type="hidden" name="destination_id" value="${esc(filterDepositItems(state.depositReveal)?.[0]?.id || state.depositReveal?.[0]?.id || '')}" /><div class="field full"><label for="depositProofFile">입금 증빙</label><input id="depositProofFile" name="proof_file" type="file" accept="image/jpeg,image/png,image/webp,application/pdf" required /><small style="color:var(--muted)">이체내역·전송 화면을 JPG, PNG, WEBP, PDF로 올려 주세요. 최대 10MB예요.</small></div><div class="modal-actions"><button class="secondary-button" type="button" data-action="close-modal">취소</button><button class="primary-button" type="submit">입금 확인 요청</button></div></form>`
        : '';
      return `<div class="modal-backdrop" data-modal="info"><div class="modal"><div class="modal-head"><div><h2 class="modal-title-row">${icon('credit-card', 20)} ${method === 'usdt' ? 'USDT로 입금' : method === 'krw' ? '원화로 입금' : '입금하기'}</h2><p>${lead}</p></div><button class="icon-button" data-action="close-modal" aria-label="닫기">${icon('x',18)}</button></div><div class="modal-body">${renderDepositDestinations()}${amountForm}</div></div></div>`;
    }
    const principal = state.withdrawIntent === 'principal';
    const notice = principal
      ? '원금까지 신청하면 운영자 확인 후 지급 처리되며, 완료된 원금만큼 업무잔액이 줄어요. 원금 출금 자체로 회원 등급이나 라인을 낮추지 않아요.'
      : `수당만 출금해요. 원금은 업무잔액에 남아 보여요. 출금가능 ${money(state.wallet.available)}.`;
    const chipLabel = principal ? '원금 포함 출금' : '수당만 출금';
    const chipTone = principal ? 'gold' : 'emerald';
    const heroFigures = principal
      ? `<div><span>출금가능 (수당)</span><strong>${money(state.wallet.available)}</strong></div><div><span>업무잔액 (원금)</span><strong>${money(state.wallet.work)}</strong></div><div><span>신청 가능 합계</span><strong>${money(Number(state.wallet.available || 0) + Number(state.wallet.work || 0))}</strong></div>`
      : `<div><span>출금가능 (수당)</span><strong>${money(state.wallet.available)}</strong></div>`;
    const heroNote = principal
      ? '✅ 완료된 원금만큼 업무잔액이 줄고, 회원 등급은 출금 자체로 변경되지 않아요.'
      : '✅ 원금은 업무잔액에 그대로 남아요. 수당만 신청해요.';
    return `<div class="modal-backdrop" data-modal="info"><div class="modal"><div class="modal-head"><div><h2 class="modal-title-row">${principal ? `${icon('landmark', 20)} 보증금까지 출금` : `${icon('banknote', 20)} 수당만 출금`}</h2><p>${notice}</p></div><button class="icon-button" data-action="close-modal" aria-label="닫기">${icon('x',18)}</button></div><div class="modal-body"><form id="withdrawForm"><div class="withdraw-hero" data-tone="${chipTone}"><span class="withdraw-chip">${icon('shield-check', 15)} ${chipLabel}</span><div class="withdraw-hero-figures">${heroFigures}</div><p class="withdraw-hero-note">${heroNote}</p></div><input type="hidden" name="withdraw_kind" value="${principal ? 'principal' : 'allowance'}" /><div class="form-grid" style="margin-top:16px"><div class="field"><label for="withdrawAmount">출금 금액</label><input id="withdrawAmount" name="amount" type="number" min="1000" step="1" required placeholder="출금할 금액" /></div><div class="field"><label for="withdrawMethod">출금 방식</label><select id="withdrawMethod" name="destination_type"><option value="bank">원화 계좌</option><option value="usdt">USDT 지갑</option></select></div><div class="field"><label for="withdrawBank">은행명</label><input id="withdrawBank" name="bank_name" placeholder="예: 국민은행" /></div><div class="field"><label for="withdrawHolder">예금주</label><input id="withdrawHolder" name="account_holder" placeholder="예금주 이름" /></div><div class="field full"><label for="withdrawDest">계좌번호 또는 USDT 주소</label><input id="withdrawDest" name="destination" required placeholder="계좌번호 또는 지갑 주소" /></div><div class="field full"><label for="withdrawNetwork">USDT 네트워크</label><input id="withdrawNetwork" name="usdt_network" placeholder="예: TRC20" /></div><div class="field full"><label for="withdrawPin">출금 비밀번호 6자리</label><input id="withdrawPin" name="pin" type="password" inputmode="numeric" maxlength="6" pattern="[0-9]{6}" required placeholder="••••••" /></div></div><div class="modal-actions"><button class="secondary-button" type="button" data-action="close-modal">취소</button><button class="primary-button" type="submit">출금 신청</button></div></form></div></div></div>`;
  }

  function renderPrincipalConfirm() {
    const w = walletThree();
    const work = Number(w.work || 0);
    const stipend = Number(w.withdrawable || 0);
    const total = work + stipend;
    return `<div class="modal-backdrop" data-modal="withdraw-principal"><div class="modal penalty-sheet"><div class="modal-head"><div><h2 class="modal-title-row">${icon('landmark', 20)} 보증금까지 출금할까요?</h2><p>운영자가 확인한 뒤 지급 처리하고, 출금 자체로 회원 등급을 낮추지 않아요.</p></div><button class="icon-button" data-action="close-modal" aria-label="닫기">${icon('x',18)}</button></div><div class="modal-body"><div class="penalty-figures withdraw-preview"><div><span>지금 업무잔액(원금)</span><strong>${money(work)}</strong></div><div><span>지금 출금가능(수당)</span><strong>${money(stipend)}</strong></div><div class="is-total"><span>신청하면 이 합계까지</span><strong>${money(total)}</strong></div></div><div class="notice penalty-list"><div class="penalty-row">${icon('banknote', 16)}<span>운영자가 확인한 뒤 ${money(total)}까지 지급 처리해요.</span></div><div class="penalty-row">${icon('shield-check', 16)}<span>완료된 원금만큼 업무잔액이 줄어요. 원금 출금 자체로 회원 등급이나 라인을 낮추지 않아요.</span></div><p>출금 완료 후 남은 업무잔액이 필요한 보증금보다 적으면 해당 업무는 새로 시작할 수 없어요.</p></div><div class="modal-actions"><button class="secondary-button" type="button" data-action="close-modal">취소</button><button class="gold-button" type="button" data-action="confirm-principal">출금 정보 입력</button></div></div></div></div>`;
  }

  function renderKycModal() {
    const slot = (id, title, accept) => `<label class="kyc-slot"><span class="kyc-slot-title">${title}</span><span class="kyc-file-btn">파일 고르기</span><input class="kyc-file-input" type="file" id="${id}" accept="${accept}" /><small class="kyc-file-name">아직 고르지 않았어요</small></label>`;
    const idAccept = 'image/jpeg,image/png,image/webp,application/pdf';
    const selfieAccept = 'image/jpeg,image/png,image/webp';
    return `<div class="modal-backdrop" data-modal="kyc"><div class="modal"><div class="modal-head"><div><h2>본인확인 자료 제출</h2><p>신분증 앞면·뒷면·셀카를 올리면 운영자가 검수합니다.</p></div><button class="icon-button" data-action="close-modal" aria-label="KYC 창 닫기">${icon('x',18)}</button></div><div class="modal-body"><form id="kycForm"><div class="notice"><span style="color:var(--gold)">${icon('file-lock-2',17)}</span><div>원본 파일 주소는 회원 화면에 공개하지 않습니다. 운영자만 짧은 확인 주소로 봅니다.</div></div><div class="kyc-slots" style="margin-top:16px">${slot('kycFront', '신분증 앞면', idAccept)}${slot('kycBack', '신분증 뒷면', idAccept)}${slot('kycSelfie', '셀카', selfieAccept)}</div><div class="modal-actions"><button class="secondary-button" type="button" data-action="close-modal">나중에</button><button class="primary-button" type="submit">검수 요청</button></div></form></div></div></div>`;
  }

  function renderDepositJumpConfirm() {
    const jump = state.depositJump || {};
    const amount = Number(jump.amount || 0);
    const pay = stipendGuess(amount);
    const ultra = amount >= 30000000;
    const ultraCopy = ultra
      ? `<p class="page-copy">${icon('shield-check', 16)} 이 금액 구간은 운영자 확인 후 열립니다</p>`
      : '';
    return `<div class="modal-backdrop" data-modal="deposit-jump"><div class="modal cinematic-modal penalty-sheet"><div class="cinematic-stage"><canvas id="depositJumpMotionCanvas" aria-hidden="true"></canvas></div><div class="modal-head"><div><h2 class="modal-title-row">${icon('shield-alert', 20)} 고액 입금, 한 번 더 확인할까요?</h2><p>실수로 큰 금액이 들어가지 않게 막아요.</p></div><button class="icon-button" data-action="back-deposit" aria-label="닫기">${icon('x',18)}</button></div><div class="modal-body"><form id="depositJumpForm"><div class="penalty-figures"><div><span>잠금 금액</span><strong>${money(amount)}</strong></div><div><span>끝나면 원금+수당</span><strong>${money(amount + pay)}</strong></div><div><span>끝나면 수당</span><strong>${money(pay)}</strong></div></div><ul class="outcome-list"><li>✅ 일이 끝나면 원금과 수당이 잔액에 같이 반영돼요.</li><li>↩️ 반려되면 원금만 돌아와요.</li></ul>${ultraCopy}<div class="field" style="margin-top:14px"><label for="depositJumpRepeat">같은 금액을 다시 적어 주세요</label><input id="depositJumpRepeat" name="repeat_amount" inputmode="numeric" autocomplete="off" placeholder="숫자만 다시 입력" /></div><div class="slide-confirm"><label for="depositJumpSlide">밀어 확정</label><input id="depositJumpSlide" type="range" min="0" max="100" value="0" /><span class="slide-hint">금액을 다시 적거나, 오른쪽 끝까지 밀면 확정돼요.</span></div><div class="modal-actions"><button class="secondary-button" type="button" data-action="back-deposit">돌아가기</button><button class="primary-button" id="depositJumpSubmit" type="submit" disabled>이 금액으로 요청</button></div></form></div></div></div>`;
  }

  function renderNotificationsModal() {
    return `<div class="modal-backdrop" data-modal="notifications"><div class="modal notice-inbox-modal"><div class="modal-head"><div><h2>알림</h2><p>사원증으로 온 안내예요. 종을 누르면 확인한 걸로 표시돼요.</p></div><button type="button" class="icon-button" data-action="close-modal" aria-label="알림 창 닫기">${icon('x',18)}</button></div><div class="modal-body">${noticeToolbarMarkup()}<div class="notice-list">${noticeListMarkup()}</div></div></div></div>`;
  }

  function renderCompanyForm() {
    const brand = state.modalPayload || {};
    const editing = Boolean(brand.id);
    return `<div class="modal-backdrop" data-modal="company-form"><div class="modal"><div class="modal-head"><div><h2>${editing ? '협력사 수정' : '협력사 등록'}</h2><p>법인명·분야·소개·자료·로고·사진을 서버에 저장합니다.</p></div><button class="icon-button" data-action="close-modal">${icon('x',18)}</button></div><div class="modal-body"><form id="companyForm"><input type="hidden" name="brand_id" value="${esc(brand.id || '')}" /><div class="form-grid"><div class="field"><label>한국어 표시명</label><input name="display_name_ko" value="${esc(brand.display_name_ko || brand.name || '')}" ${editing ? 'readonly' : 'required'} /></div><div class="field"><label>법인명</label><input name="legal_name" value="${esc(brand.legal_name || '')}" ${editing ? '' : 'required'} /></div><div class="field"><label>분야</label><input name="category" value="${esc(brand.category || brand.label || '')}" ${editing ? '' : 'required'} /></div><div class="field"><label>식별 슬러그</label><input name="slug" value="${esc(brand.slug || '')}" placeholder="dhl" ${editing ? 'readonly' : ''} /></div><div class="field full"><label>한국어 소개</label><textarea name="description_ko" rows="3" maxlength="2000">${esc(brand.description_ko || brand.copy || '')}</textarea></div><div class="field full"><label>자료 URL</label><input name="source_url" value="${esc(brand.source_url || '')}" placeholder="https://" /></div><div class="field full"><label>로고 파일 경로</label><input name="logo_asset_path" value="${esc(brand.logo_asset_path || '')}" placeholder="brand-logos/dhl-logo.png" /></div><div class="field full"><label>사진 파일 경로</label><input name="photo_asset_path" value="${esc(brand.photo_asset_path || '')}" placeholder="brand-logos/dhl-photo.png" /></div><div class="field full"><label>승인 메모</label><textarea name="verification_note" rows="3">${esc(brand.verification_note || '')}</textarea></div></div><div class="modal-actions"><button class="secondary-button" type="button" data-action="close-modal">취소</button><button class="primary-button" type="submit">${editing ? '수정 저장' : '등록 요청'}</button></div></form></div></div></div>`;
  }

  function renderNodeForm() {
    const node = state.modalPayload || {};
    const editing = Boolean(node.id);
    const brands = adminBrandViews();
    const brandOptions = brands.map((brand) => `<option value="${esc(brand.id)}" ${String(brand.id) === String(node.companyId || node.partner_brand_id || '') ? 'selected' : ''}>${esc(brand.name)}</option>`).join('');
    const motionOptions = MOTION_PROFILES.map((item) => `<option value="${item.id}" ${String(node.motion || node.motion_profile || 'default') === item.id ? 'selected' : ''}>${item.label}</option>`).join('');
    return `<div class="modal-backdrop" data-modal="node-form"><div class="modal"><div class="modal-head"><div><h2>${editing ? '업무 카드 수정' : '업무 카드 등록'}</h2><p>보상 범위와 예상시간은 서버 값을 그대로 저장합니다.</p></div><button class="icon-button" data-action="close-modal">${icon('x',18)}</button></div><div class="modal-body"><form id="nodeForm"><input type="hidden" name="node_id" value="${esc(node.id || '')}" /><div class="form-grid"><div class="field"><label>협력사</label><select name="partner_brand_id" required>${brandOptions || '<option value="">먼저 협력사를 등록해 주세요</option>'}</select></div><div class="field"><label>난이도</label><select name="difficulty"><option ${node.level === '빠른 확인' || node.difficulty === '빠른 확인' ? 'selected' : ''}>빠른 확인</option><option ${!node.difficulty || node.difficulty === '일반 처리' || node.level === '일반 처리' ? 'selected' : ''}>일반 처리</option><option ${node.level === '집중 처리' || node.difficulty === '집중 처리' ? 'selected' : ''}>집중 처리</option><option ${node.level === '전문 검수' || node.difficulty === '전문 검수' ? 'selected' : ''}>전문 검수</option></select></div><div class="field full"><label>업무명</label><input name="title_ko" required maxlength="120" value="${esc(node.title_ko || node.title || '')}" /></div><div class="field full"><label>설명</label><textarea name="description_ko" required maxlength="1000" rows="3">${esc(node.description_ko || node.copy || '')}</textarea></div><div class="field"><label>분류</label><input name="node_family" required value="${esc(node.node_family || node.category || '데이터 업무')}" /></div><div class="field"><label>예상시간(초)</label><input name="estimated_seconds" type="number" min="30" max="5400" required value="${Number(node.estimated_seconds || node.time || 60)}" /></div><div class="field"><label>최소 보상</label><input name="reward_min" type="number" min="0" required value="${Number(node.reward_min ?? node.rewardMin ?? 0)}" /></div><div class="field"><label>최대 보상</label><input name="reward_max" type="number" min="0" required value="${Number(node.reward_max ?? node.rewardMax ?? node.reward ?? 0)}" /></div><div class="field"><label>하루 처리 한도</label><input name="daily_capacity" type="number" min="0" required value="${Number(node.daily_capacity ?? node.available ?? 0)}" /></div><div class="field"><label>가능 등급</label><input name="required_tier" value="${esc(node.required_tier || '일반 파트너')}" /></div><div class="field"><label>연출 프로필</label><select name="motion_profile">${motionOptions}</select></div><div class="field"><label>연출 버전</label><input name="motion_version" value="${esc(node.motion_version || node.motionVersion || '2.0.0')}" /></div></div><div class="modal-actions"><button class="secondary-button" type="button" data-action="close-modal">취소</button><button class="primary-button" type="submit">${editing ? '수정 저장' : '카드 만들기'}</button></div></form></div></div></div>`;
  }

  function renderBalanceAdjustForm() {
    const preset = state.modalPayload || {};
    const member = state.adminMembers.find((item) => String(item.id) === String(preset.id || preset.user_id) || String(item.user_id) === String(preset.id || preset.user_id))
      || state.adminMemberDetail
      || preset;
    const direction = preset.direction === 'debit' ? 'debit' : 'credit';
    const title = direction === 'debit' ? '잔액 차감' : '잔액 입금';
    const bucket = ['support_grant', 'work_balance', 'available'].includes(preset.bucket) ? preset.bucket : 'available';
    const bucketLabel = bucket === 'support_grant' ? '지원금' : bucket === 'work_balance' ? '근무 잔액' : '출금 가능';
    const copy = direction === 'debit'
      ? '선택한 칸에서 서버 원장을 통해 차감합니다. 화면에서 숫자를 빼지 않습니다.'
      : '선택한 칸에 서버 원장을 통해 입금합니다. 화면에서 숫자를 더하지 않습니다.';
    const wallet = member.wallet || {};
    const bucketOptions = `<option value="available" ${bucket === 'available' ? 'selected' : ''}>출금 가능</option><option value="work_balance" ${bucket === 'work_balance' ? 'selected' : ''}>근무 잔액</option><option value="support_grant" ${bucket === 'support_grant' ? 'selected' : ''}>지원금</option>`;
    if (preset.confirmAmount != null) {
      const amount = Number(preset.confirmAmount) || 0;
      return `<div class="modal-backdrop" data-modal="balance-adjust"><div class="modal"><div class="modal-head"><div><h2>${title} 최종 확인</h2><p>${esc(member.public_id || member.display_name || '회원')}</p></div><button class="icon-button" data-action="close-modal" aria-label="닫기">${icon('x',18)}</button></div><div class="modal-body"><form id="balanceAdjustForm" data-phase="confirm"><input type="hidden" name="user_id" value="${esc(preset.user_id || '')}" /><input type="hidden" name="direction" value="${esc(direction)}" /><input type="hidden" name="amount" value="${esc(String(amount))}" /><input type="hidden" name="currency" value="${esc(preset.currency || 'KRW')}" /><input type="hidden" name="reason" value="${esc(preset.reason || '')}" /><input type="hidden" name="bucket" value="${esc(bucket)}" /><div class="notice"><span style="color:var(--gold)">${icon('triangle-alert',17)}</span><div><strong>한 번 더 확인해 주세요.</strong><br>${esc(bucketLabel)} 칸에 금액을 서버 원장에 바로 반영해요. 되돌리려면 반대 방향으로 다시 조정해야 해요.</div></div><div class="penalty-figures" style="margin-top:14px"><div><span>${title} 금액</span><strong>${money(amount)}</strong></div><div><span>칸</span><strong style="font-size:14px">${esc(bucketLabel)}</strong></div><div><span>사유</span><strong style="font-size:14px">${esc(preset.reason || '-')}</strong></div></div><div class="modal-actions"><button class="secondary-button" type="button" data-action="back-balance-adjust">다시 입력</button><button class="primary-button" type="submit">네, ${title} 진행할게요</button></div></form></div></div></div>`;
    }
    return `<div class="modal-backdrop" data-modal="balance-adjust"><div class="modal"><div class="modal-head"><div><h2>${title}</h2><p>${esc(member.public_id || member.display_name || '회원')}</p></div><button class="icon-button" data-action="close-modal" aria-label="닫기">${icon('x',18)}</button></div><div class="modal-body"><form id="balanceAdjustForm" data-phase="entry"><input type="hidden" name="user_id" value="${esc(member.id || member.user_id || '')}" /><input type="hidden" name="direction" value="${esc(direction)}" /><div class="notice"><span style="color:var(--emerald)">${icon('wallet',17)}</span><div>${copy}<br>현재 출금 가능 <strong>${money(wallet.available)}</strong> · 근무 잔액 <strong>${money(wallet.work ?? wallet.task)}</strong> · 지원금 <strong>${money(wallet.support)}</strong></div></div><div class="form-grid" style="margin-top:16px"><div class="field"><label for="adjustAmount">금액</label><input id="adjustAmount" name="amount" type="number" min="1" step="1" required placeholder="1 이상" value="${esc(preset.amount != null ? String(preset.amount) : '')}" /></div><div class="field"><label for="adjustBucket">칸</label><select id="adjustBucket" name="bucket" required>${bucketOptions}</select></div><div class="field"><label for="adjustCurrency">통화</label><select id="adjustCurrency" name="currency"><option value="KRW">원화</option></select></div><div class="field full"><label for="adjustReason">사유</label><textarea id="adjustReason" name="reason" rows="2" required maxlength="500" placeholder="운영 기록에 남길 사유">${esc(preset.reason || '')}</textarea></div></div><div class="modal-actions"><button class="secondary-button" type="button" data-action="close-modal">취소</button><button class="primary-button" type="submit">다음: 금액 확인</button></div></form></div></div></div>`;
  }

  function renderMemberDetailModal() {
    const member = state.modalPayload || state.adminMemberDetail || {};
    const wallet = member.wallet || {};
    return `<div class="modal-backdrop" data-modal="member-detail"><div class="modal"><div class="modal-head"><div><h2>회원 상세</h2><p>${esc(member.public_id || '회원번호 확인 중')}</p></div><button class="icon-button" data-action="close-modal">${icon('x',18)}</button></div><div class="modal-body"><div class="detail-list"><div><span>이름</span><strong>${esc(displayText(member.display_name))}</strong></div><div><span>이메일</span><strong>${esc(displayText(member.email))}</strong></div><div><span>휴대폰</span><strong>${esc(displayText(member.phone || member.phone_e164))}</strong></div><div><span>등급</span><strong>${esc(displayText(member.member_tier))}</strong></div><div><span>상태</span><strong>${esc(memberStatusLabel(member.status || 'pending'))}</strong></div><div><span>가입일</span><strong>${esc(displayTime(member.created_at))}</strong></div><div><span>최근 접속</span><strong>${esc(displayTime(member.last_login_at))}</strong></div><div><span>IP</span><strong>${esc(displayText(member.last_login_ip))}</strong></div><div><span>본인확인</span><strong>${esc(kycStatusLabel(member.kyc_status))}</strong></div><div><span>추천 수</span><strong>${Number(member.referral_count || 0)}</strong></div><div><span>지원금</span><strong>${money(wallet.support)}</strong></div><div><span>근무 잔액</span><strong>${money(wallet.work ?? wallet.task)}</strong></div><div><span>출금 가능</span><strong>${money(wallet.available)}</strong></div><div><span>보류액</span><strong>${money(wallet.held)}</strong></div></div><div class="action-row" style="margin-top:16px"><button class="small-button primary" data-action="member-credit" data-member-id="${esc(member.id || member.user_id || '')}">잔액 입금</button><button class="small-button" data-action="member-debit" data-member-id="${esc(member.id || member.user_id || '')}">잔액 차감</button><button class="small-button" data-action="member-block" data-member-id="${esc(member.id || member.user_id || '')}" data-member-status="blocked">차단</button><button class="small-button" data-action="member-block" data-member-id="${esc(member.id || member.user_id || '')}" data-member-status="active">차단 해제</button><button class="small-button" data-action="member-tier" data-member-id="${esc(member.id || member.user_id || '')}">등급 변경</button><button class="small-button" data-action="member-reset" data-member-id="${esc(member.id || member.user_id || '')}">비밀번호 재설정</button><button class="small-button primary" data-action="assign-task" data-member-id="${esc(member.id || member.user_id || '')}">업무 배정</button><button class="small-button" data-action="target-notice" data-member-id="${esc(member.id || member.user_id || '')}">알림</button></div></div></div></div>`;
  }

  function renderMemberTierForm() {
    const member = state.modalPayload || state.adminMemberDetail || {};
    const current = member.member_tier || '일반 파트너';
    const options = MEMBER_TIERS.includes(current) ? MEMBER_TIERS : [current, ...MEMBER_TIERS];
    return `<div class="modal-backdrop" data-modal="member-tier"><div class="modal"><div class="modal-head"><div><h2>등급 변경</h2><p>${esc(member.public_id || member.display_name || '회원')}</p></div><button class="icon-button" data-action="close-modal" aria-label="닫기">${icon('x',18)}</button></div><div class="modal-body"><form id="memberTierForm"><input type="hidden" name="user_id" value="${esc(member.id || member.user_id || '')}" /><div class="notice"><span style="color:var(--emerald)">${icon('badge-check',17)}</span><div>선택한 등급은 서버에 바로 저장됩니다. 현재 등급: <strong>${esc(displayText(current))}</strong></div></div><div class="form-grid" style="margin-top:16px"><div class="field full"><label for="memberTierSelect">등급</label><select id="memberTierSelect" name="member_tier" required>${options.map((tier) => `<option value="${esc(tier)}" ${tier === current ? 'selected' : ''}>${esc(tier)}</option>`).join('')}</select></div><div class="field full"><label for="memberTierReason">사유 (선택)</label><textarea id="memberTierReason" name="reason" rows="2" maxlength="240" placeholder="운영 기록에 남길 사유"></textarea></div></div><div class="modal-actions"><button class="secondary-button" type="button" data-action="close-modal">취소</button><button class="primary-button" type="submit">등급 저장</button></div></form></div></div></div>`;
  }

  function renderMemberBlockForm() {
    const member = state.modalPayload || state.adminMemberDetail || {};
    const blocked = member.nextStatus === 'blocked';
    return `<div class="modal-backdrop" data-modal="member-block"><div class="modal"><div class="modal-head"><div><h2>${blocked ? '회원 차단' : '차단 해제'}</h2><p>${esc(member.public_id || member.display_name || '회원')}</p></div><button class="icon-button" data-action="close-modal" aria-label="닫기">${icon('x',18)}</button></div><div class="modal-body"><form id="memberBlockForm"><input type="hidden" name="user_id" value="${esc(member.id || member.user_id || '')}" /><input type="hidden" name="next_status" value="${esc(member.nextStatus || 'blocked')}" /><div class="notice"><span style="color:var(--gold)">${icon('shield-alert',17)}</span><div>${blocked ? '차단하면 해당 회원은 로그인과 업무를 할 수 없습니다.' : '차단을 해제하면 회원이 다시 서비스를 이용할 수 있습니다.'}</div></div><div class="form-grid" style="margin-top:16px"><div class="field full"><label for="memberBlockReason">사유${blocked ? '' : ' (선택)'}</label><textarea id="memberBlockReason" name="reason" rows="2" ${blocked ? 'required' : ''} maxlength="240" placeholder="${blocked ? '차단 사유를 입력해 주세요' : '해제 사유 (선택)'}"></textarea></div></div><div class="modal-actions"><button class="secondary-button" type="button" data-action="close-modal">취소</button><button class="primary-button" type="submit">${blocked ? '차단하기' : '해제하기'}</button></div></form></div></div></div>`;
  }

  function renderMemberResetForm() {
    const member = state.modalPayload || state.adminMemberDetail || {};
    return `<div class="modal-backdrop" data-modal="member-reset"><div class="modal"><div class="modal-head"><div><h2>비밀번호 재설정</h2><p>${esc(member.public_id || member.display_name || '회원')}</p></div><button class="icon-button" data-action="close-modal" aria-label="닫기">${icon('x',18)}</button></div><div class="modal-body"><div class="notice"><span style="color:var(--gold)">${icon('key-round',17)}</span><div>회원 이메일로 재설정 안내를 보냅니다. 운영자가 비밀번호를 직접 바꾸지 않습니다.</div></div><div class="modal-actions"><button class="secondary-button" type="button" data-action="close-modal">취소</button><button class="primary-button" type="button" data-action="confirm-reset" data-member-id="${esc(member.id || member.user_id || '')}">안내 보내기</button></div></div></div></div>`;
  }

  function renderAssignForm() {
    const preset = state.modalPayload || {};
    const brands = adminBrandViews();
    const nodeRows = adminNodeViews();
    return `<div class="modal-backdrop" data-modal="assign-task"><div class="modal"><div class="modal-head"><div><h2>특정 회원 업무 배정</h2><p>실제로 배정한 뒤에만 회원 화면에 우선 업무가 나타납니다.</p></div><button class="icon-button" data-action="close-modal">${icon('x',18)}</button></div><div class="modal-body"><form id="assignForm"><div class="form-grid"><div class="field"><label>회원 ID</label><input name="user_id" required value="${esc(preset.id || preset.user_id || '')}" placeholder="auth UUID" /></div><div class="field"><label>협력사</label><select name="partner_brand_id">${brands.map((brand) => `<option value="${esc(brand.id)}">${esc(brand.name)}</option>`).join('')}</select></div><div class="field full"><label>업무 카드</label><select name="node_id" required>${nodeRows.map((node) => `<option value="${esc(node.id)}">${esc(node.title)}</option>`).join('') || '<option value="">등록된 업무 카드 없음</option>'}</select></div><div class="field"><label>보상(참고, 서버가 확정)</label><input name="reward_amount" type="number" min="0" value="0" /></div><div class="field"><label>예상시간(초)</label><input name="estimated_seconds" type="number" min="30" max="5400" value="60" /></div><div class="field"><label>노출 시작</label><input name="visible_from" type="datetime-local" /></div><div class="field"><label>노출 종료</label><input name="visible_until" type="datetime-local" /></div><div class="field full"><label>배정 사유</label><textarea name="reason" rows="2" required placeholder="배정 사유"></textarea></div><label class="check-row"><input name="notify" type="checkbox" checked /> <span>회원에게 배정 알림 보내기</span></label></div><div class="modal-actions"><button class="secondary-button" type="button" data-action="close-modal">취소</button><button class="primary-button" type="submit">배정하기</button></div></form></div></div></div>`;
  }

  function renderNoticeForm() {
    const preset = state.modalPayload || {};
    const broadcast = state.modal === 'broadcast-notice';
    return `<div class="modal-backdrop" data-modal="notice-form"><div class="modal"><div class="modal-head"><div><h2>${broadcast ? '전체 공지' : '특정 회원 알림'}</h2><p>확정되지 않은 금액을 수익처럼 적지 마세요.</p></div><button class="icon-button" data-action="close-modal">${icon('x',18)}</button></div><div class="modal-body"><form id="noticeForm"><input type="hidden" name="broadcast" value="${broadcast ? '1' : '0'}" /><div class="form-grid"><div class="field ${broadcast ? 'full' : ''}"><label>회원 ID</label><input name="user_id" ${broadcast ? 'disabled' : 'required'} value="${esc(preset.id || preset.user_id || '')}" /></div><div class="field full"><label>제목</label><input name="title" required maxlength="80" placeholder="예: 우선 업무가 도착했어요" /></div><div class="field full"><label>내용</label><textarea name="body" required rows="4" placeholder="🎉 회원님에게 새로운 우선 업무가 배정됐어요."></textarea></div></div><div class="modal-actions"><button class="secondary-button" type="button" data-action="close-modal">취소</button><button class="primary-button" type="submit">보내기</button></div></form></div></div></div>`;
  }

  function renderModal() {
    if (isAdmin && window.PUTDUK_ADMIN && typeof window.PUTDUK_ADMIN.renderModal === 'function') {
      const override = window.PUTDUK_ADMIN.renderModal(state.modal);
      if (typeof override === 'string') return override;
    }
    if (state.modal === 'auth') return renderAuthModalLive();
    if (state.modal === 'terms') return renderLegalModal('terms');
    if (state.modal === 'privacy') return renderLegalModal('privacy');
    if (state.modal === 'deposit') return renderInfoModal('deposit');
    if (state.modal === 'deposit-jump') return renderDepositJumpConfirm();
    if (state.modal === 'withdraw') return renderInfoModal('withdraw');
    if (state.modal === 'withdraw-principal') return renderPrincipalConfirm();
    if (state.modal === 'kyc') return renderKycModal();
    if (state.modal === 'notifications') return renderNotificationsModal();
    if (state.modal === 'company-form') return renderCompanyForm();
    if (state.modal === 'node-form') return renderNodeForm();
    if (state.modal === 'member-detail') return renderMemberDetailModal();
    if (state.modal === 'member-tier') return renderMemberTierForm();
    if (state.modal === 'member-block') return renderMemberBlockForm();
    if (state.modal === 'member-reset') return renderMemberResetForm();
    if (state.modal === 'balance-adjust') return renderBalanceAdjustForm();
    if (state.modal === 'assign-task') return renderAssignForm();
    if (state.modal === 'notice-form' || state.modal === 'broadcast-notice') return renderNoticeForm();
    return '';
  }

  function renderPublicLanding() {
    return `<div class="public-landing">
      <header class="landing-header">
        <a class="landing-brand" href="/" aria-label="퍼뜩 홈"><img src="./icons/putduk-premium.png" alt="" width="40" height="40" /><strong>퍼뜩</strong></a>
        <div class="landing-header-actions"><button class="landing-link" type="button" data-action="open-login">로그인</button><button class="primary-button" type="button" data-action="open-signup">무료로 시작하기</button></div>
      </header>
      <main>
        <section class="landing-hero" aria-labelledby="landing-title">
          <p class="landing-competitors">잡코리아? 알바몬? 당근알바? 알바천국?</p>
          <h1 id="landing-title">공고를 찾지 마세요.<br><span>오늘 할 일을 고르세요.</span></h1>
          <p class="landing-lead">공고를 찾아다니고 지원 결과를 기다리는 대신,<br>퍼뜩에서는 지금 가능한 업무를 확인하고 선택할 수 있습니다.</p>
          <div class="landing-hero-actions"><button class="primary-button" type="button" data-action="open-signup">퍼뜩 시작하기</button><button class="secondary-button" type="button" data-action="open-login">로그인</button></div>
          <p class="landing-proofline">이력서 없이 · 면접 없이 · 출근 기다림 없이</p>
        </section>
        <section class="landing-compare" aria-labelledby="landing-compare-title">
          <div class="landing-section-head"><p>퍼뜩의 차이</p><h2 id="landing-compare-title">찾고 기다리는 시간을<br>실제 업무 시간으로.</h2></div>
          <div class="landing-compare-grid">
            <article><span>기존 구직</span><strong>찾기 → 지원 → 기다림</strong><ol><li>일자리 검색</li><li>공고 비교</li><li>지원서 작성</li><li>연락·면접 대기</li></ol></article>
            <article class="is-putduk"><span>퍼뜩</span><strong>확인 → 선택 → 시작</strong><ol><li>할 일 확인</li><li>업무 선택</li><li>업무 수행</li><li>제출·검수·수당 확인</li></ol></article>
          </div>
          <p class="landing-compare-note">구직 과정은 줄이고, 실제 업무는 더 빠르게.</p>
        </section>
        <section class="landing-benefits" aria-labelledby="landing-benefits-title">
          <div class="landing-section-head"><p>말이 아니라 흐름으로</p><h2 id="landing-benefits-title">퍼뜩에서는 이렇게 일합니다.</h2></div>
          <div class="landing-benefit-grid">
            <article><strong>지원하지 않습니다.</strong><p>가능한 업무를 확인하고 선택합니다.</p></article>
            <article><strong>면접을 기다리지 않습니다.</strong><p>업무 조건을 보고 준비되면 시작합니다.</p></article>
            <article><strong>조건을 먼저 봅니다.</strong><p>시작 조건, 예상 수당, 소요 시간을 확인합니다.</p></article>
            <article><strong>진행 기록이 남습니다.</strong><p>제출·검수·정산 상태를 한곳에서 확인합니다.</p></article>
          </div>
        </section>
        <section class="landing-philosophy"><p>일하고 싶은데</p><h2>왜 먼저 ‘구직’부터 해야 하죠?</h2><span>퍼뜩은 사람을 채용공고 앞에 세우는 대신<br><strong>지금 할 수 있는 업무 앞에 연결합니다.</strong></span></section>
        <section class="landing-work-preview" aria-labelledby="landing-preview-title">
          <div class="landing-section-head"><p>업무 예시</p><h2 id="landing-preview-title">휴대폰으로 확인하고 제출하는 업무</h2></div>
          <div class="landing-preview-grid">
            <article><span>배송·물류</span><strong>송장번호 형식 확인</strong><p>번호 규칙과 누락 여부를 확인합니다.</p></article>
            <article><span>상품정보</span><strong>상품 옵션 정리</strong><p>상품명·색상·규격을 기준에 맞게 정리합니다.</p></article>
            <article><span>문서 검수</span><strong>영수증 금액 대조</strong><p>문서 이미지와 추출된 값을 비교합니다.</p></article>
          </div>
          <p class="landing-preview-note">실제 공개 업무와 참여 조건은 로그인 후 확인할 수 있습니다.</p>
        </section>
        <section class="landing-final-cta"><h2>오늘 할 일을 보러 갈까요?</h2><p>가입하고 지금 가능한 업무를 확인하세요.</p><button class="primary-button" type="button" data-action="open-signup">무료로 퍼뜩 시작하기</button><button class="landing-login-inline" type="button" data-action="open-login">이미 회원이신가요? <strong>로그인</strong></button></section>
      </main>
      <footer class="landing-footer"><span>퍼뜩</span><span>가능한 업무를 확인하고 선택하는 온라인 업무 플랫폼</span></footer>
    </div>`;
  }

  function renderPublicLandingShell() {
    return `<div class="public-landing-shell">${renderPublicLanding()}</div>`;
  }
  function renderAppShell() {
    if (!isAdmin && !authState.session) return renderPublicLandingShell();
    const page = isAdmin && !authState.adminAuthorized ? renderAdminGate() : isAdmin ? renderAdminPage() : renderMemberPage();
    const sidebar = isAdmin && !authState.adminAuthorized ? '' : renderSidebar();
    return `<div class="app-shell">${sidebar}<main class="main"><div>${renderTopbar()}${page}</div></main></div>${isAdmin ? '' : renderMemberTabbar()}`;
  }

  function nextKstMidnightMs(now = Date.now()) {
    const shifted = new Date(now + 9 * 60 * 60 * 1000);
    return Date.UTC(shifted.getUTCFullYear(), shifted.getUTCMonth(), shifted.getUTCDate() + 1) - 9 * 60 * 60 * 1000;
  }

  function scheduleKstQuotaReset(serverResetAt) {
    if (kstResetTimer) window.clearTimeout(kstResetTimer);
    const parsed = Date.parse(String(serverResetAt || ''));
    const resetAt = Number.isFinite(parsed) && parsed > Date.now() ? parsed : nextKstMidnightMs();
    const delay = Math.max(250, Math.min(resetAt - Date.now() + 250, 2_147_000_000));
    kstResetTimer = window.setTimeout(async () => {
      kstResetTimer = null;
      if (authState.session) {
        try { await hydrateDailyTaskQuota(); } catch (_) {}
        if (!state.modal) render();
      }
      window.dispatchEvent(new CustomEvent('putduk:kst-day-changed', { detail: { resetAt } }));
      scheduleKstQuotaReset();
    }, delay);
  }

  function memberQuotaText(quota) {
    if (!quota) return '확인 중';
    if (quota.unlimited) return '무제한';
    return `${Number(quota.used_today || 0)} / ${Number(quota.daily_limit || 0)}회`;
  }

  function patchMemberDetailModal(member) {
    const root = document.querySelector('[data-modal="member-detail"]');
    if (!root || !member) return;
    const id = member.id || member.user_id || '';
    const wallet = member.wallet || {};
    const headId = root.querySelector('.modal-head p');
    if (headId) headId.textContent = member.public_id || '회원번호 확인 중';
    const fields = {
      '이름': displayText(member.display_name),
      '이메일': displayText(member.email),
      '휴대폰': displayText(member.phone || member.phone_e164),
      '등급': displayText(member.member_tier),
      '상태': memberStatusLabel(member.status || 'pending'),
      '가입일': displayTime(member.created_at),
      '최근 접속': displayTime(member.last_login_at),
      'IP': displayText(member.last_login_ip),
      '본인확인': kycStatusLabel(member.kyc_status),
      '추천 수': String(Number(member.referral_count || 0)),
      '오늘 작업(사용/한도)': memberQuotaText(member.daily_task_quota),
      '지원금': money(wallet.support),
      '근무 잔액': money(wallet.work ?? wallet.task),
      '출금 가능': money(wallet.available),
      '보류액': money(wallet.held)
    };
    root.querySelectorAll('.detail-list > div').forEach((row) => {
      const key = row.querySelector('span')?.textContent;
      const strong = row.querySelector('strong');
      if (key && strong && Object.prototype.hasOwnProperty.call(fields, key)) strong.textContent = fields[key];
    });
    root.querySelectorAll('[data-member-id]').forEach((btn) => {
      btn.dataset.memberId = id;
    });
    root.setAttribute('data-stable', '1');
  }

  function overlayApi() {
    return window.PutdukOverlaySurface || null;
  }

  function syncChannelTalk() {
    if (isAdmin) return;
    const api = window.PutdukChannelTalk;
    if (!api || typeof api.sync !== 'function') return;
    api.sync({
      enabled: true,
      pluginKey: config.channelPluginKey,
      session: authState.session,
      profile: authState.profile,
      page: state.memberPage || 'dashboard',
      theme: state.theme,
      overlayKey: overlaySurfaceKey()
    });
  }

  function overlaySurfaceKey() {
    const api = overlayApi();
    if (api && typeof api.overlaySurfaceKey === 'function') return api.overlaySurfaceKey(state);
    if (state.player && state.run?.overlayOpen) return `run:${state.run.dbId || state.run.id || state.player.nodeId || 'active'}`;
    if (state.resultScene) return `result:${state.resultScene.nodeId || ''}:${state.resultScene.cut || 'next'}`;
    if (state.reviewWait?.overlayOpen) return `review:${state.reviewWait.dbId || state.reviewWait.id || 'wait'}`;
    if (state.startNodeId) return `start:${state.startNodeId}`;
    if (state.onboardingStep) return `onboard:${state.onboardingStep}`;
    if (state.modal) return `modal:${state.modal}`;
    return '';
  }

  function overlayBodyToken() {
    const api = overlayApi();
    if (api && typeof api.overlayBodyToken === 'function') {
      return api.overlayBodyToken(state, { nodeById, isCatalogWork, isInspectBundleComplete });
    }
    const key = overlaySurfaceKey();
    if (key.startsWith('run:')) {
      const node = nodeById(state.player?.nodeId || state.run?.nodeId);
      if (isCatalogWork(node)) return 'catalog';
      const bundle = state.player?.bundle;
      return `inspect:${Number(bundle?.current || 0)}:${Number(bundle?.total || 0)}:${isInspectBundleComplete(bundle) ? 1 : 0}`;
    }
    if (key === 'modal:auth') return String(state.authMode || 'signup');
    if (key === 'modal:deposit') {
      const list = Array.isArray(state.depositDestinations) ? state.depositDestinations : [];
      const revealed = isDepositRevealed() ? (Array.isArray(state.depositReveal) ? state.depositReveal.length : 1) : 0;
      return `${list.length}:${state.depositPinSet ? 1 : 0}:${revealed}:${state.depositDestinationsError ? 1 : 0}:${state.depositPresetAmount || ''}:${state.depositMethod || ''}`;
    }
    if (key.startsWith('review:')) return String(state.reviewWait?.status || '');
    if (key === 'modal:member-detail') return String(state.modalPayload?.id || state.adminMemberDetail?.id || '');
    if (key === 'modal:balance-adjust') {
      const preset = state.modalPayload || {};
      const phase = preset.confirmAmount != null ? 'confirm' : 'entry';
      return `${phase}:${preset.user_id || preset.id || ''}:${preset.amount ?? ''}:${preset.bucket || ''}:${preset.confirmAmount ?? ''}`;
    }
    if (key === 'modal:notifications') return notificationsOverlayBody();
    return key;
  }

  function overlayMarkup() {
    const key = overlaySurfaceKey();
    let html = '';
    if (key.startsWith('run:')) html = renderRunOverlay();
    else if (key.startsWith('result:')) html = renderResultOverlay();
    else if (key.startsWith('review:')) html = renderReviewWaitOverlay();
    else if (key.startsWith('start:')) html = renderStartConfirm();
    else if (key.startsWith('onboard:')) html = renderOnboarding();
    else html = renderModal();
    if (!html || !key) return html;
    const body = overlayBodyToken();
    const api = overlayApi();
    if (api && typeof api.stampOverlayMarkup === 'function') return api.stampOverlayMarkup(html, key, body, esc);
    return html.replace(/<div class="modal-backdrop([^"]*)"/, `<div class="modal-backdrop$1" data-surface="${esc(key)}" data-overlay-body="${esc(body)}"`);
  }

  function patchAppShell(app) {
    const box = document.createElement('div');
    box.innerHTML = renderAppShell();
    const nextShell = box.querySelector('.app-shell');
    const nextBar = box.querySelector('.member-tabbar');
    const oldShell = app.querySelector('.app-shell');
    const oldBar = app.querySelector('.member-tabbar');
    if (oldShell && nextShell) oldShell.replaceWith(nextShell);
    if (oldBar && nextBar) oldBar.replaceWith(nextBar);
    else if (!oldBar && nextBar) {
      const toast = app.querySelector('#toastStack');
      if (toast) app.insertBefore(nextBar, toast);
      else app.appendChild(nextBar);
    } else if (oldBar && !nextBar) oldBar.remove();
  }

  function patchLiveOverlay(root) {
    const html = overlayMarkup();
    if (!html) {
      root.remove();
      return;
    }
    const box = document.createElement('div');
    box.innerHTML = html;
    const next = box.firstElementChild;
    if (!next) return;
    const stageSel = '.player-stage, .cinematic-stage, .result-stage';
    const oldStage = root.querySelector(stageSel);
    const newStage = next.querySelector(stageSel);
    if (oldStage && newStage) newStage.replaceWith(oldStage);
    root.replaceChildren(...Array.from(next.childNodes));
    ['data-surface', 'data-overlay-body', 'data-modal'].forEach((name) => {
      const value = next.getAttribute(name);
      if (value) root.setAttribute(name, value);
      else if (name !== 'data-modal') root.removeAttribute(name);
    });
    root.setAttribute('data-stable', '1');
  }

  function releaseAllMotionCanvases() {
    ['motionCanvas', 'startMotionCanvas', 'resultMotionCanvas', 'onboardMotionCanvas', 'demoteMotionCanvas', 'depositJumpMotionCanvas']
      .forEach(releaseNamedCanvas);
  }

  function finishPaint({ replayMotion = false, rebindOverlayUi = false } = {}) {
    refreshIcons();
    if (!isAdmin) paintDailyQuota();
    if (isAdmin && window.PUTDUK_ADMIN && typeof window.PUTDUK_ADMIN.afterRender === 'function') window.PUTDUK_ADMIN.afterRender();
    const overlayOpen = Boolean(overlaySurfaceKey());
    if (!overlayOpen) {
      if (!isAdmin && state.memberPage === 'dashboard') drawMemberChart();
      if (isAdmin && state.adminPage === 'overview') drawAdminChart();
    }
    if (replayMotion) {
      if (state.run && state.run.overlayOpen && !state.player) {
        requestAnimationFrame(() => { drawMotionCanvas(); if (!runFrame) runFrame = requestAnimationFrame(tickRun); });
      }
      bindAuxMotion();
      if (state.player && state.run?.overlayOpen) drawMotionCanvas();
    }
    if (!isLiveWorkOverlay()) {
      if (replayMotion || rebindOverlayUi) {
        bindDepositJumpUi();
        bindKycFilePickers();
      }
      restoreDepositForm();
      paintDepositQr();
      paintNoticeBadge();
      syncChannelTalk();
    }
    if (state.toast) {
      const pendingToast = state.toast;
      state.toast = null;
      showToast(pendingToast.text, pendingToast.kind, true, pendingToast.action || null);
    }
  }

  function render() {
    document.documentElement.dataset.theme = state.theme;
    const app = document.getElementById('app');
    if (!app) return;
    if (authState.loading && !authState.session && app.querySelector('[data-boot-shell="1"]')) return;
    const existingType = app.querySelector('[data-modal]')?.getAttribute('data-modal');
    const nextKey = overlaySurfaceKey();
    const existing = app.querySelector('[data-surface]');
    const existingKey = existing?.getAttribute('data-surface') || '';
    const nextBody = overlayBodyToken();
    const api = overlayApi();
    const plan = api && typeof api.overlayPaintPlan === 'function'
      ? api.overlayPaintPlan({
          nextKey,
          existingKey,
          hasExisting: Boolean(existing),
          hasShell: Boolean(app.querySelector('.app-shell')),
          sameBody: (existing?.getAttribute('data-overlay-body') || '') === nextBody,
          memberDetailReuse: state.modal === 'member-detail' && existingType === 'member-detail',
          notificationsModalReuse: state.modal === 'notifications' && existingType === 'notifications'
        })
      : null;
    const action = plan?.action || '';
    if (action === 'patch-member-detail' || (!plan && state.modal === 'member-detail' && existingType === 'member-detail')) {
      patchAppShell(app);
      patchMemberDetailModal(state.modalPayload || state.adminMemberDetail);
      finishPaint({ replayMotion: false, rebindOverlayUi: false });
      return;
    }
    if (action === 'patch-notifications' || (!plan && state.modal === 'notifications' && existingType === 'notifications')) {
      patchAppShell(app);
      patchNotificationsModal();
      finishPaint({ replayMotion: false, rebindOverlayUi: false });
      return;
    }
    if (existing && (action === 'keep-overlay' || action === 'patch-overlay' || (!plan && nextKey && existingKey === nextKey))) {
      existing.setAttribute('data-stable', '1');
      if (action === 'patch-overlay' || (!plan && (existing.getAttribute('data-overlay-body') || '') !== nextBody)) patchLiveOverlay(existing);
      finishPaint({ replayMotion: false, rebindOverlayUi: action === 'patch-overlay' || (!plan && (existing.getAttribute('data-overlay-body') || '') !== nextBody) });
      return;
    }
    if (action === 'patch-shell' || (!plan && !nextKey && !existing && app.querySelector('.app-shell'))) {
      patchAppShell(app);
      finishPaint({ replayMotion: false, rebindOverlayUi: false });
      return;
    }
    if (plan?.releaseCanvases || (existingKey && existingKey !== nextKey)) releaseAllMotionCanvases();
    const toastStack = document.getElementById('toastStack');
    const keptToasts = toastStack ? Array.from(toastStack.children) : [];
    app.innerHTML = `${renderAppShell()}<div class="toast-stack" id="toastStack" aria-live="polite" aria-relevant="additions" role="status"></div>${overlayMarkup()}`;
    const nextStack = document.getElementById('toastStack');
    if (nextStack && keptToasts.length) keptToasts.forEach((node) => nextStack.appendChild(node));
    finishPaint({ replayMotion: true, rebindOverlayUi: true });
  }

  function weekEarnings() {
    const labels = [];
    const data = [];
    for (let i = 6; i >= 0; i--) {
      const day = new Date();
      day.setHours(0, 0, 0, 0);
      day.setDate(day.getDate() - i);
      labels.push(i === 0 ? '오늘' : `${day.getMonth() + 1}/${day.getDate()}`);
      const sum = state.history.reduce((total, item) => {
        if (rewardUiKind(item) !== 'posted' || !item.createdAt) return total;
        const created = new Date(item.createdAt);
        return created.toDateString() === day.toDateString() ? total + Number(item.reward || 0) : total;
      }, 0);
      data.push(sum);
    }
    return { labels, data };
  }

  function chartScriptSrc() {
    return isAdmin ? '../assets/vendor/chart.umd.min.js?v=20260918-perf1' : './assets/vendor/chart.umd.min.js?v=20260918-perf1';
  }

  function ensureChart() {
    if (window.Chart) return Promise.resolve(window.Chart);
    if (chartLoading) return chartLoading;
    chartLoading = new Promise((resolve, reject) => {
      const script = document.createElement('script');
      script.src = chartScriptSrc();
      script.onload = () => resolve(window.Chart);
      script.onerror = () => {
        chartLoading = null;
        reject(new Error('차트를 불러오지 못했어요.'));
      };
      document.head.appendChild(script);
    });
    return chartLoading;
  }

  function drawMemberChart() {
    const canvas = document.getElementById('earningsChart');
    if (!canvas) return;
    ensureChart().then((Chart) => {
      if (document.getElementById('earningsChart') !== canvas || !Chart) return;
      const week = weekEarnings();
      if (chartInstance && chartInstance.canvas === canvas && chartInstance.config?.type === 'line') {
        chartInstance.data.labels = week.labels;
        chartInstance.data.datasets[0].data = week.data;
        chartInstance.update('none');
        return;
      }
      if (chartInstance) chartInstance.destroy();
      chartInstance = new Chart(canvas, { type: 'line', data: { labels: week.labels, datasets: [{ data: week.data, borderColor: '#0d9f76', backgroundColor: 'rgba(13,159,118,.12)', fill: true, tension: .42, pointRadius: 3, pointBackgroundColor: '#0d9f76', pointBorderWidth: 0 }] }, options: { responsive: true, maintainAspectRatio: false, plugins: { legend: { display:false }, tooltip: { displayColors:false, callbacks:{ label:(ctx)=>` ${Number(ctx.parsed.y).toLocaleString('ko-KR')}원` } } }, scales:{ x:{ grid:{display:false}, ticks:{color:'#7d8c86',font:{size:11}} }, y:{ min:0, grid:{color:'rgba(120,140,130,.12)'}, ticks:{color:'#7d8c86',font:{size:10},callback:(value)=> Number.isInteger(Number(value)) ? formatChartTick(value) : '' } } } } });
    }).catch(() => {});
  }

  function drawAdminChart() {
    const canvas = document.getElementById('adminChart');
    if (!canvas) return;
    ensureChart().then((Chart) => {
      if (document.getElementById('adminChart') !== canvas || !Chart) return;
      const reviews = Array.isArray(state.adminReviews) ? state.adminReviews : [];
      const labels = ['09시','12시','15시','18시','21시','현재'];
      const done = labels.map(() => 0);
      const wait = labels.map(() => 0);
      reviews.forEach((item) => {
        const hour = new Date(item.updated_at || item.created_at || Date.now()).getHours();
        const bucket = hour < 12 ? 0 : hour < 15 ? 1 : hour < 18 ? 2 : hour < 21 ? 3 : hour < 23 ? 4 : 5;
        if (item.status === 'approved') done[bucket] += 1;
        if (['submitted', 'review_pending'].includes(item.status)) wait[bucket] += 1;
      });
      if (chartInstance && chartInstance.canvas === canvas && chartInstance.config?.type === 'bar') {
        chartInstance.data.datasets[0].data = done;
        chartInstance.data.datasets[1].data = wait;
        chartInstance.update('none');
        return;
      }
      if (chartInstance) chartInstance.destroy();
      chartInstance = new Chart(canvas, { type: 'bar', data: { labels, datasets:[{label:'검수 완료',data:done,backgroundColor:'rgba(13,159,118,.75)',borderRadius:8},{label:'검수 대기',data:wait,backgroundColor:'rgba(193,138,45,.72)',borderRadius:8}]}, options:{responsive:true,maintainAspectRatio:false,plugins:{legend:{position:'bottom',labels:{color:'#7d8c86',boxWidth:10,font:{size:11}}}},scales:{x:{grid:{display:false},ticks:{color:'#7d8c86'}},y:{grid:{color:'rgba(120,140,130,.12)'},ticks:{color:'#7d8c86'}}}}});
    }).catch(() => {});
  }

  function showToast(text, kind = 'info', fromRender = false, action = null) {
    const stack = document.getElementById('toastStack');
    if (!stack) return;
    const key = `${kind}:${text}`;
    const now = Date.now();
    if (toastRecent.has(key) && now - toastRecent.get(key) < 1600) return;
    toastRecent.set(key, now);
    if (!fromRender) state.toast = { text, kind };
    const toast = document.createElement('div');
    const tone = kind === 'success' ? 'success' : kind === 'error' ? 'error' : kind === 'warning' ? 'warning' : '';
    toast.className = `toast ${tone}`.trim();
    toast.setAttribute('role', kind === 'error' ? 'alert' : 'status');
    const iconName = kind === 'success' ? 'check-circle-2' : kind === 'error' ? 'circle-alert' : kind === 'warning' ? 'triangle-alert' : 'info';
    const color = kind === 'success' ? 'var(--emerald)' : kind === 'error' ? 'var(--danger)' : 'var(--gold)';
    const actionHtml = action?.label ? `<button type="button" class="toast-action" data-toast-action="${esc(action.id || '')}">${esc(action.label)}</button>` : '';
    toast.innerHTML = `<span style="color:${color}">${icon(iconName, 17)}</span><span>${esc(text)}</span>${actionHtml}`;
    toastTimers.forEach((timer) => window.clearTimeout(timer));
    toastTimers.clear();
    stack.replaceChildren(toast);
    refreshIcons();
    const timer = window.setTimeout(() => { toast.remove(); toastTimers.delete(timer); }, 4200);
    toastTimers.add(timer);
    if (!fromRender) { state.toast = null; saveState(); }
  }

  function taskApiErrorMessage(error) {
    const raw = String(error?.message || '');
    if (raw.includes('활성화')) return '계정 활성화 후 업무를 시작할 수 있어요.';
    if (raw.includes('공개 중인') || raw.includes('공개')) return '운영자가 공개한 업무가 아니거나 잠시 중지됐어요.';
    if (raw.includes('소진')) return '오늘 준비된 업무 수량이 모두 소진됐어요.';
    if (raw.includes('진행 중')) return '진행 중인 업무를 먼저 마무리해 주세요.';
    if (raw.includes('지원금')) return '체험 지원금이 없어요. 체험 카드로 출근해 주세요.';
    if (raw.includes('근무 잔액') || raw.includes('잠금 금액')) return '근무 잔액이 이 라인 잠금보다 부족해요. 입금 후 출근해 주세요.';
    if (raw.includes('한 번만')) return '체험 근무는 한 번만 할 수 있어요.';
    if (raw.includes('task_events') || raw.includes('23503')) return '출근 기록을 저장하지 못했어요. 잠시 후 다시 시도해 주세요.';
    return '업무를 시작하거나 제출하지 못했어요. 잠시 후 다시 시도해 주세요.';
  }

  async function startNode(nodeId) {
    if (state.reviewWait) {
      state.reviewWait.overlayOpen = true;
      render();
      showToast('⏳ 제출한 근무가 검수 중이에요. 새 출근은 검수가 끝난 뒤에 할 수 있어요.', 'info');
      return;
    }
    if (state.player && state.run) { state.run.overlayOpen = true; render(); return; }
    if (!authState.session) {
      openModal('auth');
      showToast('👋 로그인하면 오늘 라인에 출근할 수 있어요.', 'info');
      return;
    }
    const node = nodeById(nodeId);
    if (node && !canStartNode(node)) {
      state.withdrawIntent = 'allowance';
      openDepositModal();
      showToast(node.isTrial ? '🎁 체험은 지원금이 있는 카드로 출근해요.' : '💳 이 라인은 근무 잔액이 잠금보다 커야 출근할 수 있어요.', 'info');
      return;
    }
    state.startNodeId = nodeId;
    render();
  }

  function isLiveWorkOverlay() {
    return Boolean(state.player && state.run?.overlayOpen);
  }

  function workActionButtons() {
    return document.querySelectorAll('[data-action="confirm-start"], [data-action="submit-player"], .inspect-entry .primary-button, .catalog-entry .primary-button');
  }

  function setWorkActionBusy(busy, label) {
    workActionButtons().forEach((btn) => {
      if (!(btn instanceof HTMLButtonElement)) return;
      if (busy) {
        if (!btn.dataset.idleLabel) btn.dataset.idleLabel = btn.textContent || '';
        btn.disabled = true;
        if (label) btn.textContent = label;
        return;
      }
      btn.disabled = false;
      if (btn.dataset.idleLabel) btn.textContent = btn.dataset.idleLabel;
      delete btn.dataset.idleLabel;
    });
  }

  function submitWaitLabel(ms) {
    const sec = Math.max(1, Math.ceil(Number(ms || 0) / 1000));
    return sec > 1 ? `제출 준비 중… ${sec}초` : '제출하는 중…';
  }

  function clearSubmitWait(run) {
    if (!run) return;
    if (run._submitWaitTimer) {
      window.clearTimeout(run._submitWaitTimer);
      run._submitWaitTimer = null;
    }
    run._submitWaiting = false;
  }

  function scheduleSubmitRetry(node, run, remainMs) {
    const started = Date.now();
    const tick = () => {
      if (state.run !== run || run._submitted) return;
      const left = remainMs - (Date.now() - started);
      if (left <= 0) {
        run._submitWaiting = false;
        if (!run._submitting) finishRun(node);
        return;
      }
      setWorkActionBusy(true, submitWaitLabel(left));
      run._submitWaitTimer = window.setTimeout(tick, 400);
    };
    run._submitWaiting = true;
    setWorkActionBusy(true, submitWaitLabel(remainMs));
    run._submitWaitTimer = window.setTimeout(tick, 400);
  }

  async function refreshWorkSideState() {
    await refreshMemberWallet();
    await hydrateDailyTaskQuota();
    if (!isLiveWorkOverlay() && !state.startNodeId) render();
  }

  async function confirmStartWork() {
    const nodeId = state.startNodeId;
    if (!nodeId || state._startingWork) return;
    state._startingWork = true;
    setWorkActionBusy(true, '출근하는 중…');
    const node = nodeById(nodeId);
    const company = companyById(node.companyId);
    const photo = node.questionImage
      ? brandAssetSrc(node.questionImage, company.slug, 'photo')
      : (company.photoUrl || brandAssetSrc(company.photo_asset_path, company.slug, 'photo'));
    if (workEnabled() && authState.session && supabaseClient) {
      let data = null;
      let error = null;
      try {
        const started = await supabaseClient
          .from('task_runs')
          .insert({ node_id: nodeId, user_id: authState.session.user.id })
          .select('id,public_id,node_id,status,started_at,expected_completed_at,motion_variant,motion_seed,reward_amount')
          .single();
        data = started.data;
        error = started.error;
      } catch (startError) {
        error = startError;
      }
      if (error || !data) {
        state._startingWork = false;
        setWorkActionBusy(false);
        showToast(taskApiErrorMessage(error), 'info');
        return;
      }
      releaseNamedCanvas('startMotionCanvas');
      state.startNodeId = null;
      rememberCrewPartner(node.companyId);
      const startedAt = Date.parse(data.started_at || '') || Date.now();
      const expectedAt = Date.parse(data.expected_completed_at || '') || (startedAt + node.time * 1000);
      const duration = Math.max(1000, expectedAt - startedAt);
      state.run = {
        id: data.public_id,
        dbId: data.id,
        nodeId: data.node_id || nodeId,
        startedAt,
        expectedCompletedAt: expectedAt,
        duration,
        progress: 0.4,
        overlayOpen: true,
        logs: [`[서버] ${node.title} 출근을 승인했어요.`],
        serverBacked: true,
        rewardAmount: Number(data.reward_amount || 0),
        motionVariant: data.motion_variant || 'a',
        motionSeed: data.motion_seed || '',
        choice: null,
        _submitted: false
      };
      state.player = { nodeId: state.run.nodeId, choice: null, question: playerQuestion(node), photo, bundle: initBundleForNode(node, company, state.run), listing: {} };
      overlayDismissed = false;
      state._startingWork = false;
      saveState();
      render();
      runFrame = requestAnimationFrame(tickRun);
      void refreshWorkSideState();
      return;
    }

    releaseNamedCanvas('startMotionCanvas');
    state.startNodeId = null;
    rememberCrewPartner(node.companyId);
    state.run = {
      nodeId,
      startedAt: Date.now(),
      duration: 8000,
      progress: 0.4,
      overlayOpen: true,
      logs: ['[안내] 오늘 배정 물량 5건을 대조해요.'],
      serverBacked: false
    };
    state.player = { nodeId, choice: null, question: playerQuestion(node), photo, bundle: initBundleForNode(node, company, state.run), listing: {} };
    overlayDismissed = false;
    state._startingWork = false;
    saveState();
    render();
    runFrame = requestAnimationFrame(tickRun);
  }

  function openResultScene(node, extra = {}) {
    const stake = nodeStake(node);
    state.resultScene = {
      nodeId: node.id,
      nextStake: nextStakeSlot(stake),
      cut: extra.cut || null,
      principal: extra.principal ?? stake,
      stipend: extra.stipend ?? nodePay(node)
    };
    if (extra.cut) state._playedMotionCue = null;
  }

  async function submitPlayer() {
    const node = nodeById(state.player?.nodeId);
    if (state.run?._submitting || state.run?._submitWaiting) return;
    if (isCatalogWork(node)) {
      const listing = catalogFormValues();
      state.player.listing = listing;
      if (!gradeCatalogListing(inspectSeedKey(state.run, node), listing)) {
        showToast('🙂 상품명·가격·옵션·배송을 카드와 같게 적어 주세요.', 'info');
        return;
      }
    } else if (!isInspectBundleComplete(state.player?.bundle)) {
      showToast('🙂 오늘 배정 물량 5건을 모두 대조해 주세요.', 'info');
      return;
    }
    setWorkActionBusy(true, '제출하는 중…');
    if (state.run?.serverBacked && workEnabled() && authState.session) {
      await finishRun(node);
      if (!state.reviewWait) return;
      openResultScene(node, { cut: 'submit', principal: nodeStake(node), stipend: nodePay(node) });
      render();
      return;
    }
    state.player = null;
    state.run = null;
    releaseMotionCanvas();
    openResultScene(node, { cut: 'submit', principal: nodeStake(node), stipend: nodePay(node) });
    saveState();
    render();
    lockToast('work');
  }
  function tickRun() {
    if (!state.run) { runFrame = null; return; }
    if (state.player) {
      runFrame = null;
      return;
    }
    const now = Date.now();
    const elapsed = now - state.run.startedAt;
    state.run.progress = Math.min(1, elapsed / state.run.duration);
    const node = nodeById(state.run.nodeId);
    const scene = motionSceneCopy(node, state.run.progress);
    const checkpoint = Math.floor(state.run.progress * 10);
    if (state.run._checkpoint !== checkpoint) {
      state.run._checkpoint = checkpoint;
      state.run.logs = [...(state.run.logs || []), `[${String(Math.round(state.run.progress * 100)).padStart(3,' ')}%] ${scene.copy}`].slice(-8);
    }
    updateRunDom(scene);
    if (!document.hidden) drawMotionCanvas();
    if (state.run.progress >= 1) { finishRun(node); return; }
    runFrame = requestAnimationFrame(tickRun);
  }

  function updateRunDom(scene) {
    const percent = document.getElementById('motionPercent');
    const bar = document.getElementById('motionProgress');
    const label = document.getElementById('motionStageLabel');
    const copy = document.getElementById('motionStageCopy');
    const log = document.getElementById('motionLog');
    if (percent) percent.innerHTML = `${Math.round(state.run.progress * 100)}%<small>처리 진행률</small>`;
    if (bar) bar.style.width = `${state.run.progress * 100}%`;
    if (label && scene?.label) label.textContent = scene.label;
    if (copy && scene?.copy) copy.innerHTML = scene.icon ? `${icon(scene.icon, 14)} <span>${esc(scene.copy)}</span>` : esc(scene.copy);
    if (copy && scene?.icon) refreshIcons();
    if (log) log.innerHTML = (state.run.logs || []).slice(-5).map((item) => `<div>${esc(item)}</div>`).join('');
  }

  async function finishRun(node) {
    cancelAnimationFrame(runFrame); runFrame = null;
    const run = state.run;
    if (!run) return;

    if (run.serverBacked && authState.session && config.enableWorkApi === true) {
      if (run._submitting) return;
      if (run._submitWaiting) return;
      const catalog = isCatalogWork(node);
      const listing = catalog ? (document.getElementById('catalogProductName') ? catalogFormValues() : readCatalogListing(state.player?.listing)) : null;
      if (catalog) {
        if (!gradeCatalogListing(inspectSeedKey(run, node), listing)) {
          run.overlayOpen = true;
          saveState();
          render();
          setWorkActionBusy(false);
          showToast('🙂 상품명·가격·옵션·배송을 카드와 같게 적어 주세요.', 'info');
          return;
        }
        state.player.listing = listing;
      } else if (!isInspectBundleComplete(state.player?.bundle)) {
        run.overlayOpen = true;
        saveState();
        render();
        setWorkActionBusy(false);
        showToast('🙂 오늘 배정 물량 5건을 모두 대조해 주세요.', 'info');
        return;
      }
      const bundle = state.player.bundle;
      const choice = catalog ? 'a' : String(bundle.answers[bundle.total - 1] || state.player.choice || run.choice || '').trim();
      run._submitting = true;
      run.choice = choice;
      let data = null;
      try {
        const result = await memberFinanceRequest('submit_work', catalog
          ? {
            task_run_id: run.dbId,
            work_kind: 'catalog_listing',
            choice_id: 'a',
            choice_label: '상품 정보 4칸 입력 완료',
            listing
          }
          : {
            task_run_id: run.dbId,
            choice_id: choice,
            choice_label: '오늘 배정 물량 5건 정상 검수',
            inspect_answers: bundle.answers.slice(0, INSPECT_TOTAL)
          });
        data = result.run || result.task_run || null;
      } catch (error) {
        run._submitting = false;
        run.overlayOpen = true;
        const message = String(error?.message || '');
        if (message.includes('예상 처리 시간이')) {
          const waitMs = Math.max(800, (Number(run.expectedCompletedAt) || Date.now()) - Date.now() + 200);
          showToast('🙂 제출 준비만 조금 더 하면 바로 넣어요.', 'info');
          scheduleSubmitRetry(node, run, waitMs);
          return;
        }
        saveState();
        render();
        setWorkActionBusy(false);
        showToast(message.includes('대조') || message.includes('번호') || message.includes('골라') || message.includes('물량') || message.includes('상품') ? message : taskApiErrorMessage(error), 'info');
        return;
      }

      if (!data) {
        run._submitting = false;
        run.overlayOpen = true;
        saveState();
        render();
        setWorkActionBusy(false);
        showToast(taskApiErrorMessage(null), 'info');
        return;
      }

      const durationSeconds = Math.max(1, Math.round((Number(data.completed_at ? Date.parse(data.completed_at) : Date.now()) - run.startedAt) / 1000));
      state.history.unshift({
        id: data.public_id || run.id,
        dbId: run.dbId,
        nodeId: node.id,
        status: '검수 대기',
        statusRaw: data.status || 'submitted',
        runStatus: data.status || 'submitted',
        rewardStatus: data.reward_status || 'pending',
        reward: parseLedgerAmount(data.reward_amount || run.rewardAmount),
        date: '방금 전',
        submittedAt: data.completed_at || new Date().toISOString(),
        duration: `${durationSeconds}초`
      });
      state.notifications.unshift({ text: `${node.title} 제출 완료 · 검수 대기`, time: '방금 전', type: 'work' });
      state.reviewWait = {
        id: data.public_id || run.id,
        dbId: run.dbId,
        nodeId: node.id,
        status: data.status || 'submitted',
        rewardAmount: parseLedgerAmount(data.reward_amount || run.rewardAmount),
        rewardStatus: data.reward_status || 'pending',
        submittedAt: data.completed_at || new Date().toISOString(),
        overlayOpen: false
      };
      clearSubmitWait(run);
      state.run = null;
      state.player = null;
      saveState();
      releaseMotionCanvas();
      showToast('✅ 근무 제출이 완료됐어요. 운영 검수 후 수당이 확정돼요.', 'success');
      return;
    }

    state.run = null;
    saveState();
    releaseMotionCanvas();
    render();
    showToast('작업 제출 연결이 필요해 연출을 종료했어요. 잔액은 변경되지 않았습니다.', 'warning');
  }

  function bindAuxMotion() {
    if (isAdmin) return;
    flushMotionCue();
  }

  function playCueOnCanvas(canvas, token, run) {
    if (!canvas || typeof run !== 'function') return;
    if (state._playedMotionCue === token) return;
    state._playedMotionCue = token;
    state._motionCanvas = canvas;
    requestAnimationFrame(() => {
      if (!canvas.isConnected) return;
      run();
    });
  }

  function flushMotionCue() {
    const motion = window.PutdukMotion;
    if (!motion || typeof motion.playWorkPhase !== 'function') return;

    if (state.startNodeId && !state.player) {
      return;
    }

    if (state.modal === 'deposit-jump') {
      const canvas = document.getElementById('depositJumpMotionCanvas');
      const token = `lock-jump:${Number(state.depositJump?.amount || 0)}`;
      const amount = Number(state.depositJump?.amount || 0);
      const partner = companies[0] || { name: '퍼뜩', slug: 'putduk' };
      playCueOnCanvas(canvas, token, () => {
        motion.playWorkPhase(canvas, partner, 'lock', { principal: amount });
      });
      return;
    }

    if (state.resultScene) {
      return;
    }
  }

  function releaseNamedCanvas(id) {
    const canvas = document.getElementById(id);
    if (canvas && window.PutdukMotion && typeof window.PutdukMotion.release === 'function') {
      window.PutdukMotion.release(canvas);
    }
  }

  function releaseMotionCanvas() {
    releaseNamedCanvas('motionCanvas');
  }

  function drawMotionCanvas() {
    const canvas = document.getElementById('motionCanvas');
    if (!canvas || !state.run) return;
    const node = nodeById(state.run.nodeId) || {};
    if (window.PutdukMotion && typeof window.PutdukMotion.tick === 'function') {
      window.PutdukMotion.tick(canvas, {
        progress: state.run.progress,
        started_at: state.run.startedAt,
        expected_completed_at: state.run.expectedCompletedAt,
        motion_seed: state.run.motionSeed || node.motion_seed,
        company: node.company || node.brand_name || node.slug,
        slug: node.slug,
        name: node.company,
        title: node.title || node.title_ko,
        motion: node.motion,
        motion_profile: node.motion_profile,
        motion_version: node.motion_version,
        scene_theme: node.scene_theme,
        vehicle_type: node.vehicle_type,
        route_type: node.route_type,
        particle_style: node.particle_style,
        completion_effect: node.completion_effect,
        color: node.color
      });
      return;
    }
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    const rect = canvas.getBoundingClientRect();
    const reduced = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
    const dpr = Math.min(window.devicePixelRatio || 1, 1.5);
    const width = Math.max(1, Math.floor(rect.width * dpr));
    const height = Math.max(1, Math.floor(rect.height * dpr));
    if (canvas.width !== width || canvas.height !== height) { canvas.width = width; canvas.height = height; }
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    const w = rect.width;
    const h = rect.height;
    ctx.clearRect(0, 0, w, h);
    const progress = state.run.progress;
    const t = reduced ? 0.45 : progress;
    const profile = motionProfileOf(node);
    const accent = node.color || '#0d9f76';

    function drawPath(points, color) {
      if (points.length < 2) return;
      ctx.strokeStyle = color;
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(points[0].x, points[0].y);
      points.slice(1).forEach((point) => ctx.lineTo(point.x, point.y));
      ctx.stroke();
    }

    function drawMarker(x, y, color, size = 5) {
      ctx.beginPath();
      ctx.fillStyle = color;
      ctx.shadowBlur = 14;
      ctx.shadowColor = color;
      ctx.arc(x, y, size, 0, Math.PI * 2);
      ctx.fill();
      ctx.shadowBlur = 0;
    }

    if (profile.includes('ocean') || profile === 'ocean_vessel') {
      for (let i = 0; i < 6; i++) {
        const y = h * 0.42 + i * 18;
        ctx.strokeStyle = `rgba(120, 220, 230, ${0.08 + i * 0.03})`;
        ctx.beginPath();
        for (let x = 0; x <= w; x += 12) ctx.lineTo(x, y + Math.sin((x / 40) + t * 8 + i) * 6);
        ctx.stroke();
      }
      const shipX = w * (0.15 + t * 0.7);
      const shipY = h * 0.5 + Math.sin(t * 6) * 8;
      ctx.fillStyle = accent;
      ctx.beginPath();
      ctx.moveTo(shipX - 28, shipY);
      ctx.lineTo(shipX + 32, shipY - 4);
      ctx.lineTo(shipX + 20, shipY + 12);
      ctx.lineTo(shipX - 24, shipY + 12);
      ctx.closePath();
      ctx.fill();
      drawMarker(shipX + 36, shipY - 10, '#f3cd6b', 3);
      return;
    }

    if (profile.includes('air') || profile === 'air_cargo' || profile === 'document') {
      const path = [{ x: w * 0.08, y: h * 0.7 }, { x: w * 0.32, y: h * 0.38 }, { x: w * 0.58, y: h * 0.28 }, { x: w * 0.92, y: h * 0.42 }];
      drawPath(path, 'rgba(180, 170, 255, .35)');
      const seg = Math.min(path.length - 2, Math.floor(t * (path.length - 1)));
      const local = (t * (path.length - 1)) % 1;
      const a = path[seg];
      const b = path[seg + 1];
      const x = a.x + (b.x - a.x) * local;
      const y = a.y + (b.y - a.y) * local;
      ctx.save();
      ctx.translate(x, y);
      ctx.rotate(Math.atan2(b.y - a.y, b.x - a.x));
      ctx.fillStyle = accent;
      ctx.beginPath();
      ctx.moveTo(16, 0);
      ctx.lineTo(-12, -8);
      ctx.lineTo(-8, 0);
      ctx.lineTo(-12, 8);
      ctx.closePath();
      ctx.fill();
      ctx.restore();
      return;
    }

    if (profile.includes('catalog') || profile === 'commerce_catalog') {
      for (let i = 0; i < 5; i++) {
        const x = w * 0.18 + i * (w * 0.15);
        const y = h * 0.35 + Math.sin(t * 4 + i) * 10;
        ctx.fillStyle = i % 2 ? accent : 'rgba(255,255,255,.12)';
        ctx.fillRect(x, y, 54, 72);
        ctx.fillStyle = '#f3cd6b';
        ctx.fillRect(x + 8, y + 10, 38, 8);
      }
      return;
    }

    if (profile.includes('warehouse')) {
      for (let r = 0; r < 4; r++) {
        for (let c = 0; c < 8; c++) {
          const x = w * 0.12 + c * (w * 0.1);
          const y = h * 0.28 + r * 38;
          const lit = ((c + r + Math.floor(t * 12)) % 4) === 0;
          ctx.strokeStyle = lit ? accent : 'rgba(255,255,255,.16)';
          ctx.strokeRect(x, y, 28, 22);
        }
      }
      return;
    }

    const road = [{ x: w * 0.08, y: h * 0.72 }, { x: w * 0.28, y: h * 0.58 }, { x: w * 0.48, y: h * 0.62 }, { x: w * 0.7, y: h * 0.4 }, { x: w * 0.9, y: h * 0.32 }];
    drawPath(road, 'rgba(243, 205, 107, .35)');
    const seg = Math.min(road.length - 2, Math.floor(t * (road.length - 1)));
    const local = (t * (road.length - 1)) % 1;
    const a = road[seg];
    const b = road[seg + 1];
    const x = a.x + (b.x - a.x) * local;
    const y = a.y + (b.y - a.y) * local;
    ctx.save();
    ctx.translate(x, y);
    ctx.rotate(Math.atan2(b.y - a.y, b.x - a.x));
    ctx.fillStyle = accent;
    ctx.fillRect(-14, -7, 28, 14);
    ctx.fillStyle = '#f3cd6b';
    ctx.fillRect(8, -4, 8, 8);
    ctx.restore();
    drawMarker(road[road.length - 1].x, road[road.length - 1].y, '#80efc1', 4);
  }

  function restoreDepositForm() {
    const jump = state.depositJump;
    if (!jump || state.modal !== 'deposit') return;
    const amount = document.getElementById('depositAmount');
    const currency = document.getElementById('depositCurrency');
    const bank = document.getElementById('depositBank');
    const holder = document.getElementById('depositHolder');
    if (amount && jump.amount != null) amount.value = jump.amount;
    if (currency && jump.currency) currency.value = jump.currency;
    if (bank && jump.bank) bank.value = jump.bank;
    if (holder && jump.holder) holder.value = jump.holder;
  }

  function bindKycFilePickers() {
    document.querySelectorAll('.kyc-file-input').forEach((input) => {
      input.addEventListener('change', () => {
        const name = input.closest('.kyc-slot')?.querySelector('.kyc-file-name');
        if (!name) return;
        const file = input.files && input.files[0];
        name.textContent = file ? file.name : '아직 고르지 않았어요';
      });
    });
  }

  function bindDepositJumpUi() {
    const form = document.getElementById('depositJumpForm');
    if (!form) return;
    const repeat = document.getElementById('depositJumpRepeat');
    const slide = document.getElementById('depositJumpSlide');
    const submit = document.getElementById('depositJumpSubmit');
    const expected = String(Number(state.depositJump?.amount || 0));
    const sync = () => {
      const typed = String(repeat?.value || '').replace(/\D/g, '');
      const repeated = typed === expected && expected !== '0';
      const slid = Number(slide?.value || 0) >= 100;
      if (submit) submit.disabled = !(repeated || slid);
    };
    repeat?.addEventListener('input', sync);
    slide?.addEventListener('input', sync);
    sync();
  }

  function closeModal({ render: shouldRender = true } = {}) {
    releaseNamedCanvas('demoteMotionCanvas');
    releaseNamedCanvas('depositJumpMotionCanvas');
    if (state.modal === 'deposit' || state.modal === 'info') lockDepositReveal({ silent: true });
    if (state.modal !== 'deposit-jump') state.depositJump = null;
    state.depositPresetAmount = null;
    state.depositMethod = '';
    state.adminKycPreview = null;
    state.adminWithdrawalReveal = null;
    state.modal = null;
    state.modalPayload = null;
    if (!shouldRender) {
      state.depositJump = null;
      const app = document.getElementById('app');
      app?.querySelector('[data-surface], [data-modal]')?.remove();
      document.body?.classList.remove('modal-open', 'overlay-open');
      paintNoticeBadge();
      syncChannelTalk();
      return;
    }
    render();
  }

  window.__putdukCloseFinanceModal = () => closeModal({ render: false });

  let deferredInstallPrompt = null;

  function initializePwa() {
    if ('serviceWorker' in navigator) {
      const serviceWorkerPath = isAdmin ? '../sw.js' : './sw.js';
      navigator.serviceWorker.register(serviceWorkerPath).catch(() => {});
    }
    window.addEventListener('beforeinstallprompt', (event) => {
      event.preventDefault();
      deferredInstallPrompt = event;
    });
    window.addEventListener('appinstalled', () => {
      deferredInstallPrompt = null;
      state.onboardingPwaDone = true;
      if (state.onboardingStep === 'pwa') queueOnboarding();
      showToast('📲 사원증이 홈 화면에 생겼어요. 다음부터 바로 출근할 수 있어요.', 'success');
      if (authState.session) syncMemberPush(authState.session, { prompt: true });
      render();
    });
  }

  async function installApp() {
    if (deferredInstallPrompt) {
      const prompt = deferredInstallPrompt;
      deferredInstallPrompt = null;
      await prompt.prompt();
      const result = await prompt.userChoice;
      return;
    }
    const isIos = /iphone|ipad|ipod/i.test(navigator.userAgent);
    const isStandalone = window.navigator.standalone === true || window.matchMedia?.('(display-mode: standalone)').matches;
    if (isIos && !isStandalone) {
      showToast('📱 사파리 하단 공유 버튼 → “홈 화면에 추가”를 누르면 설치돼요.', 'info');
      return;
    }
    if (!isStandalone) showToast('📥 브라우저 메뉴에서 “앱 설치” 또는 “홈 화면에 추가”를 선택해 주세요.', 'info');
  }

  function applySignedOutState({ navigate = false, userId = null } = {}) {
    signedOutLock = true;
    const previousStorageKey = activeStorageKey;
    const previousUserId = userId || authState.session?.user?.id || null;
    if (kstResetTimer) { window.clearTimeout(kstResetTimer); kstResetTimer = null; }
    authState.session = null;
    authState.profile = null;
    authState.loading = false;
    authState.adminAuthorized = !isAdmin;
    authState.adminRoles = [];
    authState.adminLoading = false;
    companies = [];
    nodes = [];
    try {
      if (previousStorageKey) window.localStorage.removeItem(previousStorageKey);
      if (previousUserId) window.localStorage.removeItem(`${storageKey}:${previousUserId}`);
      for (let i = window.localStorage.length - 1; i >= 0; i -= 1) {
        const key = window.localStorage.key(i);
        if (key && key.startsWith(`${storageKey}:`)) window.localStorage.removeItem(key);
      }
    } catch (_) {}
    activeStorageKey = storageKey;
    state = freshState(false);
    saveState();
    document.body?.classList.remove('sidebar-open', 'modal-open', 'overlay-open');
    if (navigate && !isAdmin && window.location.pathname !== '/') window.history.replaceState(null, '', '/');
    const app = document.getElementById('app');
    if (app) {
      // 오버레이 keep/patch 경로가 로그인 칩을 남기지 않게 셸을 강제로 다시 그린다.
      releaseAllMotionCanvases();
      app.innerHTML = `${renderAppShell()}<div class="toast-stack" id="toastStack" aria-live="polite" aria-relevant="additions" role="status"></div>`;
      finishPaint({ replayMotion: false, rebindOverlayUi: false });
    } else {
      render();
    }
    window.scrollTo(0, 0);
  }

  async function signOut() {
    signedOutLock = true;
    const session = authState.session;
    const signedOutUserId = session?.user?.id || null;
    noticesHydrated = false;
    stopMemberLive();
    // 로그아웃 UI를 먼저 반영한다. 푸시/토큰 정리는 뒤에서 이어간다.
    applySignedOutState({ navigate: true, userId: signedOutUserId });
    try {
      await lockDepositReveal({ silent: true });
    } catch (_) {}
    if (!isAdmin && session && window.PUTDUK_PUSH?.unsubscribeWithSession) {
      try {
        await Promise.race([
          window.PUTDUK_PUSH.unsubscribeWithSession(session),
          new Promise((resolve) => window.setTimeout(resolve, 1500))
        ]);
      } catch (_) {}
    }
    if (supabaseClient) {
      try {
        await supabaseClient.auth.signOut({ scope: 'local' });
      } catch (_) {}
    }
    // 비동기 로그아웃 후에도 회원 전용 저장소가 남지 않도록 최종 정리한다.
    try {
      if (signedOutUserId) window.localStorage.removeItem(`${storageKey}:${signedOutUserId}`);
      for (let i = window.localStorage.length - 1; i >= 0; i -= 1) {
        const key = window.localStorage.key(i);
        if (key && key.startsWith(`${storageKey}:`)) window.localStorage.removeItem(key);
      }
    } catch (_) {}
  }

  async function checkpointWork() {
    if (!state.run?.dbId || !authState.session || config.enableWorkApi !== true) {
      saveState();
      showToast('💾 화면에는 남겼어요. 서버 저장은 로그인 후에 이어져요.', 'info');
      return;
    }
    const node = nodeById(state.player?.nodeId || state.run.nodeId);
    const listing = isCatalogWork(node) ? catalogFormValues() : null;
    if (listing) state.player.listing = listing;
    const payload = listing
      ? { kind: 'catalog_listing', listing, progress: 0.5 }
      : { kind: 'inspect', current: state.player?.bundle?.current || 0, answers: state.player?.bundle?.answers || [], progress: Math.min(0.9, (Number(state.player?.bundle?.current || 0) / INSPECT_TOTAL) || 0) };
    try {
      await memberFinanceRequest('checkpoint_work', { task_run_id: state.run.dbId, checkpoint: payload });
      if (state.run) state.run.status = 'checkpointed';
      saveState();
    } catch (error) {
      saveState();
      showToast(String(error?.message || '').includes('저장') ? error.message : '중간 저장을 하지 못했어요. 잠시 후 다시 눌러 주세요.', 'info');
    }
  }

  async function sendPasswordReset() {
    const email = document.getElementById('loginEmail')?.value.trim();
    if (!email || !email.includes('@')) { showToast('비밀번호를 받을 이메일을 먼저 입력해 주세요.', 'info'); return; }
    if (!supabaseClient) { showToast('인증 서버가 준비되지 않아 재설정 메일을 보낼 수 없어요.', 'info'); return; }
    const { error } = await supabaseClient.auth.resetPasswordForEmail(email, { redirectTo: window.location.href });
    if (error) {
      const raw = String(error.message || '');
      showToast(/rate limit|429/i.test(raw) ? '재설정 메일이 잠시 제한됐어요. 조금 뒤 다시 시도해 주세요.' : '재설정 메일을 보내지 못했어요. 이메일을 확인해 주세요.', 'info');
      return;
    }
    showToast('📨 입력한 이메일로 재설정 안내를 보냈어요.', 'success');
  }

  function confirmInspectChoice(chosen) {
    if (!state.player) return;
    const bundle = syncInspectBundle(state.player.bundle, nodeById(state.player.nodeId), state.run);
    state.player.bundle = bundle;
    if (isInspectBundleComplete(bundle)) {
      saveState();
      render();
      return;
    }
    const item = bundle.items[bundle.current];
    if (!item) return;
    if (chosen !== item.expectedChoice) {
      tapHaptic('bad');
      showToast('🔍 전표 번호와 실물 라벨이 같은지 다시 봐 주세요.', 'info');
      return;
    }
    if (!bundle.answers) bundle.answers = [];
    bundle.answers[bundle.current] = chosen;
    tapHaptic('ok');
    if (bundle.current < bundle.total - 1) {
      bundle.current += 1;
      state.player.choice = null;
      if (state.run) {
        state.run.choice = null;
        state.run.progress = bundle.current / bundle.total;
      }
    } else {
      bundle.current = bundle.total;
      state.player.choice = chosen;
      if (state.run) {
        state.run.choice = chosen;
        state.run.progress = 1;
      }
    }
    saveState();
    render();
  }

  function confirmInspectLabel() {
    if (!state.player) return;
    setWorkActionBusy(true, '확인하는 중…');
    const bundle = syncInspectBundle(state.player.bundle, nodeById(state.player.nodeId), state.run);
    state.player.bundle = bundle;
    if (isInspectBundleComplete(bundle)) {
      saveState();
      render();
      return;
    }
    const item = bundle.items[bundle.current];
    if (!item) {
      setWorkActionBusy(false);
      return;
    }
    const typed = normalizeTypedLabel(document.getElementById('inspectLabelInput')?.value || '');
    if (!typed) {
      setWorkActionBusy(false);
      showToast('🙂 실물에 적힌 라벨 번호를 입력해 주세요.', 'info');
      return;
    }
    if (typed !== normalizeTypedLabel(item.targetCode)) {
      setWorkActionBusy(false);
      tapHaptic('bad');
      showToast('🔍 실물 라벨 번호를 다시 확인해 주세요.', 'info');
      return;
    }
    confirmInspectChoice(item.expectedChoice);
  }

  async function submitSignup(event) {
    event.preventDefault();
    const form = event.target;
    if (!form.reportValidity()) return;
    const password = document.getElementById('signupPassword')?.value || '';
    const confirm = document.getElementById('signupPasswordConfirm')?.value || '';
    const birth = document.getElementById('signupBirth')?.value || '';
    const email = document.getElementById('signupEmail')?.value.trim().toLowerCase() || '';
    if (password !== confirm) { showToast('비밀번호가 서로 달라요. 다시 확인해 주세요.', 'info'); return; }
    if (!normalizeBirth(birth)) { showToast('생년월일 6자리를 숫자로 입력해 주세요.', 'info'); return; }
    const termsAccepted = Boolean(document.getElementById('signupTerms')?.checked);
    const privacyAccepted = Boolean(document.getElementById('signupPrivacy')?.checked);
    if (!termsAccepted || !privacyAccepted) {
      showToast('이용약관과 개인정보 수집·이용에 동의해 주세요.', 'info');
      return;
    }
    if (!supabaseClient) {
      closeModal();
      showToast('✅ 가입 정보가 접수됐어요. 이메일 인증을 완료하면 회원 카드가 활성화돼요.', 'success');
      return;
    }
    const metadata = {
      display_name: document.getElementById('signupName')?.value.trim(),
      legal_name: document.getElementById('signupName')?.value.trim(),
      birth_date: normalizeBirth(birth),
      phone_e164: normalizePhone(document.getElementById('signupPhone')?.value),
      referral_code: document.getElementById('signupReferral')?.value.trim().toUpperCase() || null,
      terms_accepted: termsAccepted,
      terms_version: '2026-09-19',
      privacy_accepted: privacyAccepted,
      privacy_version: '2026-09-19',
      marketing_opt_in: Boolean(document.getElementById('signupMarketing')?.checked)
    };
    const { data, error } = await supabaseClient.auth.signUp({ email, password, options: { data: metadata } });
    if (error) {
      const raw = String(error.message || '');
      if (/already registered|already been registered|User already registered|already exists/i.test(raw)) {
        showToast('📬 이 이메일로는 바로 가입되지 않았어요. 로그인하거나 비밀번호 재설정을 이용해 주세요.', 'info');
        return;
      }
      showToast(/rate limit|429/i.test(raw) ? '인증 안내 메일이 잠시 제한됐어요. 조금 뒤 다시 가입해 주세요.' : '가입을 완료하지 못했어요. 이메일 주소나 비밀번호를 확인해 주세요.', 'info');
      return;
    }
    const identities = Array.isArray(data?.user?.identities) ? data.user.identities : null;
    if (data?.user && identities && identities.length === 0) {
      showToast('📬 이 이메일로는 바로 가입되지 않았어요. 로그인하거나 비밀번호 재설정을 이용해 주세요.', 'info');
      return;
    }
    if (data.session) await hydrateSession(data.session);
    if (data.session && !isAdmin) queueOnboarding();
    state.modal = null;
    render();
    if (data.session) {
      } else if (data?.user && !data.user.email_confirmed_at) {
      showToast('📨 인증 메일을 보냈어요. 메일함에서 확인해야 가입이 끝나요.', 'success');
    } else {
      showToast('📨 가입 요청을 보냈어요. 이메일 인증이 끝나면 로그인해 주세요.', 'success');
    }
  }

  function loginErrorMessage(error) {
    const code = String(error?.code || '').toLowerCase();
    const message = String(error?.message || '').toLowerCase();
    const status = Number(error?.status || 0);
    if (code === 'email_not_confirmed' || message.includes('email not confirmed')) return '이메일 인증이 완료되지 않았어요. 받은 메일의 인증 링크를 확인해 주세요.';
    if (code === 'user_banned' || message.includes('banned')) return '이 계정은 현재 이용이 제한되어 있어요. 고객센터에 문의해 주세요.';
    if (code === 'over_request_rate_limit' || code === 'over_email_send_rate_limit' || status === 429) return '로그인 요청이 잠시 제한됐어요. 잠시 후 다시 시도해 주세요.';
    if (code === 'invalid_credentials') return '이메일 또는 비밀번호가 올바르지 않아요. 다시 확인하거나 비밀번호를 재설정해 주세요.';
    if (message.includes('fetch') || message.includes('network') || status >= 500) return '인증 서버에 연결하지 못했어요. 인터넷 연결을 확인한 뒤 다시 시도해 주세요.';
    return '로그인을 완료하지 못했어요. 잠시 후 다시 시도해 주세요.';
  }

  function setLoginFeedback(message) {
    const box = document.querySelector('[data-auth-feedback]');
    if (!box) return;
    box.textContent = String(message || '');
    box.hidden = !message;
  }

  function setLoginBusy(form, busy) {
    if (!(form instanceof HTMLFormElement)) return;
    form.dataset.putdukLoginBusy = busy ? '1' : '0';
    form.setAttribute('aria-busy', busy ? 'true' : 'false');
    const button = form.querySelector('button[type="submit"]');
    if (!(button instanceof HTMLButtonElement)) return;
    if (busy) {
      if (!button.dataset.putdukIdleLabel) button.dataset.putdukIdleLabel = button.textContent || '로그인';
      button.disabled = true;
      button.textContent = '로그인 중…';
    } else {
      button.disabled = false;
      button.textContent = button.dataset.putdukIdleLabel || '로그인';
    }
  }

  function showLoginTransitionOverlay(show) {
    let overlay = document.getElementById('putdukLoginTransition');
    if (!show) {
      overlay?.remove();
      return;
    }
    if (overlay) return;
    overlay = document.createElement('div');
    overlay.id = 'putdukLoginTransition';
    overlay.setAttribute('role', 'status');
    overlay.setAttribute('aria-live', 'polite');
    overlay.setAttribute('aria-label', '로그인 정보를 불러오고 있어요');
    overlay.innerHTML = '<div class="auth-boot"><img src="./icons/putduk-premium.png" alt="" width="46" height="46" /><strong>로그인 완료</strong><span>내 업무와 지갑을 안전하게 불러오고 있어요.</span></div>';
    document.body.appendChild(overlay);
  }

  async function submitLogin(event) {
    event.preventDefault();
    const form = event.target;
    if (!form.reportValidity()) return;
    if (form.dataset.putdukLoginBusy === '1') return;
    if (!supabaseClient) { showToast('인증 서버가 준비되지 않아 로그인할 수 없어요.', 'info'); return; }
    const email = document.getElementById('loginEmail')?.value.trim().toLowerCase() || '';
    const password = document.getElementById('loginPassword')?.value || '';
    setLoginBusy(form, true);
    setLoginFeedback('');
    let data;
    try {
      const result = await supabaseClient.auth.signInWithPassword({ email, password });
      if (result.error) {
        setLoginBusy(form, false);
        const message = loginErrorMessage(result.error); setLoginFeedback(message); showToast(message, 'error'); return;
      }
      data = result.data;
      if (!data?.session) {
        setLoginBusy(form, false);
        showToast('로그인 세션을 만들지 못했어요. 이메일 인증 상태를 확인해 주세요.', 'info'); return;
      }
      signedOutLock = false;
      // 모달을 먼저 닫아 클릭 대비 체감 딜레이를 없앤다. 세션 하이드레이션 동안 중립 오버레이가 빈 화면을 막는다.
      state.modal = null;
      state.modalPayload = null;
      showLoginTransitionOverlay(true);
      render();
      void hydrateSession(data.session).finally(() => {
        showLoginTransitionOverlay(false);
        queueOnboarding();
        render();
        settleMobileViewportAfterAuth();
      });
      syncMemberPush(data.session, { prompt: true });
    } catch (error) {
      setLoginBusy(form, false);
      const message = loginErrorMessage(error); setLoginFeedback(message); showToast(message, 'error');
      return;
    }
    if (isAdmin) {
      await runAdminAuthorization({ toast: true });
      return;
    }
  }

  function handleClick(event) {
    const target = event.target.closest('button, [data-nav], [data-start-node], [data-company-action], [data-toggle-node], [data-review-action], [data-brand-action], [data-catalog-node-action], [data-member-filter], [data-finance-action], [data-notification], [data-notice-id], [data-notice-delete], [data-toast-action], [data-action]');
    if (!target) return;
    if (isAdmin && window.PUTDUK_ADMIN && typeof window.PUTDUK_ADMIN.handleClick === 'function' && window.PUTDUK_ADMIN.handleClick(event, target)) return;
    if (target.dataset.authMode) { state.authMode = target.dataset.authMode; render(); return; }
    if (target.dataset.nav) {
      if (isAdmin) {
        state.adminPage = target.dataset.nav;
        state.adminKycPreview = null;
        state.adminWithdrawalReveal = null;
      } else state.memberPage = target.dataset.nav;
      document.getElementById('sidebar')?.classList.remove('open'); document.getElementById('sidebarBackdrop')?.classList.remove('open');
      state.modal = null; state.modalPayload = null; saveState(); render();
      if (isAdmin && authState.adminAuthorized) refreshAdminPageData({ silent: false });
      return;
    }
    if (target.dataset.startNode) { startNode(target.dataset.startNode); return; }
    if (target.dataset.brandAction && target.dataset.brandId) { updateAdminBrand(target.dataset.brandId, target.dataset.brandAction); return; }
    if (target.dataset.catalogNodeAction && target.dataset.nodeId) { updateAdminNodeStatus(target.dataset.nodeId, target.dataset.catalogNodeAction); return; }
    if (target.dataset.companyAction) { updateAdminBrand(target.dataset.companyAction, 'approve'); return; }
    if (target.dataset.reviewAction && target.dataset.reviewId) { submitReviewDecision(target.dataset.reviewId, target.dataset.reviewAction); return; }
    if (target.dataset.memberFilter) {
      state.adminMemberFilter = target.dataset.memberFilter;
      loadAdminMembers({ silent: false });
      return;
    }
    if (target.dataset.financeAction && target.dataset.financeId) {
      submitFinanceDecision(target.dataset.financeAction, target.dataset.financeId, target.dataset.financeDecision);
      return;
    }
    if (target.dataset.helpTab) {
      state.helpTab = target.dataset.helpTab;
      saveState();
      render();
      return;
    }
    if (target.dataset.financeTab) {
      state.adminFinanceTab = target.dataset.financeTab;
      state.adminKycPreview = null;
      state.adminWithdrawalReveal = null;
      saveState();
      render();
      return;
    }
    if (target.dataset.depositMethod !== undefined) {
      state.depositMethod = target.dataset.depositMethod || '';
      saveState();
      render();
      paintDepositQr();
      return;
    }
    if (target.dataset.ledgerTab) {
      state.walletLedgerTab = target.dataset.ledgerTab;
      saveState();
      const panel = document.querySelector('#app .record-panel');
      const walletVisible = Boolean(document.querySelector('#app .withdraw-actions'));
      if (panel && walletVisible) {
        const allRows = walletRows();
        const rows = visibleWalletRows();
        document.querySelectorAll('[data-ledger-tab]').forEach((button) => {
          const active = button.dataset.ledgerTab === state.walletLedgerTab;
          button.classList.toggle('active', active);
          button.setAttribute('aria-selected', active ? 'true' : 'false');
        });
        panel.innerHTML = renderWalletLedgerBody(allRows, rows);
        return;
      }
      render();
      return;
    }
    if (target.dataset.choice && state.player) {
      confirmInspectChoice(target.dataset.choice);
      return;
    }
    if (target.dataset.toastAction === 'open-notices') {
      openMemberNotices();
      return;
    }
    if (target.dataset.noticeDelete) {
      event.preventDefault();
      event.stopPropagation();
      void deleteNotification(target.dataset.noticeDelete);
      return;
    }
    if (target.dataset.noticeId) {
      openNoticeItem(target.dataset.noticeId);
      return;
    }
    if (target.dataset.notification !== undefined) { openMemberNotices(); return; }
    if (target.dataset.menu === 'open') {
      if (!isAdmin) return;
      document.getElementById('sidebar')?.classList.add('open');
      document.getElementById('sidebarBackdrop')?.classList.add('open');
      return;
    }
    if (target.dataset.themeToggle !== undefined || target.closest('[data-theme-toggle]')) { state.theme = state.theme === 'dark' ? 'light' : 'dark'; saveState(); render(); return; }
    const action = target.dataset.action;
    if (!action && target.form && target.type === 'submit') {
      event.preventDefault();
      target.form.requestSubmit();
      return;
    }
    if (action === 'open-signup') { state.authMode = 'signup'; openModal('auth'); return; }
    if (action === 'open-login') { state.authMode = 'login'; openModal('auth'); return; }
    if (action === 'logout') { signOut(); return; }
    if (action === 'open-channel-talk') {
      const api = window.PutdukChannelTalk;
      if (api && typeof api.openMessenger === 'function') api.openMessenger();
      return;
    }
    if (action === 'lock-deposit-info') { lockDepositReveal({ silent: false }); showToast('🔒 입금 안내를 다시 잠갔어요.', 'info'); return; }
    if (action === 'install-app') { installApp(); return; }
    if (action === 'mark-notices-read') {
      void markAllNoticesRead();
      return;
    }
    if (action === 'close-modal') {
      if (['balance-adjust', 'member-tier', 'member-block', 'member-reset'].includes(state.modal) && state.adminMemberDetail) {
        openModal('member-detail', state.adminMemberDetail);
        return;
      }
      if ((state.modal === 'assign-task' || state.modal === 'notice-form') && state.adminMemberDetail && (state.modalPayload?.id || state.modalPayload?.user_id)) {
        openModal('member-detail', state.adminMemberDetail);
        return;
      }
      if (!isAdmin && (state.modal === 'terms' || state.modal === 'privacy')) {
        if (!state.authMode) state.authMode = 'signup';
        openModal('auth');
        return;
      }
      if (!isAdmin && state.modal === 'deposit-jump') {
        releaseNamedCanvas('depositJumpMotionCanvas');
        openDepositModal();
        return;
      }
      closeModal();
      return;
    }
    if (action === 'back-deposit') {
      releaseNamedCanvas('depositJumpMotionCanvas');
      openDepositModal();
      return;
    }
    if (action === 'open-terms') { openModal('terms'); return; }
    if (action === 'open-privacy') { openModal('privacy'); return; }
    if (action === 'forgot-password') { sendPasswordReset(); return; }
    if (action === 'deposit-info') { openDepositModal(); return; }
    if (action === 'withdraw-info') { state.withdrawIntent = 'allowance'; openModal('withdraw'); return; }
    if (action === 'withdraw-allowance') { state.withdrawIntent = 'allowance'; openModal('withdraw'); return; }
    if (action === 'withdraw-principal') { state._playedMotionCue = null; openModal('withdraw-principal'); return; }
    if (action === 'confirm-principal') { state.withdrawIntent = 'principal'; openModal('withdraw'); return; }
    if (action === 'flip-idcard') { state.idCardFlipped = !state.idCardFlipped; render(); return; }
    if (action === 'close-start') { releaseNamedCanvas('startMotionCanvas'); state.startNodeId = null; state._playedMotionCue = null; render(); return; }
    if (action === 'confirm-start') { confirmStartWork(); return; }
    if (action === 'submit-player') { submitPlayer(); return; }
    if (action === 'checkpoint-work') { checkpointWork(); return; }
    if (action === 'deposit-shortcut') {
      const needed = Number(target.dataset.amount || 0);
      state.depositPresetAmount = needed > 0 ? needed : null;
      state.depositJump = null;
      if (state.resultScene) {
        releaseNamedCanvas('resultMotionCanvas');
        state.resultScene = null;
      }
      openDepositModal();
      return;
    }
    if (action === 'close-result') {
      const resultNode = nodeById(state.resultScene?.nodeId);
      const approvedTrial = state.resultScene?.cut === 'approve' && resultNode?.isTrial;
      releaseNamedCanvas('resultMotionCanvas');
      state.resultScene = null;
      if (state.reviewWait) state.reviewWait.overlayOpen = false;
      if (approvedTrial) {
        state.onboardingExperienceStarted = true;
        state.onboardingStep = 'general-work';
        saveState();
      }
      render();
      return;
    }
    if (action === 'start-first-work') {
      const trial = memberCatalogNodes().find((node) => node.isTrial && canAttendNode(node));
      if (!trial) { showToast('첫 업무를 준비하고 있어요. 잠시 후 다시 확인해 주세요.', 'info'); return; }
      state.onboardingExperienceStarted = true;
      state.onboardingStep = null;
      saveState();
      startNode(trial.id);
      return;
    }
    if (action === 'ack-general-work') {
      state.onboardingGeneralSeen = true;
      state.onboardingGrantSeen = true;
      state.onboardingStep = null;
      state.memberPage = 'nodes';
      saveState();
      render();
      return;
    }
    if (action === 'ack-grant') { state.onboardingGrantSeen = true; state.onboardingStep = null; saveState(); render(); return; }
    if (action === 'open-kyc') { openModal('kyc'); return; }
    if (action === 'open-run') { if (state.run) { overlayDismissed = false; state.run.overlayOpen = true; render(); } return; }
    if (action === 'open-review-wait') {
      if (state.reviewWait) { state.reviewWait.overlayOpen = true; render(); }
      return;
    }
    if (action === 'close-run') {
      if (state.run) { overlayDismissed = true; state.run.overlayOpen = false; saveState(); render(); }
      return;
    }
    if (action === 'close-review-wait') {
      if (state.reviewWait) { rememberReviewWaitDismissed(state.reviewWait); state.reviewWait.overlayOpen = false; saveState(); render(); }
      return;
    }
    if (action === 'copy-referral') {
      const code = referralCode();
      void (async () => {
        try {
          if (navigator.clipboard?.writeText) await navigator.clipboard.writeText(code);
          else copyTextFallback(code);
          showToast('추천 코드를 복사했어요.', 'success');
        } catch (_) {
          showToast('추천 코드를 복사하지 못했어요. 코드를 길게 눌러 복사해 주세요.', 'warning');
        }
      })();
      return;
    }
    if (action === 'email-check') {
      const email = document.getElementById('signupEmail')?.value.trim() || '';
      showToast(email && email.includes('@') ? '형식은 괜찮아요. 이미 있는 이메일은 가입 버튼을 눌렀을 때 안내돼요.' : '이메일 주소를 올바르게 입력해 주세요.', 'info');
      return;
    }
    if (action === 'faq') { showToast('업무가 진행 중인 경우 서버 기록을 기준으로 이어집니다.', 'info'); return; }
    if (action === 'member-detail') { openMemberDetail(target.dataset.memberId); return; }
    if (action === 'member-credit' || action === 'member-debit') {
      const memberId = target.dataset.memberId || '';
      const cached = state.adminMembers.find((item) => String(item.id) === String(memberId) || String(item.user_id) === String(memberId)) || state.adminMemberDetail || {};
      openModal('balance-adjust', { ...cached, id: memberId, user_id: memberId, direction: action === 'member-debit' ? 'debit' : 'credit', confirmAmount: null });
      return;
    }
    if (action === 'back-balance-adjust') {
      openModal('balance-adjust', { ...(state.modalPayload || {}), confirmAmount: null });
      return;
    }
    if (action === 'refresh-reviews') { loadAdminReviews({ silent: false }); return; }
    if (action === 'refresh-catalog') { loadAdminCatalog({ silent: false }); return; }
    if (action === 'refresh-members') { loadAdminMembers({ silent: false }); return; }
    if (action === 'refresh-finance') { loadAdminFinance({ silent: false }); return; }
    if (action === 'create-operator-deposit') { createOperatorDepositRequest(); return; }
    if (action === 'create-review-run') { createAdminReviewRun(); return; }
    if (action === 'add-company') { openModal('company-form', null); return; }
    if (action === 'edit-company') {
      const brand = adminBrandViews().find((item) => item.id === target.dataset.brandId);
      openModal('company-form', brand || { id: target.dataset.brandId });
      return;
    }
    if (action === 'add-node') { openModal('node-form', null); return; }
    if (action === 'edit-node') {
      const node = adminNodeViews().find((item) => item.id === target.dataset.nodeId);
      openModal('node-form', node || { id: target.dataset.nodeId });
      return;
    }
    if (action === 'assign-task') { openModal('assign-task', { id: target.dataset.memberId || '' }); return; }
    if (action === 'target-notice') { openModal('notice-form', { id: target.dataset.memberId || '' }); return; }
    if (action === 'new-notice') { openModal('broadcast-notice', null); return; }
    if (action === 'member-block') {
      const member = state.adminMemberDetail || {};
      openModal('member-block', {
        ...member,
        id: target.dataset.memberId || member.id || member.user_id,
        user_id: target.dataset.memberId || member.id || member.user_id,
        nextStatus: target.dataset.memberStatus || 'blocked'
      });
      return;
    }
    if (action === 'member-tier') {
      const member = state.adminMemberDetail || {};
      openModal('member-tier', {
        ...member,
        id: target.dataset.memberId || member.id || member.user_id,
        user_id: target.dataset.memberId || member.id || member.user_id
      });
      return;
    }
    if (action === 'member-reset') {
      const member = state.adminMemberDetail || {};
      openModal('member-reset', {
        ...member,
        id: target.dataset.memberId || member.id || member.user_id,
        user_id: target.dataset.memberId || member.id || member.user_id
      });
      return;
    }
    if (action === 'confirm-reset') {
      submitMemberReset(target.dataset.memberId);
      return;
    }
    if (action === 'save-settings') { saveAdminSettings(); return; }
  }

  let adminMemberFetchId = 0;
  async function openMemberDetail(memberId) {
    const fetchId = ++adminMemberFetchId;
    const alreadyOpen = state.modal === 'member-detail'
      && document.querySelector('[data-modal="member-detail"]')
      && String(state.adminMemberDetail?.id || state.adminMemberDetail?.user_id) === String(memberId);
    const cached = state.adminMembers.find((item) => String(item.id) === String(memberId) || String(item.user_id) === String(memberId));
    const initial = mergeMember(cached || state.adminMemberDetail || {}, { id: memberId, user_id: memberId });
    state.adminMemberDetail = initial;
    state.modal = 'member-detail';
    state.modalPayload = initial;
    if (!alreadyOpen) render();
    else patchMemberDetailModal(initial);
    try {
      const result = await adminRequest('get_member', { user_id: memberId });
      if (fetchId !== adminMemberFetchId || state.modal !== 'member-detail') return;
      const member = mergeMember(state.adminMemberDetail, flattenMemberDetail(result.member || result));
      state.adminMemberDetail = member;
      state.modalPayload = member;
      if (document.querySelector('[data-modal="member-detail"]')) patchMemberDetailModal(member);
      else render();
    } catch (error) {
      if (fetchId !== adminMemberFetchId) return;
      if (!cached) showToast(friendlyAdminError(error), isUnsupportedAction(error) ? 'warning' : 'error');
    }
  }

  async function submitBalanceAdjustForm(event) {
    event.preventDefault();
    const values = formValues(event.target);
    const direction = values.direction === 'debit' ? 'debit' : 'credit';
    const amount = Number(values.amount);
    if (!Number.isFinite(amount) || amount <= 0) {
      showToast('금액을 확인해 주세요.', 'warning');
      return;
    }
    const phase = event.target.dataset.phase === 'confirm' ? 'confirm' : 'entry';
    const bucket = ['support_grant', 'work_balance', 'available'].includes(values.bucket) ? values.bucket : 'available';
    if (!values.user_id) {
      showToast('회원 정보를 다시 열어 주세요.', 'warning');
      return;
    }
    if (phase === 'entry') {
      openModal('balance-adjust', {
        id: values.user_id,
        user_id: values.user_id,
        direction,
        amount,
        currency: values.currency || 'KRW',
        reason: values.reason,
        bucket,
        confirmAmount: amount
      });
      return;
    }
    try {
      const form = event.target;
      if (form && !form.dataset.operationId) form.dataset.operationId = crypto.randomUUID();
      await adminRequest('adjust_balance', {
        user_id: values.user_id,
        direction,
        amount,
        currency: values.currency || 'KRW',
        reason: values.reason,
        bucket,
        operation_id: form?.dataset?.operationId
      });
      await loadAdminMembers({ silent: true });
      if (values.user_id) {
        const result = await adminRequest('get_member', { user_id: values.user_id });
        const member = mergeMember(state.adminMemberDetail, flattenMemberDetail(result.member || result));
        state.adminMemberDetail = member;
        openModal('member-detail', member);
      } else {
        closeModal();
      }
      showToast(direction === 'credit' ? '잔액 입금을 서버에 반영했어요.' : '잔액 차감을 서버에 반영했어요.', 'success');
    } catch (error) {
      showToast(friendlyAdminError(error), isUnsupportedAction(error) ? 'warning' : 'error');
    }
  }

  async function refreshMemberAfterAction(userId) {
    await loadAdminMembers({ silent: true });
    if (!userId) return;
    const result = await adminRequest('get_member', { user_id: userId });
    const member = mergeMember(state.adminMemberDetail, flattenMemberDetail(result.member || result));
    state.adminMemberDetail = member;
    state.modal = 'member-detail';
    state.modalPayload = member;
    render();
  }

  async function submitMemberTierForm(event) {
    event.preventDefault();
    const values = formValues(event.target);
    if (!values.member_tier) {
      showToast('등급을 선택해 주세요.', 'warning');
      return;
    }
    try {
      await adminRequest('change_member_tier', {
        user_id: values.user_id,
        member_tier: values.member_tier,
        reason: values.reason || null
      });
      await refreshMemberAfterAction(values.user_id);
      showToast('회원 등급을 저장했어요.', 'success');
    } catch (error) {
      showToast(friendlyAdminError(error), isUnsupportedAction(error) ? 'warning' : 'error');
    }
  }

  async function submitMemberBlockForm(event) {
    event.preventDefault();
    const values = formValues(event.target);
    const blocked = values.next_status === 'blocked';
    if (blocked && !String(values.reason || '').trim()) {
      showToast('차단 사유를 입력해 주세요.', 'warning');
      return;
    }
    try {
      await adminRequest(blocked ? 'block_member' : 'unblock_member', {
        user_id: values.user_id,
        reason: String(values.reason || '').trim() || null
      });
      await refreshMemberAfterAction(values.user_id);
      showToast(blocked ? '회원을 차단했어요.' : '차단을 해제했어요.', 'success');
    } catch (error) {
      showToast(friendlyAdminError(error), isUnsupportedAction(error) ? 'warning' : 'error');
    }
  }

  async function submitMemberReset(memberId) {
    if (!memberId) {
      showToast('회원 정보를 확인하지 못했어요.', 'warning');
      return;
    }
    try {
      const result = await adminRequest('reset_member_password', { user_id: memberId });
      await refreshMemberAfterAction(memberId);
      showToast(
        result.sent
          ? '비밀번호 재설정 안내를 보냈어요. 로그인 비밀번호는 그대로입니다.'
          : '재설정 요청을 처리했어요. 메일 발송이 제한된 계정은 안내가 가지 않을 수 있어요.',
        result.sent ? 'success' : 'warning'
      );
    } catch (error) {
      showToast(friendlyAdminError(error), isUnsupportedAction(error) ? 'warning' : 'error');
    }
  }

  async function submitMemberAction(actionName, payload) {
    try {
      await adminRequest(actionName, payload);
      await loadAdminMembers({ silent: true });
      if (payload.user_id) {
        const result = await adminRequest('get_member', { user_id: payload.user_id });
        const member = mergeMember(state.adminMemberDetail, flattenMemberDetail(result.member || result));
        state.adminMemberDetail = member;
        if (state.modal === 'member-detail') state.modalPayload = member;
      }
      if (state.modal) render();
      showToast('회원 상태를 저장했어요.', 'success');
    } catch (error) {
      showToast(friendlyAdminError(error), isUnsupportedAction(error) ? 'warning' : 'error');
    }
  }

  async function createOperatorDepositRequest() {
    const member = state.adminMembers[0] || state.adminMemberDetail;
    const userId = member?.id || member?.user_id;
    if (!userId) {
      await loadAdminMembers({ silent: true });
    }
    const target = state.adminMembers[0] || state.adminMemberDetail;
    const memberId = target?.id || target?.user_id;
    if (!memberId) {
      showToast('입금을 만들 회원이 없어요.', 'warning');
      return;
    }
    try {
      await adminRequest('create_operator_deposit', {
        user_id: memberId,
        amount: 1000,
        currency: 'KRW',
        note: '운영 검증용 처리 대기 입금'
      });
      await loadAdminFinance({ silent: false });
      showToast('처리 대기 입금 1,000원을 만들었어요.', 'success');
    } catch (error) {
      showToast(friendlyAdminError(error), isUnsupportedAction(error) ? 'warning' : 'error');
    }
  }

  async function createAdminReviewRun() {
    const nodes = adminNodeViews();
    const node = nodes[0];
    if (!node?.id) {
      showToast('먼저 업무 카드를 등록해 주세요.', 'warning');
      return;
    }
    if (!state.adminMembers.length) await loadAdminMembers({ silent: true });
    const member = state.adminMembers[0] || state.adminMemberDetail;
    const memberId = member?.id || member?.user_id;
    if (!memberId) {
      showToast('검수 대상을 만들 회원이 없어요.', 'warning');
      return;
    }
    try {
      await adminRequest('create_review_run', {
        user_id: memberId,
        node_id: node.id,
        reward_amount: Number(node.work_spec?.stipend ?? node.rewardMax ?? node.rewardMin ?? 0),
        reason: '운영 검증용 검수 대상'
      });
      await loadAdminReviews({ silent: false });
      showToast('검수 대기 업무를 만들었어요.', 'success');
    } catch (error) {
      showToast(friendlyAdminError(error), isUnsupportedAction(error) ? 'warning' : 'error');
    }
  }

  async function submitFinanceDecision(actionName, id, decision) {
    if (!window.confirm(decision === 'approved' ? '승인할까요? 원장과 회원 화면에 바로 반영됩니다.' : '반려할까요?')) return;
    const reason = decision === 'rejected' ? (window.prompt('반려 사유를 입력해 주세요.') || '') : null;
    try {
      await adminRequest(actionName, { request_id: id, deposit_id: id, withdrawal_id: id, document_id: id, relation_id: id, user_id: id, decision, reason });
      await loadAdminFinance({ silent: true });
      render();
      showToast(decision === 'approved' ? '처리 결과를 저장했어요.' : '반려 사유를 회원에게 안내했어요.', 'success');
    } catch (error) {
      showToast(friendlyAdminError(error), isUnsupportedAction(error) ? 'warning' : 'error');
    }
  }

  async function saveAdminSettings() {
    const amount = Number(document.getElementById('supportGrantInput')?.value || 0);
    const payload = {
      campaign_id: state.adminCampaigns[0]?.id,
      amount,
      trigger_type: document.getElementById('supportTriggerInput')?.value,
      usage_scope: document.getElementById('supportScopeInput')?.value,
      expires_in_days: Number(document.getElementById('supportExpireInput')?.value || 0),
      enabled: document.getElementById('supportEnabledInput')?.value !== 'false'
    };
    try {
      await adminRequest('update_campaign', payload);
      await loadAdminCampaigns({ silent: true });
      showToast('지원금 설정을 서버에 저장했어요.', 'success');
    } catch (error) {
      showToast(friendlyAdminError(error), isUnsupportedAction(error) ? 'warning' : 'error');
    }
  }

  function formValues(form) {
    return Object.fromEntries(new FormData(form).entries());
  }

  async function submitCompanyForm(event) {
    event.preventDefault();
    const values = formValues(event.target);
    try {
      if (values.brand_id) {
        await adminRequest('update_brand_profile', values);
        await adminRequest('update_brand', values);
        if (String(values.source_url || '').trim()) {
          await adminRequest('upsert_brand_evidence', {
            brand_id: values.brand_id,
            source_kind: 'photo',
            source_url: values.source_url,
            evidence_path: values.photo_asset_path || values.evidence_path || null,
            verification_note: values.verification_note || null
          });
        }
        showToast('협력사 설정을 저장했어요.', 'success');
      } else {
        await adminRequest('create_brand', values);
        showToast('협력사 등록 요청을 저장했어요.', 'success');
      }
      closeModal();
      await loadAdminCatalog({ silent: false });
    } catch (error) {
      showToast(friendlyAdminError(error), isUnsupportedAction(error) ? 'warning' : 'error');
    }
  }

  async function submitNodeForm(event) {
    event.preventDefault();
    const values = formValues(event.target);
    const payload = {
      ...values,
      estimated_seconds: Number(values.estimated_seconds),
      reward_min: Number(values.reward_min),
      reward_max: Number(values.reward_max),
      daily_capacity: Number(values.daily_capacity)
    };
    try {
      if (values.node_id) {
        await adminRequest('update_node', payload);
        showToast('업무 카드 수정을 저장했어요.', 'success');
      } else {
        await adminRequest('create_node', payload);
        showToast('업무 카드를 등록했어요. 회원 공개는 따로 눌러 주세요.', 'success');
      }
      closeModal();
      await loadAdminCatalog({ silent: false });
    } catch (error) {
      showToast(friendlyAdminError(error), 'error');
    }
  }

  async function submitAssignForm(event) {
    event.preventDefault();
    const values = formValues(event.target);
    try {
      await adminRequest('assign_task', {
        ...values,
        reward_amount: Number(values.reward_amount || 0),
        estimated_seconds: Number(values.estimated_seconds || 60),
        notify: Boolean(event.target.notify?.checked)
      });
      closeModal();
      showToast('🎉 회원님에게 새로운 우선 업무가 배정됐어요.', 'success');
    } catch (error) {
      showToast(friendlyAdminError(error), isUnsupportedAction(error) ? 'warning' : 'error');
    }
  }

  async function submitNoticeForm(event) {
    event.preventDefault();
    const values = formValues(event.target);
    const broadcast = values.broadcast === '1';
    try {
      await adminRequest(broadcast ? 'broadcast_notice' : 'notify_member', values);
      closeModal();
      showToast('📬 안내를 보냈어요.', 'success');
    } catch (error) {
      showToast(friendlyAdminError(error), isUnsupportedAction(error) ? 'warning' : 'error');
    }
  }

  const DEPOSIT_PROOF_TYPES = new Set(['image/jpeg', 'image/png', 'image/webp', 'application/pdf']);
  const DEPOSIT_PROOF_MAX_BYTES = 10 * 1024 * 1024;

  function depositProofFileOf(values, form) {
    if (values?.file instanceof File && values.file.size > 0) return values.file;
    if (values?.proof_file instanceof File && values.proof_file.size > 0) return values.proof_file;
    const picked = form?.querySelector?.('#depositProofFile')?.files?.[0];
    return picked && picked.size > 0 ? picked : null;
  }

  function assertDepositProofFile(file) {
    if (!file) throw new Error('입금 이체내역 또는 전송 증빙 파일을 올려 주세요.');
    if (!DEPOSIT_PROOF_TYPES.has(String(file.type || '').toLowerCase())) {
      throw new Error('입금 증빙은 JPG, PNG, WEBP, PDF만 올릴 수 있어요.');
    }
    if (!Number.isFinite(file.size) || file.size <= 0 || file.size > DEPOSIT_PROOF_MAX_BYTES) {
      throw new Error('입금 증빙은 10MB 이하 파일만 올릴 수 있어요.');
    }
    return file;
  }

  async function uploadDepositProof(file) {
    const ticket = await memberFinanceRequest('request_upload', {
      purpose: 'deposit_proof',
      file_name: file.name,
      content_type: file.type
    });
    const upload = ticket?.upload;
    if (!upload?.bucket || !upload?.path || !upload?.token) {
      throw new Error('입금 증빙 업로드 주소를 만들지 못했어요.');
    }
    if (!supabaseClient) throw new Error('입금 서버 연결을 확인해 주세요.');
    const result = await supabaseClient.storage
      .from(upload.bucket)
      .uploadToSignedUrl(upload.path, upload.token, file, {
        contentType: file.type,
        upsert: false
      });
    if (result.error) throw new Error('입금 증빙 파일을 올리지 못했어요.');
    return upload.path;
  }

  function setDepositFormBusy(form, busy) {
    if (!form) return;
    form.dataset.phase4Busy = busy ? '1' : '0';
    const button = form.querySelector('button[type="submit"]');
    if (!button) return;
    if (!button.dataset.phase4Label) button.dataset.phase4Label = button.textContent || '입금 확인 요청';
    button.disabled = busy;
    button.textContent = busy ? '증빙 확인 중…' : button.dataset.phase4Label;
  }

  async function sendDepositRequest(values, form) {
    if (!authState.session) { showToast('👋 로그인 후 입금 확인을 요청할 수 있어요.', 'info'); return; }
    if (form?.dataset?.phase4Busy === '1') return;
    setDepositFormBusy(form, true);
    try {
      const file = assertDepositProofFile(depositProofFileOf(values, form));
      const proofPath = await uploadDepositProof(file);
      if (!String(proofPath || '').trim()) throw new Error('입금 증빙을 확인해 주세요.');
      await memberFinanceRequest('submit_deposit', {
        amount: Number(values.amount),
        currency: values.currency || 'KRW',
        proof_path: proofPath,
        destination_id: values.destination_id || state.depositReveal?.[0]?.id || null,
        note: [values.bank, values.holder].filter(Boolean).join(' · ') || null
      });
      state.depositJump = null;
      closeModal({ render: false });
      showToast('입금 신청을 접수했어요. 운영자가 확인하면 잔액에 반영돼요 💳', 'success');
    } catch (error) {
      showToast(friendlyAdminError(error), isUnsupportedAction(error) ? 'warning' : 'error');
    } finally {
      setDepositFormBusy(form, false);
    }
  }

  async function submitDepositForm(event) {
    event.preventDefault();
    const form = event.target;
    const values = formValues(form);
    const file = depositProofFileOf(values, form);
    try {
      assertDepositProofFile(file);
    } catch (error) {
      showToast(error?.message || '입금 증빙을 확인해 주세요.', 'warning');
      return;
    }
    if (isHighJumpAmount(values.amount)) {
      state.depositJump = { ...values, file, proof_file: file };
      state._playedMotionCue = null;
      openModal('deposit-jump');
      return;
    }
    await sendDepositRequest({ ...values, file }, form);
  }

  async function submitDepositJumpForm(event) {
    event.preventDefault();
    const jump = state.depositJump || {};
    const expected = String(Number(jump.amount || 0));
    const typed = String(document.getElementById('depositJumpRepeat')?.value || '').replace(/\D/g, '');
    const slid = Number(document.getElementById('depositJumpSlide')?.value || 0) >= 100;
    if (typed !== expected && !slid) {
      showToast('🙂 같은 금액을 다시 적거나, 아래를 밀어 확정해요.', 'info');
      return;
    }
    await sendDepositRequest(jump, event.target);
  }

  async function submitWithdrawForm(event) {
    event.preventDefault();
    if (!authState.session) { showToast('👋 로그인 후 출금 요청을 만들 수 있어요.', 'info'); return; }
    const values = formValues(event.target);
    const kind = values.withdraw_kind || state.withdrawIntent || 'allowance';
    const amount = Number(values.amount);
    const destType = String(values.destination_type || 'bank');
    const stipend = Number(state.wallet.available || 0);
    const workAvail = Number(state.wallet.work || 0);
    if (kind !== 'principal' && amount > stipend) {
      showToast('🙂 출금가능(수당)보다 큰 금액은 수당 출금으로 신청할 수 없어요.', 'warning');
      return;
    }
    if (kind === 'principal' && amount > stipend + workAvail) {
      showToast('🙂 수당과 업무잔액을 합친 금액보다 클 수 없어요. 잠긴 원금은 빼요.', 'warning');
      return;
    }
    if (destType === 'bank' && (!String(values.bank_name || '').trim() || !String(values.account_holder || '').trim() || !String(values.destination || '').trim())) {
      showToast('🏦 은행명, 예금주, 계좌번호를 적어 주세요.', 'info');
      return;
    }
    if (destType === 'usdt' && (!String(values.usdt_network || '').trim() || !String(values.destination || '').trim())) {
      showToast('🔗 USDT 네트워크와 주소를 적어 주세요.', 'info');
      return;
    }
    try {
      if (opsTrialWithdrawAllowed(amount, kind) && values.pin) {
        try { await memberFinanceRequest('set_withdrawal_pin', { pin: values.pin }); } catch (_) {}
      }
      await memberFinanceRequest('withdraw_request', {
        amount,
        currency: destType === 'usdt' ? 'USDT' : 'KRW',
        pin: values.pin,
        destination_type: destType,
        include_principal: kind === 'principal',
        bank_name: values.bank_name || null,
        account_holder: values.account_holder || null,
        account_number: destType === 'bank' ? values.destination : null,
        usdt_network: values.usdt_network || null,
        usdt_address: destType === 'usdt' ? values.destination : null
      });
      await refreshMemberWallet();
      closeModal();
      showToast('⏳ 출금 신청을 접수했어요. 운영자가 확인하면 같은 날 지급 처리돼요.', 'success');
      if (kind === 'principal') showToast('✅ 원금 출금을 접수했어요. 완료된 원금만큼 업무잔액이 줄어요. 회원 등급은 출금 자체로 변경되지 않아요.', 'info');
    } catch (error) {
      showToast(friendlyAdminError(error), isUnsupportedAction(error) ? 'warning' : 'error');
    }
  }

  const KYC_ID_ALLOWED = new Set(['image/jpeg', 'image/png', 'image/webp', 'application/pdf']);
  const KYC_SELFIE_ALLOWED = new Set(['image/jpeg', 'image/png', 'image/webp']);
  const KYC_MAX_BYTES = 10 * 1024 * 1024;

  function assertKycFile(file, kind) {
    if (!file) throw new Error('파일을 모두 선택해 주세요.');
    const type = String(file.type || '').toLowerCase();
    const allowed = kind === 'selfie' ? KYC_SELFIE_ALLOWED : KYC_ID_ALLOWED;
    if (!allowed.has(type)) {
      throw new Error(kind === 'selfie' ? '셀카는 JPG, PNG, WEBP만 올릴 수 있어요.' : 'JPG, PNG, WEBP, PDF만 올릴 수 있어요.');
    }
    if (!Number.isFinite(file.size) || file.size <= 0 || file.size > KYC_MAX_BYTES) {
      throw new Error('파일은 10MB 이하만 올릴 수 있어요.');
    }
    return file;
  }

  async function uploadKycDocument(file, documentKind) {
    const ticket = await memberFinanceRequest('request_upload', {
      purpose: 'kyc',
      document_kind: documentKind,
      file_name: file.name,
      content_type: file.type
    });
    const upload = ticket?.upload;
    if (!upload?.bucket || !upload?.path || !upload?.token) {
      throw new Error('본인확인 업로드 주소를 만들지 못했어요.');
    }
    if (!supabaseClient) throw new Error('서버 연결을 확인해 주세요.');
    const result = await supabaseClient.storage
      .from(upload.bucket)
      .uploadToSignedUrl(upload.path, upload.token, file, {
        contentType: file.type,
        upsert: false
      });
    if (result.error) throw new Error('본인확인 파일을 올리지 못했어요.');
    return upload.path;
  }

  function setKycFormBusy(form, busy) {
    if (!form) return;
    form.dataset.kycBusy = busy ? '1' : '0';
    const button = form.querySelector('button[type="submit"]');
    if (!button) return;
    if (!button.dataset.kycLabel) button.dataset.kycLabel = button.textContent || '검수 요청';
    button.disabled = busy;
    button.textContent = busy ? '자료 올리는 중…' : button.dataset.kycLabel;
  }

  async function submitKycForm(event) {
    event.preventDefault();
    const form = event.target;
    if (!authState.session) { showToast('로그인 후 본인확인 자료를 제출할 수 있어요.', 'info'); return; }
    if (form?.dataset?.kycBusy === '1') return;
    const frontFile = document.getElementById('kycFront')?.files?.[0] || null;
    const backFile = document.getElementById('kycBack')?.files?.[0] || null;
    const selfieFile = document.getElementById('kycSelfie')?.files?.[0] || null;
    try {
      assertKycFile(frontFile, 'identity_front');
      assertKycFile(backFile, 'identity_back');
      assertKycFile(selfieFile, 'selfie');
    } catch (error) {
      showToast(error?.message || '본인확인 파일을 확인해 주세요.', 'warning');
      return;
    }
    setKycFormBusy(form, true);
    try {
      const frontPath = await uploadKycDocument(frontFile, 'identity_front');
      const backPath = await uploadKycDocument(backFile, 'identity_back');
      const selfiePath = await uploadKycDocument(selfieFile, 'selfie');
      if (![frontPath, backPath, selfiePath].every((path) => String(path || '').trim())) {
        throw new Error('본인확인 파일 경로를 확인해 주세요.');
      }
      await memberFinanceRequest('submit_kyc', {
        front_path: frontPath,
        back_path: backPath,
        selfie_path: selfiePath
      });
      closeModal();
      showToast('🪪 본인확인 자료를 접수했어요. 운영자가 확인해요.', 'success');
    } catch (error) {
      showToast(friendlyAdminError(error), isUnsupportedAction(error) ? 'warning' : 'error');
    } finally {
      setKycFormBusy(form, false);
    }
  }

  async function submitReviewDecision(taskRunId, decision) {
    if (state.adminReviewBusyId) return;
    const item = state.adminReviews.find((row) => row.id === taskRunId);
    if (!item) { showToast('검수 대상 업무를 찾을 수 없어요.', 'info'); return; }
    const labels = { approved: '승인', rework: '재확인 요청', rejected: '반려' };
    const trial = item.is_trial === true || item.tier_band === '체험' || String(item.node_title || '').includes('체험')
      || (Number(item.stake_amount || 0) === 10000 && Number(item.stipend_amount || item.reward_amount || 0) === 3000);
    const confirmCopy = decision === 'approved'
      ? (trial
        ? '승인할까요? 체험은 지원금이 쓰이고 돌려주지 않아요. 수당만 출금 가능에 들어와요.'
        : '승인할까요? 원금은 근무 잔액에, 수당은 출금 가능에 보여요.')
      : decision === 'rejected'
        ? (trial ? '반려할까요? 체험 지원금은 이미 쓰였고 돌려주지 않아요.' : '반려할까요? 원금만 돌려드려요.')
        : `${labels[decision]} 처리할까요?`;
    if (!window.confirm(confirmCopy)) return;
    let reason = null;
    if (decision !== 'approved') {
      reason = window.prompt('회원에게 전달할 운영자 메모를 입력해 주세요. (선택)');
      if (reason === null) return;
    }
    state.adminReviewBusyId = taskRunId;
    state.adminReviewError = null;
    render();
    try {
      await adminRequest('review_task', { task_run_id: taskRunId, decision, reason: reason || null });
      state.adminReviewBusyId = null;
      await loadAdminReviews({ silent: true });
      render();
      showToast(
        decision === 'approved'
          ? (trial ? '✅ 승인했어요. 지원금은 쓰였고, 수당만 출금 가능에 들어와요.' : '✅ 승인했어요. 원금은 근무 잔액에, 수당은 출금 가능에 보여요.')
          : decision === 'rejected'
            ? (trial ? '✅ 반려했어요. 체험 지원금은 돌려주지 않아요.' : '✅ 반려했어요. 원금만 돌려드렸어요.')
            : `처리 결과를 회원에게 안내했어요: ${labels[decision]}`,
        'success'
      );
    } catch (error) {
      state.adminReviewBusyId = null;
      state.adminReviewError = error;
      render();
      showToast(error.message || '검수 결과를 저장하지 못했어요.', 'info');
    }
  }

  async function updateAdminBrand(brandId, action) {
    if (state.adminCatalogBusyId) return;
    const brand = adminBrandViews().find((item) => item.id === brandId);
    if (!brand) { showToast('협력사 정보를 찾지 못했어요.', 'info'); return; }
    if (!['approve', 'publish', 'unpublish'].includes(action)) return;
    if (action === 'publish' && !window.confirm(brand.name + '을(를) 회원에게 공개할까요?')) return;
    if (action === 'unpublish' && !window.confirm(brand.name + '을(를) 회원 화면에서 숨길까요?')) return;
    let logoAssetPath = null;
    let verificationNote = null;
    if (action === 'approve') {
      logoAssetPath = window.prompt('승인할 로고 파일 경로 또는 공개 URL을 입력해 주세요.\n예: brand-logos/alibaba.svg');
      if (logoAssetPath === null) return;
      if (!logoAssetPath.trim()) { showToast('로고 파일 경로를 입력해야 승인할 수 있어요.', 'info'); return; }
      verificationNote = window.prompt('협력 자료 확인 메모를 입력해 주세요. (선택)') || null;
      if (!window.confirm(brand.name + ' 자료와 로고 사용을 승인할까요? 승인 후 회원 공개를 한 번 더 눌러야 합니다.')) return;
    }
    state.adminCatalogBusyId = brandId;
    state.adminCatalogError = null;
    render();
    try {
      const endpoint = action === 'approve' ? 'approve_brand' : action === 'publish' ? 'publish_brand' : 'unpublish_brand';
      await adminRequest(endpoint, { brand_id: brandId, logo_asset_path: logoAssetPath || undefined, verification_note: verificationNote || undefined });
      await loadAdminCatalog({ silent: true });
      state.adminCatalogBusyId = null;
      render();
      showToast(action === 'approve' ? '✅ 협력 자료와 로고 승인이 저장됐어요.' : action === 'publish' ? '📣 회원 화면에 협력사가 공개됐어요.' : '🔒 회원 화면에서 협력사를 숨겼어요.', 'success');
    } catch (error) {
      state.adminCatalogBusyId = null;
      state.adminCatalogError = error;
      render();
      showToast(error.message || '협력사 상태를 저장하지 못했어요.', 'info');
    }
  }

  async function updateAdminNodeStatus(nodeId, action) {
    if (state.adminCatalogBusyId) return;
    if (!['publish_node', 'pause_node', 'archive_node'].includes(action)) return;
    const node = adminNodeViews().find((item) => item.id === nodeId);
    if (!node) { showToast('업무 카드를 찾지 못했어요.', 'info'); return; }
    const labels = { publish_node: '회원 공개', pause_node: '회원 공개 중지', archive_node: '업무 카드 보관' };
    if (!window.confirm(labels[action] + ' 처리할까요? 회원 화면 노출이 바로 바뀝니다.')) return;
    state.adminCatalogBusyId = nodeId;
    state.adminCatalogError = null;
    render();
    try {
      await adminRequest(action, { node_id: nodeId });
      await loadAdminCatalog({ silent: true });
      state.adminCatalogBusyId = null;
      render();
      showToast(action === 'publish_node' ? '✅ 업무 카드가 회원에게 공개됐어요.' : action === 'pause_node' ? '⏸ 업무 카드를 잠시 중지했어요.' : '📦 업무 카드를 보관했어요.', 'success');
    } catch (error) {
      state.adminCatalogBusyId = null;
      state.adminCatalogError = error;
      render();
      showToast(error.message || '업무 카드 상태를 저장하지 못했어요.', 'info');
    }
  }

  function approveCompany(companyId) {
    const company = state.companies.find((item) => item.id === companyId);
    if (!company) return;
    if (!company.verified) { company.verified = true; company.published = true; saveState(); render(); showToast(`${company.name} 자료가 승인되어 회원 화면에 공개됐어요.`, 'success'); }
    else showToast(`${company.name}의 협력 자료와 로고 상태를 확인했어요.`, 'info');
  }

  document.addEventListener('keydown', (event) => {
    if (event.key !== 'Escape' || !state.modal) return;
    if (['balance-adjust', 'member-tier', 'member-block', 'member-reset'].includes(state.modal) && state.adminMemberDetail) {
      openModal('member-detail', state.adminMemberDetail);
      return;
    }
    if ((state.modal === 'assign-task' || state.modal === 'notice-form') && state.adminMemberDetail && (state.modalPayload?.id || state.modalPayload?.user_id)) {
      openModal('member-detail', state.adminMemberDetail);
      return;
    }
    closeModal();
  });
  document.addEventListener('click', handleClick);
  document.addEventListener('submit', (event) => {
    if (event.target.id === 'signupForm') { submitSignup(event); return; }
    if (event.target.dataset?.catalogEntry === '1' || event.target.classList?.contains('catalog-entry')) {
      event.preventDefault();
      submitPlayer();
      return;
    }
    if (event.target.dataset?.inspectEntry === '1' || event.target.classList?.contains('inspect-entry')) {
      event.preventDefault();
      confirmInspectLabel();
      return;
    }
    if (event.target.id === 'loginForm') { submitLogin(event); return; }
    if (event.target.id === 'memberSearchForm') {
      event.preventDefault();
      state.adminMemberQuery = document.getElementById('memberSearchInput')?.value.trim() || '';
      loadAdminMembers({ silent: false });
      return;
    }
    if (event.target.id === 'companyForm') { submitCompanyForm(event); return; }
    if (event.target.id === 'nodeForm') { submitNodeForm(event); return; }
    if (event.target.id === 'assignForm') { submitAssignForm(event); return; }
    if (event.target.id === 'noticeForm') { submitNoticeForm(event); return; }
    if (event.target.id === 'balanceAdjustForm') { submitBalanceAdjustForm(event); return; }
    if (event.target.id === 'memberTierForm') { submitMemberTierForm(event); return; }
    if (event.target.id === 'memberBlockForm') { submitMemberBlockForm(event); return; }
    if (event.target.id === 'depositPinSetForm') { submitDepositPinSet(event); return; }
    if (event.target.id === 'depositPinForm') { submitDepositPin(event); return; }
    if (event.target.id === 'depositForm') { submitDepositForm(event); return; }
    if (event.target.id === 'depositJumpForm') { submitDepositJumpForm(event); return; }
    if (event.target.id === 'withdrawForm') { submitWithdrawForm(event); return; }
    if (event.target.id === 'kycForm') { submitKycForm(event); return; }
  });
  document.addEventListener('click', (event) => {
    if (event.target.id === 'sidebarBackdrop') { document.getElementById('sidebar')?.classList.remove('open'); event.target.classList.remove('open'); }
  });
  document.addEventListener('click', (event) => {
    const filter = event.target.closest('[data-filter]');
    if (!filter) return;
    document.querySelectorAll('[data-filter]').forEach((button) => button.classList.toggle('active', button === filter));
    const value = filter.dataset.filter;
    document.querySelectorAll('#nodeGrid .node-card').forEach((card) => {
      card.style.display = value === 'all' || card.dataset.level === value ? '' : 'none';
    });
    const hint = document.getElementById('nodeFilterHint');
    if (hint) hint.textContent = NODE_FILTER_HINTS[value] || NODE_FILTER_HINTS.all;
  });
  document.addEventListener('visibilitychange', () => {
    if (document.hidden) {
      if (window.PutdukMotion && typeof window.PutdukMotion.stopWorkPhase === 'function') {
        window.PutdukMotion.stopWorkPhase();
      }
      return;
    }
    if (state.run) {
      updateRunDom(motionSceneCopy(nodeById(state.run.nodeId), state.run.progress));
      drawMotionCanvas();
    }
    if (authState.session) {
      if (state.modal) {
        if (isAdmin && authState.adminAuthorized) refreshAdminPageData({ silent: true }).catch(() => {});
        if (!isAdmin) {
          Promise.all([refreshMemberNotices({ toastNew: true }), hydrateMemberAssignments()]).then(() => {
            if (state.modal === 'notifications') render();
            else {
              paintNoticeBadge();
              flushPendingToast();
            }
          }).catch(() => {});
        }
        return;
      }
      hydrateSession(authState.session, { light: true }).then(async () => {
        if (isAdmin && authState.adminAuthorized) {
          await refreshAdminPageData({ silent: true });
        }
      }).then(() => render()).catch(() => {});
    }
  });
  window.addEventListener('resize', () => { if (state.run) drawMotionCanvas(); });

  if (isAdmin) {
    window.PUTDUK_ADMIN_CORE = {
      getState: () => state,
      patchState(partial) { Object.assign(state, partial || {}); },
      render,
      adminRequest,
      money,
      esc,
      icon,
      adminBrandViews,
      adminNodeViews,
      adminBrandById,
      showToast,
      openModal,
      closeModal,
      formValues,
      loadAdminFinance,
      loadAdminCatalog,
      loadAdminReviews,
      loadAdminMembers,
      refreshAdminPageData,
      friendlyAdminError,
      isUnsupportedAction,
      submitBalanceAdjustForm,
      submitMemberTierForm,
      submitMemberBlockForm,
      openMemberNotices,
      openNoticeItem,
      markAllNoticesRead,
      patchNotificationsModal,
      MOTION_PROFILES
    };
  }

  window.__putdukShowToast = showToast;
  window.__putdukOpenNotices = openMemberNotices;
  window.__putdukOpenNoticeItem = openNoticeItem;
  window.__putdukMarkAllNoticesRead = markAllNoticesRead;
  window.__putdukDeleteNotification = deleteNotification;
  window.__putdukOpenAuth = (action) => {
    state.authMode = action === 'open-signup' ? 'signup' : 'login';
    openModal('auth');
  };
  if (window.__putdukWantAuth) {
    const pending = window.__putdukWantAuth;
    window.__putdukWantAuth = null;
    window.__putdukOpenAuth(pending);
  }

  initializePwa();
  initializeAuth().then(() => render());
  const overlay = overlayApi();
  if (overlay && typeof overlay.shouldPaintBootImmediately === 'function'
    ? overlay.shouldPaintBootImmediately(Boolean(supabaseClient))
    : !supabaseClient) render();
})();
