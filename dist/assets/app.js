(() => {
  'use strict';

  const isAdmin = document.documentElement.dataset.mode === 'admin';
  const config = window.PUTDUK_CONFIG || {};
  const adminFunctionUrl = config.adminFunctionUrl || (config.supabaseUrl ? `${config.supabaseUrl}/functions/v1/admin-control` : '');
  const storageKey = 'putduk-state-v2';
  const supabaseClient = window.supabase && config.supabaseUrl && config.supabasePublishableKey
    ? window.supabase.createClient(config.supabaseUrl, config.supabasePublishableKey, {
      auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true }
    })
    : null;
  const authState = { session: null, profile: null, loading: Boolean(supabaseClient), error: null, adminLoading: isAdmin && Boolean(supabaseClient), adminAuthorized: !isAdmin, adminRoles: [] };

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

  const defaultState = {
    theme: 'light',
    memberPage: 'dashboard',
    adminPage: 'overview',
    authMode: 'signup',
    modal: null,
    modalPayload: null,
    wallet: { support: 0, task: 0, referral: 0, available: 0, held: 0 },
    run: null,
    history: [],
    notifications: [],
    referrals: [],
    deposits: [],
    withdrawals: [],
    companies: [],
    nodeEnabled: {},
    supportGrant: 10000,
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
    adminFinance: { deposits: [], withdrawals: [], kyc: [], referrals: [] },
    adminFinanceLoading: false,
    adminFinanceError: null,
    adminFinanceContract: null,
    adminCampaigns: [],
    adminCampaignsError: null,
    adminCampaignsContract: null,
    adminFormBusy: false,
    toast: null
  };

  let activeStorageKey = storageKey;
  let state = loadState();
  let runFrame = null;
  let chartInstance = null;
  let syncTimer = null;
  const toastRecent = new Map();
  const toastTimers = new Set();

  function freshState(userState = false) {
    const next = JSON.parse(JSON.stringify(defaultState));
    if (userState) {
      next.wallet = { support: 0, task: 0, referral: 0, available: 0, held: 0 };
      next.history = [];
      next.notifications = [];
      next.run = null;
    }
    return next;
  }

  function loadState(key = activeStorageKey) {
    try {
      const stored = JSON.parse(localStorage.getItem(key) || 'null');
      if (!stored) return freshState(key !== storageKey);
      return { ...freshState(key !== storageKey), ...stored, wallet: { ...freshState(key !== storageKey).wallet, ...(stored.wallet || {}) } };
    } catch (_) {
      return freshState(key !== storageKey);
    }
  }

  function saveState() {
    try {
      const safe = { ...state, run: state.run ? { ...state.run, overlayOpen: false } : null, toast: null, modal: null, modalPayload: null, adminMemberDetail: null };
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
    return authState.profile?.public_id || (authState.session ? '회원번호 준비 중' : '가입 후 발급');
  }

  function referralCode() {
    return authState.profile?.referral_code || (authState.session ? '코드 준비 중' : '로그인 후 확인');
  }

  function financeEnabled() {
    return config.enableFinanceApi === true;
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
      referral_count: Number(row.referral_count || 0),
      wallet: {
        available: Number(row.available_krw || 0),
        held: 0
      }
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
        available: Number(next.wallet?.available ?? prev.wallet?.available ?? 0),
        held: Number(next.wallet?.held ?? prev.wallet?.held ?? 0)
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
          available: Number(available.available_amount || 0),
          held: Number(held.held_amount || 0)
        }
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
      sent: '송금 완료',
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
      pending: '대기',
      submitted: '검수 대기',
      checking: '확인 중',
      approved: '확인 완료',
      rejected: '반려'
    })[status] || '미제출';
  }

  const MEMBER_TIERS = ['일반 파트너', '인증 파트너', '우수 파트너', '글로벌 디렉터'];

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

  async function hydratePublishedCatalog() {
    if (isAdmin || !supabaseClient || !authState.session) return;
    const brandSelectWithPhoto = 'id,slug,display_name_ko,category,description_ko,verification_status,logo_usage_status,logo_asset_path,photo_asset_path,published';
    const brandSelect = 'id,slug,display_name_ko,category,description_ko,verification_status,logo_usage_status,logo_asset_path,published';
    let brandQuery = supabaseClient.from('partner_brands').select(brandSelectWithPhoto).order('display_name_ko', { ascending: true });
    const [brandFirst, nodeResult] = await Promise.all([
      brandQuery,
      supabaseClient
        .from('nodes')
        .select('id,public_id,partner_brand_id,title_ko,description_ko,node_family,difficulty,estimated_seconds,reward_min,reward_max,daily_capacity,motion_profile,motion_version,enabled,catalog_status')
        .order('created_at', { ascending: false })
    ]);
    let brandResult = brandFirst;
    if (brandResult.error && /photo_asset_path/i.test(String(brandResult.error.message || brandResult.error))) {
      brandResult = await supabaseClient.from('partner_brands').select(brandSelect).order('display_name_ko', { ascending: true });
    }
    if (brandResult.error || nodeResult.error) {
      authState.error = brandResult.error || nodeResult.error;
      return;
    }
    const brandRows = Array.isArray(brandResult.data) ? brandResult.data : [];
    const nodeRows = Array.isArray(nodeResult.data) ? nodeResult.data : [];
    const palette = ['#0d9f76', '#d49a17', '#5d4fb2', '#0a7180', '#c85b27', '#2b5da7', '#bc2039', '#78502c'];
    companies = brandRows.map((row, index) => ({
      id: row.id,
      slug: row.slug,
      name: row.display_name_ko,
      label: row.category,
      mark: String(row.display_name_ko || 'PD').slice(0, 3),
      color: palette[index % palette.length],
      status: '공개 승인',
      category: row.category,
      copy: row.description_ko || '',
      logo_asset_path: row.logo_asset_path || '',
      photo_asset_path: row.photo_asset_path || '',
      logoUrl: brandAssetSrc(row.logo_asset_path, row.slug, 'logo'),
      photoUrl: brandAssetSrc(row.photo_asset_path, row.slug, 'photo'),
      verified: true,
      published: true
    }));
    const companyColors = Object.fromEntries(companies.map((company) => [company.id, company.color]));
    nodes = nodeRows.map((row) => ({
      id: row.id,
      publicId: row.public_id,
      companyId: row.partner_brand_id,
      title: row.title_ko,
      copy: row.description_ko,
      time: Number(row.estimated_seconds || 60),
      minutes: formatDuration(Number(row.estimated_seconds || 60)),
      reward: Number(row.reward_max ?? row.reward_min ?? 0),
      rewardMin: Number(row.reward_min ?? 0),
      rewardMax: Number(row.reward_max ?? row.reward_min ?? 0),
      level: row.difficulty || '일반 처리',
      icon: 'scan-line',
      color: companyColors[row.partner_brand_id] || '#0d9f76',
      available: Number(row.daily_capacity || 0),
      motion: row.motion_profile || 'default',
      motionVersion: row.motion_version || '1.0.0',
      enabled: row.enabled === true && row.catalog_status === 'published'
    }));
    state.companies = companies;
    state.nodeEnabled = Object.fromEntries(nodes.map((node) => [node.id, node.enabled !== false]));
  }

  function formatDuration(seconds) {
    const total = Math.max(1, Math.round(Number(seconds || 60)));
    if (total < 60) return `${total}초`;
    const minutes = Math.floor(total / 60);
    const remainder = total % 60;
    return remainder ? `${minutes}분 ${remainder}초` : `${minutes}분`;
  }

  function motionProfileOf(node) {
    return String(node?.motion || node?.motion_profile || 'default');
  }

  function motionSceneCopy(node, progress) {
    const profile = motionProfileOf(node);
    if (progress < 0.25) return { label: '데이터센터·회선 연결', copy: '📡 서울 노드와 연결 중이에요.' };
    if (progress < 0.58) {
      if (profile.includes('ocean') || profile === 'ocean_vessel') return { label: '해상 항로 이동', copy: '🚢 컨테이너 상태를 대조하고 있어요.' };
      if (profile.includes('air') || profile === 'air_cargo' || profile === 'document') return { label: '항공 운송 비교', copy: '✈️ 항공 운송 데이터를 비교하고 있어요.' };
      if (profile.includes('catalog') || profile === 'commerce_catalog') return { label: '상품 속성 정리', copy: '📦 상품 속성 정보를 정리하고 있어요.' };
      if (profile.includes('warehouse')) return { label: '창고 격자 확인', copy: '📦 재고 위치를 한 칸씩 맞추고 있어요.' };
      return { label: '배송 경로 분석', copy: '🚚 배송 데이터 경로를 분석하고 있어요.' };
    }
    if (progress < 0.83) return { label: '비교·품질검사', copy: '오류 항목을 분리하고 있어요.' };
    return { label: '검수 대기·동기화', copy: '보상은 운영자 검수 후 확정돼요.' };
  }

  async function hydrateSession(session) {
    const previousHistory = Array.isArray(state.history) ? state.history : [];
    const previousHistoryMap = new Map(previousHistory.map((item) => [item.id, item.status]));
    authState.session = session || null;
    authState.profile = null;
    authState.error = null;
    if (!session) {
      authState.loading = false;
      activeStorageKey = storageKey;
      state = loadState(storageKey);
      return;
    }
    switchToUserState(session.user.id);
    state.wallet = { support: 0, task: 0, referral: 0, available: 0, held: 0 };
    state.history = [];
    state.notifications = [];
    state.referrals = [];
    state.deposits = [];
    state.withdrawals = [];
    if (!supabaseClient) { authState.loading = false; return; }
    authState.loading = true;
    try {
      const profileResult = await supabaseClient
        .from('profiles')
        .select('public_id,display_name,member_tier,status,referral_code')
        .eq('id', session.user.id)
        .maybeSingle();
      if (profileResult.error) throw profileResult.error;
      authState.profile = profileResult.data || null;
      await hydratePublishedCatalog();

      const walletResult = await supabaseClient
        .from('wallet_accounts')
        .select('bucket,currency,available_amount,held_amount')
        .eq('user_id', session.user.id)
        .eq('currency', 'KRW');
      if (!walletResult.error && Array.isArray(walletResult.data) && walletResult.data.length) {
        const buckets = Object.fromEntries(walletResult.data.map((row) => [row.bucket, row]));
        state.wallet.support = Number(buckets.support_grant?.available_amount || 0);
        state.wallet.task = Number(buckets.task_reward?.available_amount || 0);
        state.wallet.referral = Number(buckets.referral_reward?.available_amount || 0);
        state.wallet.available = Number(buckets.available?.available_amount || 0);
        state.wallet.held = Number(buckets.held?.held_amount || 0);
      }

      const runResult = await supabaseClient
        .from('task_runs')
        .select('id,public_id,node_id,status,reward_amount,started_at,created_at,completed_at,expected_completed_at,motion_variant,motion_seed')
        .eq('user_id', session.user.id)
        .order('created_at', { ascending: false })
        .limit(50);
      if (!runResult.error && Array.isArray(runResult.data)) {
        const statusLabel = { approved: '검수 완료', review_pending: '검수 대기', submitted: '제출 완료', in_progress: '진행 중', rework: '재확인 요청', rejected: '반려', cancelled: '취소' };
        state.history = runResult.data.map((row) => ({
          id: row.public_id,
          nodeId: row.node_id,
          status: statusLabel[row.status] || '처리 중',
          reward: Number(row.reward_amount || 0),
          date: new Date(row.created_at).toLocaleString('ko-KR', { month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit' }),
          createdAt: row.created_at,
          duration: row.completed_at && row.created_at ? `${Math.max(1, Math.round((new Date(row.completed_at) - new Date(row.created_at)) / 1000))}초` : '진행 중'
        }));
        const newlyApproved = runResult.data.find((row) => row.status === 'approved' && ['검수 대기', '제출 완료'].includes(previousHistoryMap.get(row.public_id)) && state.lastReviewToastId !== row.public_id);
        if (newlyApproved) {
          state.lastReviewToastId = newlyApproved.public_id;
          state.toast = { text: `🎉 ${newlyApproved.public_id} 업무가 검수 완료됐어요. 지갑에 보상이 반영됐습니다.`, kind: 'success' };
        }
      }


        if (config.enableWorkApi === true) {
          const active = runResult.data.find((row) => ['reserved', 'in_progress', 'checkpointed'].includes(row.status));
          if (active) {
            const activeNode = nodeById(active.node_id);
            const startedAt = Date.parse(active.started_at || '') || Date.now();
            const expectedAt = Date.parse(active.expected_completed_at || '') || (startedAt + activeNode.time * 1000);
            const duration = Math.max(1000, expectedAt - startedAt);
            state.run = {
              id: active.public_id,
              dbId: active.id,
              nodeId: active.node_id,
              startedAt,
              expectedCompletedAt: expectedAt,
              duration,
              progress: Math.min(1, Math.max(0, (Date.now() - startedAt) / duration)),
              overlayOpen: Boolean(state.run?.overlayOpen),
              logs: state.run?.logs || ['[복원] 서버에 저장된 업무 상태를 다시 연결했어요.'],
              serverBacked: true,
              rewardAmount: Number(active.reward_amount || 0),
              motionVariant: active.motion_variant || 'a',
              motionSeed: active.motion_seed || '',
              _submitted: false
            };
          } else if (state.run?.serverBacked) {
            state.run = null;
          }
        }
      const noticeResult = await supabaseClient
        .from('notifications')
        .select('id,title,body,notification_type,created_at,read_at')
        .eq('user_id', session.user.id)
        .order('created_at', { ascending: false })
        .limit(20);
      if (!noticeResult.error && Array.isArray(noticeResult.data)) {
        state.notifications = noticeResult.data.map((row) => ({
          id: row.id,
          text: row.body || row.title,
          time: new Date(row.created_at).toLocaleString('ko-KR', { month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit' }),
          type: row.notification_type || 'info',
          read: Boolean(row.read_at)
        }));
      }

      const [referralResult, depositResult, withdrawalResult] = await Promise.all([
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
      ]);
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
    } catch (error) {
      authState.error = error;
    } finally {
      authState.loading = false;
    }
  }

  async function hydrateAdminAuthorization() {
    authState.adminAuthorized = !isAdmin;
    authState.adminRoles = [];
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
        authState.error = new Error(result.error || '운영자 권한을 확인하지 못했어요.');
        return;
      }
      authState.adminAuthorized = true;
      authState.adminRoles = Array.isArray(result.roles) ? result.roles : [];
    } catch (error) {
      authState.error = error;
    } finally {
      authState.adminLoading = false;
    }
  }

  let sessionRecorded = false;
  async function recordOwnSession() {
    if (!authState.session || sessionRecorded) return;
    sessionRecorded = true;
    try {
      await edgeRequest('record_session', {});
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
        referrals: Array.isArray(result.referrals) ? result.referrals : []
      };
      state.adminFinanceError = null;
      state.adminFinanceContract = true;
    } catch (error) {
      state.adminFinance = { deposits: [], withdrawals: [], kyc: [], referrals: [] };
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
    const jobs = [loadAdminReviews({ silent: true }), loadAdminCatalog({ silent: true })];
    if (state.adminPage === 'overview' || state.adminPage === 'members') jobs.push(loadAdminMembers({ silent: true }));
    if (state.adminPage === 'overview' || state.adminPage === 'finance') jobs.push(loadAdminFinance({ silent: true }));
    if (state.adminPage === 'settings') jobs.push(loadAdminCampaigns({ silent: true }));
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
      await hydrateSession(data.session);
      if (authState.session) await recordOwnSession();
      if (isAdmin) {
        await hydrateAdminAuthorization();
        if (authState.adminAuthorized) {
          await refreshAdminPageData({ silent: true });
        }
      }
      supabaseClient.auth.onAuthStateChange((event, session) => {
        if (event === 'TOKEN_REFRESHED' || event === 'INITIAL_SESSION') {
          authState.session = session || authState.session;
          return;
        }
        window.setTimeout(async () => {
          await hydrateSession(session);
          if (authState.session) await recordOwnSession();
          if (isAdmin) {
            await hydrateAdminAuthorization();
            if (authState.adminAuthorized) {
              await refreshAdminPageData({ silent: true });
            }
          }
          if (!state.modal) render();
        }, 0);
      });
      if (!syncTimer) {
        syncTimer = window.setInterval(async () => {
          if (!authState.session || document.hidden) return;
          if (state.modal) {
            if (isAdmin && authState.adminAuthorized) await refreshAdminPageData({ silent: true });
            return;
          }
          await hydrateSession(authState.session);
          if (isAdmin && authState.adminAuthorized) await refreshAdminPageData({ silent: true });
          render();
        }, 30000);
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
    return `${Number(value || 0).toLocaleString('ko-KR')}원`;
  }

  function icon(name, size = 17) {
    return `<i data-lucide="${name}" width="${size}" height="${size}" aria-hidden="true"></i>`;
  }

  function refreshIcons() {
    if (window.lucide && typeof window.lucide.createIcons === 'function') window.lucide.createIcons({ attrs: { 'stroke-width': 1.8 } });
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

  function navItems() {
    const financeCount = (state.adminFinance.deposits?.length || 0) + (state.adminFinance.withdrawals?.length || 0);
    return isAdmin ? [
      { id: 'overview', label: '전체 현황', icon: 'layout-dashboard' },
      { id: 'members', label: '회원 관리', icon: 'users', count: state.adminMembersContract ? state.adminMemberTotal : undefined },
      { id: 'companies', label: '기업 관리', icon: 'building-2', count: state.adminCatalogLoaded ? state.adminCatalog.brands.length : undefined },
      { id: 'nodes', label: '업무 카드 관리', icon: 'waypoints', count: state.adminCatalogLoaded ? state.adminCatalog.nodes.length : undefined },
      { id: 'reviews', label: '업무 검수', icon: 'clipboard-check', count: state.adminReviewPendingCount || undefined },
      { id: 'finance', label: '입출금 처리', icon: 'wallet-cards', count: state.adminFinanceContract ? financeCount : undefined },
      { id: 'notifications', label: '공지·알림', icon: 'bell' },
      { id: 'settings', label: '운영 설정', icon: 'sliders-horizontal' }
    ] : [
      { id: 'dashboard', label: '내 작업실', icon: 'layout-dashboard' },
      { id: 'nodes', label: '업무 노드 찾기', icon: 'waypoints' },
      { id: 'history', label: '내 작업내역', icon: 'clipboard-list' },
      { id: 'wallet', label: '지갑·입출금', icon: 'wallet-cards' },
      { id: 'membership', label: '멤버십 카드', icon: 'badge-check' },
      { id: 'referrals', label: '추천인 혜택', icon: 'user-plus' },
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
          <div><div class="brand-name">퍼뜩</div><div class="brand-kicker">${isAdmin ? '운영자 관리센터' : '데이터 노드 플랫폼'}</div></div>
        </div>
        <div class="nav-label">${isAdmin ? '운영 메뉴' : '내 서비스'}</div>
        <nav aria-label="주요 메뉴">
          ${items.map((item) => `<button class="nav-item ${current === item.id ? 'active' : ''}" data-nav="${item.id}">${icon(item.icon, 17)}<span>${item.label}</span>${item.count ? `<span class="nav-count">${item.count > 99 ? '99+' : item.count}</span>` : ''}</button>`).join('')}
        </nav>
        <div class="side-footer">
          ${isAdmin ? `<div class="mode-card"><div class="eyebrow">${icon('shield-check', 14)} 안전한 운영</div><p style="margin:8px 0 0;color:var(--muted);font-size:11px;line-height:1.5">모든 회원·금액 변경은 관리자 기록에 남습니다.</p></div>` : `<div class="mode-card"><div style="display:flex;align-items:center;gap:8px;font-size:12px;font-weight:800">${icon('headphones',15)} 퍼뜩 안내센터</div><p style="margin:7px 0 0;color:var(--muted);font-size:11px;line-height:1.5">처음이라도 업무 단계부터 차근차근 안내해요.</p><button class="text-link" data-nav="support" style="padding:6px 0 0">도움말 보기</button></div>`}
        </div>
      </aside>
      <div class="sidebar-backdrop" id="sidebarBackdrop"></div>
    `;
  }

  function renderTopbar() {
    const title = isAdmin ? ({ overview: '전체 현황', members: '회원 관리', companies: '기업 관리', nodes: '업무 카드 관리', reviews: '업무 검수', finance: '입출금 처리', notifications: '공지·알림', settings: '운영 설정' }[state.adminPage] || '전체 현황') : ({ dashboard: '내 작업실', nodes: '업무 노드 찾기', history: '내 작업내역', wallet: '지갑·입출금', membership: '멤버십 카드', referrals: '추천인 혜택', support: '도움말' }[state.memberPage] || '내 작업실');
    const memberIdentity = authState.session
      ? `<div class="profile-chip"><span class="avatar">${esc(profileInitial())}</span><span>${esc(profileName())}</span><button class="profile-logout" data-action="logout">로그아웃</button></div>`
      : `<button class="small-button" data-action="open-login">로그인</button>`;
    const adminIdentity = authState.adminAuthorized && authState.session
      ? `<div class="profile-chip"><span class="avatar">관</span><span>운영자 계정</span><button class="profile-logout" data-action="logout">로그아웃</button></div>`
      : `<button class="small-button" data-action="open-login">운영자 로그인</button>`;
    const installButton = !isAdmin ? `<button class="icon-button" data-action="install-app" aria-label="퍼뜩 앱 설치">${icon('download', 17)}</button>` : '';
    return `
      <div class="mobile-topbar"><button class="icon-button" data-menu="open" aria-label="메뉴 열기">${icon('menu', 19)}</button><div class="brand-name">퍼뜩</div><div style="display:flex;gap:6px">${installButton}<button class="icon-button" data-theme-toggle aria-label="테마 전환">${icon(state.theme === 'dark' ? 'sun' : 'moon', 17)}</button></div></div>
      <div class="topbar"><div class="breadcrumb">퍼뜩 ${isAdmin ? '운영자 관리센터' : '데이터 노드'} <strong>${title}</strong></div><div class="top-actions">${installButton}<button class="icon-button" data-theme-toggle aria-label="테마 전환">${icon(state.theme === 'dark' ? 'sun' : 'moon', 17)}</button><button class="icon-button" data-notification aria-label="알림">${icon('bell', 17)}</button>${isAdmin ? adminIdentity : memberIdentity}</div></div>
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
    return `<div class="trust-strip"><div class="trust-title">${icon('badge-check', 15)} 연결 출처</div>${pills}<span style="margin-left:auto;color:var(--muted);font-size:11px">${modeText} · 공개 상태는 운영자 확인 후 반영</span></div>`;
  }

  function renderMemberDashboard() {
    const inProgress = state.run ? nodeById(state.run.nodeId) : null;
    const accountButton = authState.session
      ? `<button class="secondary-button" data-action="logout">로그아웃</button>`
      : `<button class="secondary-button" data-action="open-signup">회원가입·로그인</button>`;
    return `
      ${renderTrustStrip()}
      <section class="grid-hero">
        <div class="hero-card">
          <div class="eyebrow"><span class="pulse-dot"></span> 지금 처리 가능한 데이터 노드</div>
          <h1 class="hero-title">오늘의 데이터 업무를<br><span style="color:var(--emerald-strong)">내 속도로 시작해요.</span></h1>
          <p class="hero-copy">기업별로 다른 데이터 업무를 선택하고, 실제 처리 단계와 검수 결과를 확인할 수 있어요. 처음이라면 빠른 확인 노드부터 시작해 보세요.</p>
          <div class="hero-actions"><button class="primary-button" data-nav="nodes">${icon('play-circle', 18)} 업무 노드 둘러보기</button>${accountButton}</div>
          <div class="hero-metrics"><div><div class="metric-label">오늘 처리 가능</div><div class="metric-value">${nodes.length}<small>개 노드</small></div></div><div><div class="metric-label">내 검수 완료</div><div class="metric-value">${state.history.filter((item) => item.status === '검수 완료').length}<small>건</small></div></div><div><div class="metric-label">현재 상태</div><div class="metric-value" style="font-size:18px;color:var(--emerald-strong)">${authState.session ? '계정 연결' : '안내 화면'}</div></div></div>
        </div>
        <div class="id-card"><div class="id-card-top"><div><div class="id-card-kicker">퍼뜩 멤버십 카드</div><div class="id-card-title">우수 파트너</div></div><div class="id-chip"></div></div><div class="id-number">${esc(publicId())}</div><div class="id-footer"><span>${esc(profileName())}</span><span>${authState.session ? '인증 계정' : '가입 전 카드'}</span></div><div style="display:flex;align-items:center;gap:7px;margin-top:17px;color:#b9e8d2;font-size:11px">${icon('sparkles', 14)} 활동으로 등급이 올라가요</div></div>
      </section>
      ${inProgress ? `<div class="notice" style="margin-bottom:18px"><span style="color:var(--emerald)">${icon('activity',17)}</span><div style="flex:1"><strong>${esc(inProgress.title)}</strong>을(를) 처리하고 있어요.<br><span style="color:var(--muted)">화면을 닫아도 서버에서 진행됩니다.</span></div><button class="small-button primary" data-action="open-run">진행 화면 열기</button></div>` : ''}
      <section class="dashboard-grid">
        <div class="panel"><div class="panel-head"><div><div class="panel-title">처리 흐름</div><div class="panel-subtitle">검수 완료된 내 작업 보상만 표시해요</div></div><span class="status-badge">${icon('trending-up', 13)} 서버 기록 기준</span></div><div class="chart-wrap"><canvas id="earningsChart" aria-label="최근 7일 보상 흐름"></canvas></div></div>
        <div class="wallet-card"><div class="eyebrow" style="color:#a8f3d2">${icon('wallet', 14)} 내 지갑</div><div class="wallet-balance">${money(state.wallet.available)}</div><div class="wallet-row"><span class="muted">업무 지원금</span><strong>${money(state.wallet.support)}</strong></div><div class="wallet-row"><span class="muted">작업 보상</span><strong>${money(state.wallet.task)}</strong></div><div class="wallet-row"><span class="muted">추천 보상</span><strong>${money(state.wallet.referral)}</strong></div><div style="display:flex;gap:8px;margin-top:17px"><button class="secondary-button" data-nav="wallet" style="flex:1;color:#fff;border-color:rgba(255,255,255,.2);background:rgba(255,255,255,.1)">지갑 보기</button><button class="gold-button" data-action="deposit-info" style="flex:1">충전 안내</button></div></div>
      </section>
      ${renderPartnerGallery()}
      <div class="section-heading"><div><h2>오늘 추천 노드</h2><p>업무별 예상시간과 보상을 먼저 확인하세요.</p></div><button class="text-link" data-nav="nodes">전체 노드 보기 ${icon('arrow-right', 14)}</button></div>
      <section class="node-grid">${nodes.slice(0, 3).map(renderNodeCard).join('') || `<div class="empty-state compact" style="grid-column:1/-1"><div class="empty-icon">${icon('waypoints', 22)}</div><strong>공개된 업무가 아직 없어요.</strong><p>로그인 후 운영자가 승인한 협력사·업무만 표시됩니다.</p></div>`}</section>
      <section class="dashboard-grid" style="margin-top:18px"><div class="panel"><div class="panel-head"><div><div class="panel-title">최근 작업 흐름</div><div class="panel-subtitle">실제 작업 단계가 여기에 기록돼요.</div></div><button class="text-link" data-nav="history">전체보기</button></div>${renderTimeline()}</div><div class="panel panel-pad"><div class="panel-title">처음 시작하는 분께</div><div class="notice" style="margin-top:14px"><span style="color:var(--gold)">${icon('lightbulb',17)}</span><div>빠른 확인 노드는 1분 안에 끝나고, 화면에 표시된 조건과 검수 결과에 따라 보상이 확정돼요.</div></div><button class="secondary-button" data-nav="support" style="width:100%;margin-top:13px">업무 과정 알아보기</button></div></section>
    `;
  }

  function renderNodeCard(node) {
    const company = companyById(node.companyId);
    const enabled = state.nodeEnabled[node.id] !== false;
    const markSrc = company.logoUrl || brandAssetSrc(company.logo_asset_path, company.slug, 'logo');
    const mark = markSrc
      ? `<div class="company-mark has-image"><img src="${esc(markSrc)}" alt="${esc(company.name)} 로고" /></div>`
      : `<div class="company-mark">${esc(company.mark)}</div>`;
    return `<article class="node-card" style="--node-color:${node.color};opacity:${enabled ? 1 : .55}"><div class="node-accent"></div><div class="node-top">${mark}<span class="status-badge ${node.level === '전문 검수' ? 'gold' : ''}">${enabled ? '모집 중' : '일시 중지'}</span></div><div class="node-company">${esc(company.name)} · ${esc(company.category)}</div><div class="node-title">${esc(node.title)}</div><div class="node-copy">${esc(node.copy)}</div><div class="node-bottom"><div class="node-meta"><span>${icon('clock-3', 12)} ${esc(node.minutes)}</span><strong>${money(node.reward)}</strong><span>${node.available}건 남음</span></div><button class="small-button ${enabled ? 'primary' : ''}" data-start-node="${node.id}" ${enabled ? '' : 'disabled'}>${enabled ? '시작하기' : '대기 중'}</button></div></article>`;
  }

  function renderTimeline() {
    const statusLabel = {
      approved: '검수 완료',
      review_pending: '검수 대기',
      submitted: '제출 완료',
      in_progress: '진행 중',
      rework: '재확인 요청',
      rejected: '반려',
      cancelled: '취소'
    };
    const recent = state.history.slice(0, 4);
    if (!recent.length) {
      return `<div class="empty-state compact"><div class="empty-icon">${icon('clipboard-list', 22)}</div><strong>아직 기록된 업무가 없어요.</strong><p>업무를 제출하면 진행·검수·보상 상태가 이곳에 순서대로 표시됩니다.</p></div>`;
    }
    return `<div class="timeline">${recent.map((item) => {
      const node = nodeById(item.nodeId);
      const company = companyById(node.companyId);
      const done = item.status === '검수 완료';
      return `<div class="timeline-item"><div class="timeline-dot ${done ? '' : 'pending'}"></div><div class="timeline-content"><strong>${esc(statusLabel[item.status] || item.status)}</strong><p>${esc(company.name)} · ${esc(node.title)} · ${esc(item.duration)}</p></div><div class="timeline-time">${esc(item.date)}</div></div>`;
    }).join('')}</div>`;
  }

  function renderNodesPage() {
    const grid = nodes.map(renderNodeCard).join('') || `<div class="empty-state compact" style="grid-column:1/-1"><div class="empty-icon">${icon('waypoints',22)}</div><strong>지금 공개된 업무가 없어요.</strong><p>운영자가 협력사와 업무 카드를 승인한 뒤에만 이곳에 나타납니다.</p></div>`;
    return `<div class="section-heading" style="margin-top:0"><div><h1 class="page-title">업무 노드 찾기</h1><p class="page-copy">기업별 데이터 업무를 비교하고, 내게 맞는 작업부터 시작하세요.</p></div><button class="secondary-button" data-action="deposit-info">${icon('wallet', 16)} 이용 조건 안내</button></div><div class="filter-row"><button class="filter-button active" data-filter="all">전체</button><button class="filter-button" data-filter="빠른 확인">1~3분 업무</button><button class="filter-button" data-filter="일반 처리">일반 처리</button><button class="filter-button" data-filter="집중 처리">집중 처리</button><button class="filter-button" data-filter="전문 검수">전문 검수</button></div><section class="node-grid" id="nodeGrid">${grid}</section><div class="notice" style="margin-top:18px"><span style="color:var(--emerald)">${icon('info',17)}</span><div><strong>보상 안내</strong><br>카드의 보상은 검수 완료 후 확정됩니다. 업무 시작 전에 예상시간과 조건을 꼭 확인하세요.</div></div>`;
  }

  function renderHistoryPage() {
    const completed = state.history.filter((item) => item.status === '검수 완료').length;
    const body = state.history.length
      ? state.history.map((item) => {
        const node = nodeById(item.nodeId);
        const company = companyById(node.companyId);
        return `<tr><td><strong>${esc(item.id)}</strong></td><td>${esc(company.name)} · ${esc(node.title)}</td><td>${esc(item.duration)}</td><td><span class="pill ${item.status === '검수 완료' ? 'ok' : 'wait'}">${esc(item.status)}</span></td><td><strong>${money(item.reward)}</strong></td><td>${esc(item.date)}</td></tr>`;
      }).join('')
      : `<tr><td colspan="6"><div class="empty-state compact"><strong>아직 제출한 업무가 없어요.</strong><p>업무를 시작하면 실행번호와 검수 상태가 여기에 쌓입니다.</p></div></td></tr>`;
    return `<div class="section-heading" style="margin-top:0"><div><h1 class="page-title">내 작업내역</h1><p class="page-copy">내가 처리한 업무와 검수·보상 상태를 한눈에 확인해요.</p></div><button class="secondary-button" data-action="export-history">${icon('download',16)} 내역 내려받기</button></div><div class="stat-grid" style="max-width:680px;margin-bottom:18px"><div class="mini-stat"><div class="metric-label">누적 완료</div><div class="num">${completed}건</div><div class="change">검수 완료만 집계</div></div><div class="mini-stat"><div class="metric-label">작업 보상</div><div class="num">${money(state.wallet.task)}</div><div class="change">지갑 서버 잔액</div></div></div><div class="panel"><div class="panel-pad"><div class="table-wrap"><table><thead><tr><th>실행번호</th><th>업무</th><th>처리시간</th><th>상태</th><th>보상</th><th>일시</th></tr></thead><tbody>${body}</tbody></table></div></div></div>`;
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
    state.history.filter((item) => item.status === '검수 완료').forEach((item) => {
      rows.push({
        kind: '작업 보상',
        copy: item.id,
        amount: `+${Number(item.reward || 0).toLocaleString('ko-KR')}원`,
        status: '확정',
        ok: true,
        at: item.createdAt
      });
    });
    return rows.sort((a, b) => Date.parse(b.at || 0) - Date.parse(a.at || 0)).slice(0, 12);
  }

  function renderWalletPage() {
    const rows = walletRows();
    const body = rows.length
      ? rows.map((row) => `<tr><td>${esc(row.kind)}</td><td>${esc(row.copy)}</td><td><strong>${esc(row.amount)}</strong></td><td><span class="pill ${row.ok ? 'ok' : 'wait'}">${esc(row.status)}</span></td><td>${row.at ? new Date(row.at).toLocaleString('ko-KR', { month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit' }) : '-'}</td></tr>`).join('')
      : `<tr><td colspan="5"><div class="empty-state compact"><strong>아직 기록된 입출금이 없어요.</strong><p>잔액은 서버 원장 기준으로만 바뀌며, 화면에서 직접 더하거나 빼지 않습니다.</p></div></td></tr>`;
    return `<div class="section-heading" style="margin-top:0"><div><h1 class="page-title">지갑·입출금</h1><p class="page-copy">지원금, 작업 보상, 추천 보상을 분리해서 확인할 수 있어요.</p></div><div class="action-row"><button class="secondary-button" data-action="open-kyc">본인확인</button><button class="secondary-button" data-action="deposit-info">입금 신청</button><button class="primary-button" data-action="withdraw-info">출금 신청</button></div></div><div class="dashboard-grid"><div class="wallet-card"><div class="eyebrow" style="color:#a8f3d2">${icon('wallet',14)} 출금 가능 잔액</div><div class="wallet-balance">${money(state.wallet.available)}</div><div class="wallet-row"><span class="muted">현재 보류 중</span><strong>${money(state.wallet.held)}</strong></div><div class="wallet-row"><span class="muted">입금 대기</span><strong>${state.deposits.filter((row) => ['submitted', 'checking'].includes(row.status)).length}건</strong></div><div style="margin-top:18px;color:#b7d0c2;font-size:11px;line-height:1.5">출금은 본인확인과 6자리 출금 비밀번호 확인 후 운영자가 수동 처리합니다. 화면에서 잔액을 바꾸지 않아요.</div></div><div class="panel panel-pad"><div class="panel-title">잔액 구성</div><div class="stat-grid" style="margin-top:14px"><div class="mini-stat"><div class="metric-label">업무 지원금</div><div class="num" style="font-size:20px">${money(state.wallet.support)}</div><div class="metric-label" style="margin-top:5px">업무 조건에 따라 사용</div></div><div class="mini-stat"><div class="metric-label">작업 보상</div><div class="num" style="font-size:20px">${money(state.wallet.task)}</div><div class="metric-label" style="margin-top:5px">검수 완료 반영</div></div><div class="mini-stat"><div class="metric-label">추천 보상</div><div class="num" style="font-size:20px">${money(state.wallet.referral)}</div><div class="metric-label" style="margin-top:5px">조건 충족 후 확정</div></div><div class="mini-stat"><div class="metric-label">출금 보류</div><div class="num" style="font-size:20px">${money(state.wallet.held)}</div><div class="metric-label" style="margin-top:5px">확인 중인 금액</div></div></div></div></div><div class="section-heading"><div><h2>최근 지갑 내역</h2><p>입금·출금 신청과 검수 완료 보상만 표시합니다.</p></div></div><div class="panel"><div class="panel-pad"><div class="table-wrap"><table><thead><tr><th>구분</th><th>내용</th><th>금액</th><th>상태</th><th>일시</th></tr></thead><tbody>${body}</tbody></table></div></div></div>`;
  }

  function renderMembershipPage() {
    const tiers = [
      ['일반 파트너', '가입 완료', '기본 노드 이용', '#7b8790'],
      ['인증 파트너', '본인확인 완료', '일반 노드와 작업내역', '#2d8f70'],
      ['우수 파트너', '검수 통과율 95% 이상', '고급 노드와 우선 검수', '#b8862c'],
      ['글로벌 디렉터', '장기 활동·전문 검수', '전문 노드와 전용 배정', '#694b9f']
    ];
    return `<div class="section-heading" style="margin-top:0"><div><h1 class="page-title">멤버십 카드</h1><p class="page-copy">입금액이 아니라 실제 활동과 작업 품질로 등급이 올라갑니다.</p></div><span class="status-badge gold">${icon('sparkles',13)} ${esc(authState.profile?.member_tier || '일반 파트너')}</span></div><div class="id-card" style="max-width:620px;margin-bottom:22px"><div class="id-card-top"><div><div class="id-card-kicker">퍼뜩 멤버십 카드</div><div class="id-card-title">${esc(authState.profile?.member_tier || '우수 파트너')}</div></div><div class="id-chip"></div></div><div class="id-number">${esc(publicId())}</div><div class="id-footer"><span>${esc(profileName())}</span><span>${authState.session ? '인증 계정' : '가입 전 카드'}</span></div></div><section class="node-grid">${tiers.map((tier, index) => `<article class="node-card" style="--node-color:${tier[3]};min-height:190px"><div class="node-top"><div class="company-mark" style="background:${tier[3]}">${index + 1}</div><span class="status-badge ${index === 2 ? 'gold' : ''}">${index < 3 ? '현재·달성' : '다음 단계'}</span></div><div class="node-company">멤버십 등급</div><div class="node-title">${tier[0]}</div><div class="node-copy">${tier[1]}</div><div class="node-bottom"><div class="node-meta"><strong style="font-size:12px">${tier[2]}</strong></div></div></article>`).join('')}</section>`;
  }

  function renderReferralsPage() {
    const rows = Array.isArray(state.referrals) ? state.referrals : [];
    const paid = rows.filter((row) => row.status === 'paid').length;
    const pending = rows.filter((row) => !['paid', 'rejected'].includes(row.status)).length;
    const timeline = rows.length
      ? rows.map((row) => `<div class="timeline-item"><div class="timeline-dot ${row.status === 'paid' ? '' : 'pending'}"></div><div class="timeline-content"><strong>${esc(row.label)}</strong><p>${esc(referralStatusLabel(row.status))} · 입금·업무 여부는 서버 상태값으로만 표시합니다.</p></div><div class="timeline-time">${row.status === 'paid' ? '+5,000원' : referralStatusLabel(row.status)}</div></div>`).join('')
      : `<div class="empty-state compact"><strong>아직 추천한 회원이 없어요.</strong><p>추천 코드로 가입한 회원이 생기면 단계가 여기에 나타납니다.</p></div>`;
    return `<div class="section-heading" style="margin-top:0"><div><h1 class="page-title">추천인 혜택</h1><p class="page-copy">추천한 회원의 가입·인증·업무 완료 상태를 단계별로 확인해요.</p></div><button class="primary-button" data-action="copy-referral">${icon('copy',16)} 추천 코드 복사</button></div><div class="grid-hero"><div class="hero-card" style="min-height:220px"><div class="eyebrow"><span class="pulse-dot"></span> 내 추천 코드</div><div style="display:flex;align-items:center;gap:13px;margin-top:18px"><div style="font-size:34px;font-weight:900;letter-spacing:.08em">${esc(referralCode())}</div><button class="icon-button" data-action="copy-referral">${icon('copy',16)}</button></div><p class="hero-copy" style="margin-top:14px">초대한 회원이 실제 입금과 유효한 업무를 완료하고 검수를 통과하면 추천 보상이 확정됩니다.</p></div><div class="panel panel-pad"><div class="panel-title">추천 보상 현황</div><div class="wallet-balance" style="color:var(--text);margin:12px 0 18px">${money(state.wallet.referral)}</div><div class="wallet-row"><span>초대한 회원</span><strong>${rows.length}명</strong></div><div class="wallet-row"><span>조건 확인 중</span><strong>${pending}명</strong></div><div class="wallet-row"><span>보상 확정</span><strong>${paid}명</strong></div></div></div><div class="panel"><div class="panel-head"><div><div class="panel-title">추천 회원 단계</div><div class="panel-subtitle">개인정보는 보호된 상태로 표시됩니다.</div></div></div><div class="timeline">${timeline}</div></div>`;
  }

  function renderSupportPage() {
    return `<div class="section-heading" style="margin-top:0"><div><h1 class="page-title">도움말</h1><p class="page-copy">처음 접속한 분도 업무 과정을 쉽게 이해할 수 있도록 안내해요.</p></div></div><div class="dashboard-grid"><div class="panel panel-pad"><div class="panel-title">퍼뜩 업무는 이렇게 진행돼요</div><div class="timeline" style="padding:20px 0 0"><div class="timeline-item"><div class="timeline-dot"></div><div class="timeline-content"><strong>1. 노드 선택</strong><p>기업과 업무 내용을 보고 원하는 노드를 선택해요.</p></div></div><div class="timeline-item"><div class="timeline-dot"></div><div class="timeline-content"><strong>2. 데이터 확인</strong><p>화면에 표시된 데이터 조각을 직접 비교하고 분류해요.</p></div></div><div class="timeline-item"><div class="timeline-dot"></div><div class="timeline-content"><strong>3. 제출과 검수</strong><p>제출한 내용은 자동검사와 운영 검수를 거쳐요.</p></div></div><div class="timeline-item"><div class="timeline-dot pending"></div><div class="timeline-content"><strong>4. 보상 확정</strong><p>검수 완료 후 작업 보상이 잔액에 반영돼요.</p></div></div></div></div><div class="panel panel-pad"><div class="panel-title">자주 묻는 질문</div><div style="display:flex;flex-direction:column;gap:10px;margin-top:15px"><button class="secondary-button" style="justify-content:space-between;width:100%" data-action="faq">화면을 닫으면 작업이 멈추나요? ${icon('chevron-down',15)}</button><button class="secondary-button" style="justify-content:space-between;width:100%" data-action="faq">보상은 언제 확정되나요? ${icon('chevron-down',15)}</button><button class="secondary-button" style="justify-content:space-between;width:100%" data-action="faq">출금은 어떻게 신청하나요? ${icon('chevron-down',15)}</button></div></div></div>`;
  }

  function renderMemberPage() {
    if (state.memberPage === 'nodes') return renderNodesPage();
    if (state.memberPage === 'history') return renderHistoryPage();
    if (state.memberPage === 'wallet') return renderWalletPage();
    if (state.memberPage === 'membership') return renderMembershipPage();
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
        <td><span class="pill ${ok ? 'ok' : 'wait'}">${esc(memberStatusLabel(status))}</span></td>
        <td><div class="action-row"><button class="small-button" data-action="member-detail" data-member-id="${memberId}">자세히</button><button class="small-button primary" data-action="member-credit" data-member-id="${memberId}">잔액 입금</button><button class="small-button" data-action="member-debit" data-member-id="${memberId}">잔액 차감</button></div></td>
      </tr>`;
    }).join('');
    const body = rows || `<tr><td colspan="10"><div class="empty-state compact"><div class="empty-icon">${icon('users',22)}</div><strong>${state.adminMembersLoading ? '회원 정보를 불러오고 있어요.' : '표시할 회원이 없어요.'}</strong><p>검색은 회원번호·이름·이메일·휴대폰을 기준으로 합니다.</p></div></td></tr>`;
    return `<div class="section-heading" style="margin-top:0"><div><h1 class="page-title">회원 관리</h1><p class="page-copy">가입 정보와 작업 활동을 확인하고 필요한 조치를 할 수 있어요.</p></div><button class="secondary-button" data-action="refresh-members" ${state.adminMembersLoading ? 'disabled' : ''}>${icon('refresh-cw',16)} ${state.adminMembersLoading ? '불러오는 중…' : '새로고침'}</button></div>${error}<div class="admin-card"><form id="memberSearchForm" class="search-bar"><input id="memberSearchInput" value="${esc(state.adminMemberQuery || '')}" placeholder="회원번호, 이름, 이메일, 휴대폰" /><button class="small-button primary" type="submit">찾기</button></form><div class="filter-row"><button class="filter-button ${filter === 'all' ? 'active' : ''}" data-member-filter="all">전체${state.adminMembersContract ? ` ${state.adminMemberTotal}` : ''}</button><button class="filter-button ${filter === 'active' ? 'active' : ''}" data-member-filter="active">활동 중</button><button class="filter-button ${filter === 'pending' ? 'active' : ''}" data-member-filter="pending">확인 중</button><button class="filter-button ${filter === 'blocked' ? 'active' : ''}" data-member-filter="blocked">차단</button></div><div class="table-wrap"><table><thead><tr><th>회원번호</th><th>이름</th><th>이메일</th><th>휴대폰</th><th>등급</th><th>최근 접속</th><th>IP</th><th>잔액</th><th>상태</th><th></th></tr></thead><tbody>${body}</tbody></table></div></div>`;
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
      const label = action === 'approve' ? '자료·로고 승인' : action === 'publish' ? '회원 공개' : '회원 비공개';
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

  function renderAdminSettings() {
    const campaign = state.adminCampaigns[0] || {};
    const contractNote = state.adminCampaignsContract === false
      ? `<p class="contract-note">지원금 캠페인 저장 계약(<code>list_campaigns</code>, <code>update_campaign</code>)이 아직 없습니다. 브라우저에만 저장하지 않으며, 서버 응답이 있을 때만 반영합니다.</p>`
      : '';
    return `<div class="section-heading" style="margin-top:0"><div><h1 class="page-title">운영 설정</h1><p class="page-copy">처음 가입한 회원에게 제공하는 조건과 하루 작업량을 설정합니다.</p></div><button class="primary-button" data-action="save-settings">설정 저장</button></div>${contractNote}<div class="admin-card"><div class="admin-card-head"><div><h3>신규 회원 업무 지원금</h3><p>기존 지급 기록은 변경하지 않고, 앞으로 가입하는 회원에게만 적용됩니다.</p></div><span class="pill ${campaign.enabled === false ? 'wait' : 'ok'}">${campaign.enabled === false ? '중지' : '사용 중'}</span></div><div class="form-grid"><div class="field"><label>기본 지급 금액</label><input id="supportGrantInput" type="number" value="${Number(campaign.amount ?? state.supportGrant)}" min="0" step="1000" /></div><div class="field"><label>지급 시점</label><select id="supportTriggerInput"><option value="signup" ${campaign.trigger_type === 'signup' ? 'selected' : ''}>가입 완료 후</option><option value="email_verified" ${campaign.trigger_type === 'email_verified' ? 'selected' : ''}>이메일 인증 후</option><option value="phone_verified" ${campaign.trigger_type === 'phone_verified' ? 'selected' : ''}>휴대폰 인증 후</option><option value="kyc_approved" ${campaign.trigger_type === 'kyc_approved' ? 'selected' : ''}>본인확인 완료 후</option></select></div><div class="field"><label>사용 범위</label><select id="supportScopeInput"><option value="work_only" ${campaign.usage_scope === 'work_only' ? 'selected' : ''}>업무 전용</option><option value="withdrawable" ${campaign.usage_scope === 'withdrawable' ? 'selected' : ''}>출금 가능</option></select></div><div class="field"><label>유효기간(일)</label><input id="supportExpireInput" type="number" min="0" value="${Number(campaign.expires_in_days || 0)}" /></div><div class="field"><label>캠페인 상태</label><select id="supportEnabledInput"><option value="true" ${campaign.enabled !== false ? 'selected' : ''}>활성화</option><option value="false" ${campaign.enabled === false ? 'selected' : ''}>중지</option></select></div><div class="field full"><label>회원에게 보여줄 안내</label><textarea id="supportCopyInput" rows="3">가입을 환영해요. 업무를 시작하는 데 사용할 수 있는 지원금입니다.</textarea></div></div></div>`;
  }

  function renderAdminGate() {
    const waiting = authState.loading || authState.adminLoading;
    const title = waiting ? '운영자 권한을 확인하고 있어요' : authState.session ? '운영자 권한이 없어요' : '운영자 로그인이 필요해요';
    const copy = waiting
      ? '잠시만 기다려 주세요. 안전한 운영자 확인을 진행하고 있어요.'
      : authState.session
        ? '이 계정에는 운영자 권한이 연결돼 있지 않습니다.'
        : '운영자 계정으로 로그인하면 회원·업무·입출금 메뉴가 열립니다.';
    return `<section class="empty-state" style="max-width:640px;margin:80px auto;text-align:center"><div class="empty-icon">${icon(waiting ? 'loader-circle' : 'shield-alert', 28)}</div><h1 class="page-title">${title}</h1><p class="page-copy" style="margin:12px auto 22px">${copy}</p>${!authState.session && !waiting ? '<button class="primary-button" data-action="open-login">운영자 로그인</button>' : ''}${authState.session && !waiting ? '<button class="secondary-button" data-action="logout" style="margin-left:8px">로그아웃</button>' : ''}</section>`;
  }

  function renderAdminPage() {
    if (state.adminPage === 'members') return renderAdminMembers();
    if (state.adminPage === 'companies') return renderAdminCompanies();
    if (state.adminPage === 'nodes') return renderAdminNodes();
    if (state.adminPage === 'reviews') return renderAdminReviews();
    if (state.adminPage === 'finance') return renderAdminFinance();
    if (state.adminPage === 'notifications') return renderAdminNotifications();
    if (state.adminPage === 'settings') return renderAdminSettings();
    return renderAdminOverview();
  }

  function renderRunOverlay() {
    if (!state.run || !state.run.overlayOpen) return '';
    const node = nodeById(state.run.nodeId);
    const company = companyById(node.companyId);
    const progress = Math.min(1, Math.max(0, state.run.progress || 0));
    const scene = motionSceneCopy(node, progress);
    return `<div class="modal-backdrop"><div class="modal motion-modal"><div class="motion-stage"><canvas id="motionCanvas"></canvas><div class="motion-vignette"></div><div class="motion-ui"><div class="motion-top"><div><div class="motion-kicker">${esc(company.name)} · ${esc(node.level)}</div><div class="motion-title">${esc(node.title)}</div></div><div class="motion-live"><span class="pulse-dot" style="background:#80efc1"></span> 노드 실행 중</div></div><div class="motion-center"><div class="motion-core"><div class="motion-percent" id="motionPercent">${Math.round(progress * 100)}%<small>처리 진행률</small></div></div></div><div class="motion-bottom"><div><div class="motion-stage-label" id="motionStageLabel">${esc(scene.label)}</div><div class="motion-stage-copy" id="motionStageCopy">${esc(scene.copy)}</div><div class="progress-track"><div class="progress-fill" id="motionProgress" style="width:${progress * 100}%"></div></div></div><div class="motion-log" id="motionLog">${(state.run.logs || []).slice(-5).map((log) => `<div>${esc(log)}</div>`).join('')}</div></div><div style="display:flex;justify-content:flex-end;gap:9px;margin-top:16px"><button class="secondary-button" data-action="close-run" style="color:#effff8;border-color:rgba(255,255,255,.2);background:rgba(255,255,255,.08)">${progress > .98 ? '닫기' : '화면 닫기'}</button></div></div></div></div></div>`;
  }

  function renderAuthModal() {
    return `<div class="modal-backdrop" data-modal="auth"><div class="modal"><div class="modal-head"><div><h2>퍼뜩 회원가입</h2><p>간단한 정보로 나만의 노드 카드를 발급해요.</p></div><button class="icon-button" data-action="close-modal" aria-label="닫기">${icon('x',18)}</button></div><div class="modal-body"><form id="signupForm"><div class="form-grid"><div class="field"><label for="signupName">이름</label><input id="signupName" required placeholder="실명을 입력해 주세요" /></div><div class="field"><label for="signupBirth">생년월일</label><input id="signupBirth" required inputmode="numeric" placeholder="예: 900101" /></div><div class="field"><label for="signupEmail">이메일</label><div style="display:flex;gap:7px"><input id="signupEmail" required type="email" placeholder="name@example.com" style="min-width:0" /><button class="small-button" type="button" data-action="email-check">중복확인</button></div></div><div class="field"><label for="signupPhone">휴대폰번호</label><input id="signupPhone" required inputmode="tel" placeholder="010-0000-0000" /></div><div class="field"><label for="signupPassword">비밀번호</label><input id="signupPassword" required type="password" minlength="8" placeholder="8자 이상 입력" /></div><div class="field"><label for="signupPasswordConfirm">비밀번호 확인</label><input id="signupPasswordConfirm" required type="password" minlength="8" placeholder="한 번 더 입력" /></div><div class="field full"><label for="signupReferral">추천인 코드 <span style="font-weight:500;color:var(--muted)">(선택)</span></label><input id="signupReferral" placeholder="추천인 코드가 있으면 입력해 주세요" /></div></div><label class="check-row"><input type="checkbox" required /> <span>필수 약관과 개인정보 수집 안내를 확인하고 동의합니다.</span></label><label class="check-row"><input type="checkbox" /> <span>작업 상태와 서비스 안내 알림을 받습니다. (선택)</span></label><div class="notice" style="margin-top:16px"><span style="color:var(--gold)">${icon('info',17)}</span><div>가입 후 이메일 인증을 완료하면 회원 계정과 고유 카드가 활성화됩니다. 인증 상태에 따라 일부 기능이 제한될 수 있어요.</div></div><div class="modal-actions"><button class="secondary-button" type="button" data-action="close-modal">나중에 하기</button><button class="primary-button" type="submit">회원가입하고 카드 발급</button></div></form></div></div></div>`;
  }

  function renderAuthModalLive() {
    const isLogin = state.authMode === 'login';
    const connectionCopy = supabaseClient
      ? '가입 버튼을 누르면 안전한 인증 서버에 계정이 만들어지고, 이메일 인증 설정에 따라 확인 메일이 발송됩니다.'
      : '이메일 인증을 완료하면 회원 계정이 안전하게 활성화됩니다.';
    if (isLogin) return `<div class="modal-backdrop" data-modal="auth"><div class="modal auth-modal"><div class="modal-head"><div><h2>퍼뜩 로그인</h2><p>내 작업내역과 멤버십 카드를 이어서 확인해요.</p></div><button class="icon-button" data-action="close-modal" aria-label="닫기">${icon('x',18)}</button></div><div class="auth-tabs"><button type="button" class="active" data-auth-mode="login">로그인</button><button type="button" data-auth-mode="signup">회원가입</button></div><div class="modal-body"><form id="loginForm"><div class="field"><label for="loginEmail">이메일</label><input id="loginEmail" required type="email" autocomplete="email" placeholder="name@example.com" /></div><div class="field" style="margin-top:13px"><label for="loginPassword">비밀번호</label><input id="loginPassword" required type="password" autocomplete="current-password" placeholder="비밀번호를 입력해 주세요" /></div><div class="modal-actions"><button class="secondary-button" type="button" data-action="forgot-password">비밀번호 재설정</button><button class="primary-button" type="submit">로그인</button></div><div class="notice" style="margin-top:14px"><span style="color:var(--gold)">${icon('shield-check',17)}</span><div>${connectionCopy}</div></div></form></div></div></div>`;
    return `<div class="modal-backdrop" data-modal="auth"><div class="modal auth-modal"><div class="modal-head"><div><h2>퍼뜩 회원가입</h2><p>간단한 정보로 나만의 노드 카드를 발급해요.</p></div><button class="icon-button" data-action="close-modal" aria-label="닫기">${icon('x',18)}</button></div><div class="auth-tabs"><button type="button" class="active" data-auth-mode="signup">회원가입</button><button type="button" data-auth-mode="login">이미 계정이 있어요</button></div><div class="modal-body"><form id="signupForm"><div class="form-grid"><div class="field"><label for="signupName">이름</label><input id="signupName" required autocomplete="name" placeholder="실명을 입력해 주세요" /></div><div class="field"><label for="signupBirth">생년월일 6자리</label><input id="signupBirth" required inputmode="numeric" pattern="[0-9]{6}" maxlength="6" placeholder="예: 900101" /></div><div class="field"><label for="signupEmail">이메일</label><div style="display:flex;gap:7px"><input id="signupEmail" required type="email" autocomplete="email" placeholder="name@example.com" style="min-width:0" /><button class="small-button" type="button" data-action="email-check">형식 확인</button></div></div><div class="field"><label for="signupPhone">휴대폰번호</label><input id="signupPhone" required inputmode="tel" autocomplete="tel" placeholder="010-0000-0000" /></div><div class="field"><label for="signupPassword">비밀번호</label><input id="signupPassword" required type="password" autocomplete="new-password" minlength="8" placeholder="8자 이상 입력" /></div><div class="field"><label for="signupPasswordConfirm">비밀번호 확인</label><input id="signupPasswordConfirm" required type="password" autocomplete="new-password" minlength="8" placeholder="한 번 더 입력" /></div><div class="field full"><label for="signupReferral">추천인 코드 <span style="font-weight:500;color:var(--muted)">(선택)</span></label><input id="signupReferral" placeholder="추천인 코드가 있으면 입력해 주세요" /></div></div><label class="check-row"><input id="signupTerms" type="checkbox" required /> <span>필수 <button type="button" class="text-link inline-link" data-action="open-terms">이용약관</button>과 <button type="button" class="text-link inline-link" data-action="open-privacy">개인정보 안내</button>를 확인하고 동의합니다.</span></label><label class="check-row"><input id="signupMarketing" type="checkbox" /> <span>작업 상태와 서비스 안내 알림을 받습니다. (선택)</span></label><div class="notice" style="margin-top:16px"><span style="color:var(--gold)">${icon('info',17)}</span><div>${connectionCopy}</div></div><div class="modal-actions"><button class="secondary-button" type="button" data-action="close-modal">나중에 하기</button><button class="primary-button" type="submit">회원가입하고 카드 발급</button></div></form></div></div></div>`;
  }

  function renderLegalModal(kind) {
    const isPrivacy = kind === 'privacy';
    return `<div class="modal-backdrop" data-modal="legal"><div class="modal legal-modal"><div class="modal-head"><div><h2>${isPrivacy ? '개인정보 수집·이용 안내' : '퍼뜩 이용약관'}</h2><p>버전 2026.09.16 · 가입 전에 내용을 확인해 주세요.</p></div><button class="icon-button" data-action="close-modal" aria-label="닫기">${icon('x',18)}</button></div><div class="modal-body legal-copy">${isPrivacy ? '<h3>수집 항목</h3><p>가입 시 이름, 생년월일 입력값, 이메일, 휴대폰번호를 받습니다. 업무·출금 기능을 사용할 때 추가 본인확인 자료가 별도 요청될 수 있습니다.</p><h3>이용 목적</h3><p>회원 계정 생성, 작업내역 제공, 고객 문의 응대, 부정 이용 방지와 운영 기록 보관에 사용합니다.</p><h3>보관 및 열람</h3><p>필요한 기간 동안 보호된 저장소에 보관하며, 운영자 권한에 따라 접근을 기록합니다. 화면에 표시되는 정보는 최소화합니다.</p>' : '<h3>서비스 이용</h3><p>퍼뜩은 공개된 업무 조건에 따라 데이터 확인 작업을 제공하며, 제출 내용은 자동검사와 운영 검수를 거칩니다.</p><h3>보상 기준</h3><p>카드에 표시된 금액은 예상 보상이며, 실제 보상은 작업 결과와 검수 완료 후 확정됩니다. 입금만으로 수익이 발생한다고 안내하지 않습니다.</p><h3>계정 보호</h3><p>본인 계정의 비밀번호와 인증 수단을 안전하게 보관해야 합니다. 이상 활동이 확인되면 작업·출금이 일시 제한될 수 있습니다.</p>'}<div class="modal-actions"><button class="primary-button" data-action="close-modal">확인했어요</button></div></div></div></div>`;
  }

  function renderInfoModal(kind) {
    if (kind === 'deposit') return `<div class="modal-backdrop" data-modal="info"><div class="modal"><div class="modal-head"><div><h2>입금 확인 요청</h2><p>운영자가 입금 내역을 확인한 뒤에만 잔액이 반영됩니다.</p></div><button class="icon-button" data-action="close-modal">${icon('x',18)}</button></div><div class="modal-body"><form id="depositForm"><div class="notice"><span style="color:var(--emerald)">${icon('wallet',17)}</span><div>원화 계좌 또는 USDT 주소로 보낸 뒤 금액과 증빙을 남겨 주세요. 화면에서 잔액을 올리지 않습니다.</div></div><div class="form-grid" style="margin-top:16px"><div class="field"><label for="depositAmount">입금 금액</label><input id="depositAmount" name="amount" type="number" min="1" step="1" required placeholder="입금한 금액" /></div><div class="field"><label for="depositCurrency">통화</label><select id="depositCurrency" name="currency"><option value="KRW">원화</option><option value="USDT">USDT</option></select></div><div class="field"><label for="depositBank">은행명 / 네트워크</label><input id="depositBank" name="bank" placeholder="예: 국민은행 또는 TRC20" /></div><div class="field"><label for="depositHolder">예금주 / 보낸 주소</label><input id="depositHolder" name="holder" placeholder="예금주 또는 지갑 주소" /></div><div class="field full"><label for="depositProof">증빙 파일 경로 또는 URL</label><input id="depositProof" name="proof" placeholder="운영자가 확인할 증빙 위치" /></div><div class="field full"><label for="depositNote">안내 메모</label><textarea id="depositNote" name="note" rows="2" placeholder="입금 시각, 거래번호 등"></textarea></div></div><div class="modal-actions"><button class="secondary-button" type="button" data-action="close-modal">취소</button><button class="primary-button" type="submit">입금 확인 요청</button></div></form></div></div></div>`;
    return `<div class="modal-backdrop" data-modal="info"><div class="modal"><div class="modal-head"><div><h2>출금 신청</h2><p>본인확인과 6자리 출금 비밀번호를 확인한 뒤 운영자가 처리합니다.</p></div><button class="icon-button" data-action="close-modal">${icon('x',18)}</button></div><div class="modal-body"><form id="withdrawForm"><div class="notice"><span style="color:var(--gold)">${icon('shield-check',17)}</span><div>출금 가능 잔액 ${money(state.wallet.available)}. 비밀번호는 화면에 남기지 않고 서버 확인용으로만 보냅니다.</div></div><div class="form-grid" style="margin-top:16px"><div class="field"><label for="withdrawAmount">출금 금액</label><input id="withdrawAmount" name="amount" type="number" min="1" step="1" required placeholder="출금할 금액" /></div><div class="field"><label for="withdrawMethod">출금 방식</label><select id="withdrawMethod" name="destination_type"><option value="bank">원화 계좌</option><option value="usdt">USDT 지갑</option></select></div><div class="field full"><label for="withdrawDest">은행계좌 또는 USDT 주소</label><input id="withdrawDest" name="destination" required placeholder="계좌번호 또는 지갑 주소" /></div><div class="field full"><label for="withdrawPin">출금 비밀번호 6자리</label><input id="withdrawPin" name="pin" type="password" inputmode="numeric" maxlength="6" pattern="[0-9]{6}" required placeholder="••••••" /></div></div><div class="modal-actions"><button class="secondary-button" type="button" data-action="close-modal">취소</button><button class="primary-button" type="submit">출금 요청 만들기</button></div></form></div></div></div>`;
  }

  function renderKycModal() {
    return `<div class="modal-backdrop" data-modal="kyc"><div class="modal"><div class="modal-head"><div><h2>본인확인 자료 제출</h2><p>신분증 앞면·뒷면·셀카를 올리면 운영자가 검수합니다.</p></div><button class="icon-button" data-action="close-modal">${icon('x',18)}</button></div><div class="modal-body"><form id="kycForm"><div class="notice"><span style="color:var(--gold)">${icon('file-lock-2',17)}</span><div>원본 파일 주소는 회원 화면에 공개하지 않습니다. 짧은 확인 주소만 운영자가 봅니다.</div></div><div class="kyc-slots" style="margin-top:16px"><label class="kyc-slot">신분증 앞면<input type="file" id="kycFront" accept="image/*" /></label><label class="kyc-slot">신분증 뒷면<input type="file" id="kycBack" accept="image/*" /></label><label class="kyc-slot">셀카<input type="file" id="kycSelfie" accept="image/*" /></label></div><div class="modal-actions"><button class="secondary-button" type="button" data-action="close-modal">나중에</button><button class="primary-button" type="submit">검수 요청</button></div></form></div></div></div>`;
  }

  function renderNotificationsModal() {
    const items = (state.notifications || []).map((item) => `<div class="company-row"><div class="company-logo" style="background:var(--emerald)">${icon('bell',16)}</div><div class="company-info"><strong>${esc(item.text)}</strong><small>${esc(item.time)}</small></div></div>`).join('')
      || `<div class="empty-state compact"><strong>새 알림이 없어요.</strong></div>`;
    return `<div class="modal-backdrop" data-modal="alerts"><div class="modal"><div class="modal-head"><div><h2>알림</h2><p>서버에 저장된 안내만 보여줍니다.</p></div><button class="icon-button" data-action="close-modal">${icon('x',18)}</button></div><div class="modal-body">${items}</div></div></div>`;
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
    const copy = direction === 'debit'
      ? '출금 가능 잔액에서 서버 원장을 통해 차감합니다. 화면에서 숫자를 빼지 않습니다.'
      : '출금 가능 잔액에 서버 원장을 통해 입금합니다. 화면에서 숫자를 더하지 않습니다.';
    const wallet = member.wallet || {};
    return `<div class="modal-backdrop" data-modal="balance-adjust"><div class="modal"><div class="modal-head"><div><h2>${title}</h2><p>${esc(member.public_id || member.display_name || '회원')}</p></div><button class="icon-button" data-action="close-modal" aria-label="닫기">${icon('x',18)}</button></div><div class="modal-body"><form id="balanceAdjustForm"><input type="hidden" name="user_id" value="${esc(member.id || member.user_id || '')}" /><input type="hidden" name="direction" value="${esc(direction)}" /><div class="notice"><span style="color:var(--emerald)">${icon('wallet',17)}</span><div>${copy}<br>현재 출금 가능 잔액 <strong>${money(wallet.available)}</strong></div></div><div class="form-grid" style="margin-top:16px"><div class="field"><label for="adjustAmount">금액</label><input id="adjustAmount" name="amount" type="number" min="1" step="1" required placeholder="1 이상" /></div><div class="field"><label for="adjustCurrency">통화</label><select id="adjustCurrency" name="currency"><option value="KRW">원화</option></select></div><div class="field full"><label for="adjustReason">사유</label><textarea id="adjustReason" name="reason" rows="2" required maxlength="500" placeholder="운영 기록에 남길 사유"></textarea></div></div><div class="modal-actions"><button class="secondary-button" type="button" data-action="close-modal">취소</button><button class="primary-button" type="submit">${title}</button></div></form></div></div></div>`;
  }

  function renderMemberDetailModal() {
    const member = state.modalPayload || state.adminMemberDetail || {};
    const wallet = member.wallet || {};
    return `<div class="modal-backdrop" data-modal="member-detail"><div class="modal"><div class="modal-head"><div><h2>회원 상세</h2><p>${esc(member.public_id || '회원번호 확인 중')}</p></div><button class="icon-button" data-action="close-modal">${icon('x',18)}</button></div><div class="modal-body"><div class="detail-list"><div><span>이름</span><strong>${esc(displayText(member.display_name))}</strong></div><div><span>이메일</span><strong>${esc(displayText(member.email))}</strong></div><div><span>휴대폰</span><strong>${esc(displayText(member.phone || member.phone_e164))}</strong></div><div><span>등급</span><strong>${esc(displayText(member.member_tier))}</strong></div><div><span>상태</span><strong>${esc(memberStatusLabel(member.status || 'pending'))}</strong></div><div><span>가입일</span><strong>${esc(displayTime(member.created_at))}</strong></div><div><span>최근 접속</span><strong>${esc(displayTime(member.last_login_at))}</strong></div><div><span>IP</span><strong>${esc(displayText(member.last_login_ip))}</strong></div><div><span>본인확인</span><strong>${esc(kycStatusLabel(member.kyc_status))}</strong></div><div><span>추천 수</span><strong>${Number(member.referral_count || 0)}</strong></div><div><span>출금 가능</span><strong>${money(wallet.available)}</strong></div><div><span>보류</span><strong>${money(wallet.held)}</strong></div></div><div class="action-row" style="margin-top:16px"><button class="small-button primary" data-action="member-credit" data-member-id="${esc(member.id || member.user_id || '')}">잔액 입금</button><button class="small-button" data-action="member-debit" data-member-id="${esc(member.id || member.user_id || '')}">잔액 차감</button><button class="small-button" data-action="member-block" data-member-id="${esc(member.id || member.user_id || '')}" data-member-status="blocked">차단</button><button class="small-button" data-action="member-block" data-member-id="${esc(member.id || member.user_id || '')}" data-member-status="active">차단 해제</button><button class="small-button" data-action="member-tier" data-member-id="${esc(member.id || member.user_id || '')}">등급 변경</button><button class="small-button" data-action="member-reset" data-member-id="${esc(member.id || member.user_id || '')}">비밀번호 재설정</button><button class="small-button primary" data-action="assign-task" data-member-id="${esc(member.id || member.user_id || '')}">업무 배정</button><button class="small-button" data-action="target-notice" data-member-id="${esc(member.id || member.user_id || '')}">알림</button></div></div></div></div>`;
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
    if (state.modal === 'auth') return renderAuthModalLive();
    if (state.modal === 'terms') return renderLegalModal('terms');
    if (state.modal === 'privacy') return renderLegalModal('privacy');
    if (state.modal === 'deposit') return renderInfoModal('deposit');
    if (state.modal === 'withdraw') return renderInfoModal('withdraw');
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

  function renderAppShell() {
    const page = isAdmin && !authState.adminAuthorized ? renderAdminGate() : isAdmin ? renderAdminPage() : renderMemberPage();
    const sidebar = isAdmin && !authState.adminAuthorized ? '' : renderSidebar();
    return `<div class="app-shell">${sidebar}<main class="main"><div>${renderTopbar()}${page}</div></main></div>`;
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
      '출금 가능': money(wallet.available),
      '보류': money(wallet.held)
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

  function render() {
    document.documentElement.dataset.theme = state.theme;
    const app = document.getElementById('app');
    if (!app) return;
    const existingType = app.querySelector('[data-modal]')?.getAttribute('data-modal');
    if (state.modal === 'member-detail' && existingType === 'member-detail') {
      const oldShell = app.querySelector('.app-shell');
      if (oldShell) {
        const box = document.createElement('div');
        box.innerHTML = renderAppShell();
        if (box.firstElementChild) oldShell.replaceWith(box.firstElementChild);
      }
      patchMemberDetailModal(state.modalPayload || state.adminMemberDetail);
      refreshIcons();
      if (!isAdmin && state.memberPage === 'dashboard') drawMemberChart();
      if (isAdmin && state.adminPage === 'overview') drawAdminChart();
      if (state.toast) {
        const pendingToast = state.toast;
        state.toast = null;
        showToast(pendingToast.text, pendingToast.kind, true);
      }
      return;
    }
    app.innerHTML = `${renderAppShell()}<div class="toast-stack" id="toastStack" aria-live="polite" aria-relevant="additions" role="status"></div>${renderRunOverlay()}${renderModal()}`;
    refreshIcons();
    if (!isAdmin && state.memberPage === 'dashboard') drawMemberChart();
    if (isAdmin && state.adminPage === 'overview') drawAdminChart();
    if (state.run && state.run.overlayOpen) requestAnimationFrame(() => { drawMotionCanvas(); if (!runFrame) runFrame = requestAnimationFrame(tickRun); });
    if (state.toast) {
      const pendingToast = state.toast;
      state.toast = null;
      showToast(pendingToast.text, pendingToast.kind, true);
    }
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
        if (item.status !== '검수 완료' || !item.createdAt) return total;
        const created = new Date(item.createdAt);
        return created.toDateString() === day.toDateString() ? total + Number(item.reward || 0) : total;
      }, 0);
      data.push(sum);
    }
    return { labels, data };
  }

  function drawMemberChart() {
    const canvas = document.getElementById('earningsChart');
    if (!canvas || !window.Chart) return;
    if (chartInstance) chartInstance.destroy();
    const week = weekEarnings();
    chartInstance = new Chart(canvas, { type: 'line', data: { labels: week.labels, datasets: [{ data: week.data, borderColor: '#0d9f76', backgroundColor: 'rgba(13,159,118,.12)', fill: true, tension: .42, pointRadius: 3, pointBackgroundColor: '#0d9f76', pointBorderWidth: 0 }] }, options: { responsive: true, maintainAspectRatio: false, plugins: { legend: { display:false }, tooltip: { displayColors:false, callbacks:{ label:(ctx)=>` ${Number(ctx.parsed.y).toLocaleString('ko-KR')}원` } } }, scales:{ x:{ grid:{display:false}, ticks:{color:'#7d8c86',font:{size:11}} }, y:{ grid:{color:'rgba(120,140,130,.12)'}, ticks:{color:'#7d8c86',font:{size:10},callback:(value)=>`${Math.round(value/1000)}k`} } } } });
  }

  function drawAdminChart() {
    const canvas = document.getElementById('adminChart');
    if (!canvas || !window.Chart) return;
    if (chartInstance) chartInstance.destroy();
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
    chartInstance = new Chart(canvas, { type: 'bar', data: { labels, datasets:[{label:'검수 완료',data:done,backgroundColor:'rgba(13,159,118,.75)',borderRadius:8},{label:'검수 대기',data:wait,backgroundColor:'rgba(193,138,45,.72)',borderRadius:8}]}, options:{responsive:true,maintainAspectRatio:false,plugins:{legend:{position:'bottom',labels:{color:'#7d8c86',boxWidth:10,font:{size:11}}}},scales:{x:{grid:{display:false},ticks:{color:'#7d8c86'}},y:{grid:{color:'rgba(120,140,130,.12)'},ticks:{color:'#7d8c86'}}}}});
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
    if (stack.children.length >= 3) stack.firstElementChild?.remove();
    stack.appendChild(toast);
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
    return '업무를 시작하거나 제출하지 못했어요. 잠시 후 다시 시도해 주세요.';
  }

  async function startNode(nodeId) {
    if (state.run) { state.run.overlayOpen = true; render(); return; }
    const node = nodeById(nodeId);

    if (!authState.session) {
      openModal('auth');
      showToast('로그인하면 공개된 업무를 시작할 수 있어요.', 'info');
      return;
    }

    if (authState.session && config.enableWorkApi === true) {
      if (!supabaseClient) {
        showToast('업무 서버가 준비되지 않아 시작할 수 없어요.', 'info');
        return;
      }
      const { data, error } = await supabaseClient
        .from('task_runs')
        .insert({ node_id: nodeId, user_id: authState.session.user.id })
        .select('id,public_id,node_id,status,started_at,expected_completed_at,motion_variant,motion_seed,reward_amount')
        .single();
      if (error || !data) {
        showToast(taskApiErrorMessage(error), 'info');
        return;
      }

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
        progress: Math.min(1, Math.max(0, (Date.now() - startedAt) / duration)),
        overlayOpen: true,
        logs: [
          `[서버] ${node.title} 실행을 승인했어요.`,
          '[연결] 운영자 공개 원본을 준비하고 있어요.'
        ],
        serverBacked: true,
        rewardAmount: Number(data.reward_amount || 0),
        motionVariant: data.motion_variant || 'a',
        motionSeed: data.motion_seed || '',
        _submitted: false
      };
      state.notifications.unshift({ text: `${node.title} 업무가 시작됐어요.`, time: '방금 전', type: 'work' });
      saveState();
      render();
      showToast('🟢 데이터 업무를 시작했어요.', 'success');
      runFrame = requestAnimationFrame(tickRun);
      return;
    }

    showToast('🔒 실제 작업 제출이 열리기 전에는 회원 계정으로 업무를 시작하지 않아요.', 'warning');
  }
  function tickRun() {
    if (!state.run) { runFrame = null; return; }
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
    if (copy && scene?.copy) copy.textContent = scene.copy;
    if (log) log.innerHTML = (state.run.logs || []).slice(-5).map((item) => `<div>${esc(item)}</div>`).join('');
  }

  async function finishRun(node) {
    cancelAnimationFrame(runFrame); runFrame = null;
    const run = state.run;
    if (!run) return;

    if (run.serverBacked && authState.session && config.enableWorkApi === true) {
      if (run._submitting) return;
      run._submitting = true;
      const { data, error } = await supabaseClient
        .from('task_runs')
        .update({ status: 'submitted' })
        .eq('id', run.dbId)
        .eq('user_id', authState.session.user.id)
        .select('public_id,reward_amount,completed_at')
        .single();

      if (error || !data) {
        run._submitting = false;
        run.overlayOpen = true;
        saveState();
        render();
        const message = String(error?.message || '');
        showToast(message.includes('예상 처리 시간이') ? '서버 시각을 맞추는 중이에요. 곧 자동으로 다시 제출할게요.' : taskApiErrorMessage(error), 'info');
        if (message.includes('예상 처리 시간이')) {
          window.setTimeout(() => {
            if (state.run === run) runFrame = requestAnimationFrame(tickRun);
          }, 1100);
        }
        return;
      }

      const reward = Number(data.reward_amount || run.rewardAmount || 0);
      const durationSeconds = Math.max(1, Math.round((Number(data.completed_at ? Date.parse(data.completed_at) : Date.now()) - run.startedAt) / 1000));
      state.history.unshift({
        id: data.public_id || run.id,
        nodeId: node.id,
        status: '검수 대기',
        reward,
        date: '방금 전',
        duration: `${durationSeconds}초`
      });
      state.notifications.unshift({ text: `${node.title} 제출 완료 · 운영 검수 대기`, time: '방금 전', type: 'work' });
      state.run = null;
      saveState();
      releaseMotionCanvas();
      render();
      showToast('✅ 업무 제출이 완료됐어요. 운영 검수 후 보상이 확정됩니다.', 'success');
      return;
    }

    state.run = null;
    saveState();
    releaseMotionCanvas();
    render();
    showToast('작업 제출 연결이 필요해 연출을 종료했어요. 잔액은 변경되지 않았습니다.', 'warning');
  }

  function releaseMotionCanvas() {
    const canvas = document.getElementById('motionCanvas');
    if (canvas && window.PutdukMotion && typeof window.PutdukMotion.release === 'function') {
      window.PutdukMotion.release(canvas);
    }
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

  function closeModal() {
    state.modal = null;
    state.modalPayload = null;
    render();
  }

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
      showToast('📲 퍼뜩 앱이 설치됐어요. 다음부터 더 빠르게 열 수 있어요.', 'success');
    });
  }

  async function installApp() {
    if (deferredInstallPrompt) {
      const prompt = deferredInstallPrompt;
      deferredInstallPrompt = null;
      await prompt.prompt();
      const result = await prompt.userChoice;
      if (result?.outcome === 'accepted') showToast('📲 설치를 시작했어요. 홈 화면에서 퍼뜩을 열어 보세요.', 'success');
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

  async function signOut() {
    if (supabaseClient) {
      const { error } = await supabaseClient.auth.signOut();
      if (error) { showToast('로그아웃을 완료하지 못했어요. 잠시 후 다시 시도해 주세요.', 'info'); return; }
    }
    authState.session = null;
    authState.profile = null;
    authState.adminAuthorized = !isAdmin;
    authState.adminRoles = [];
    authState.adminLoading = false;
    companies = [];
    nodes = [];
    activeStorageKey = storageKey;
    state = freshState(false);
    saveState();
    render();
    showToast('안전하게 로그아웃했어요.', 'success');
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
      terms_version: '2026-09-16',
      privacy_version: '2026-09-16',
      marketing_opt_in: Boolean(document.getElementById('signupMarketing')?.checked)
    };
    const { data, error } = await supabaseClient.auth.signUp({ email, password, options: { data: metadata } });
    if (error) {
      const raw = String(error.message || '');
      showToast(/rate limit|429/i.test(raw) ? '인증 안내 메일이 잠시 제한됐어요. 조금 뒤 다시 가입해 주세요.' : '가입을 완료하지 못했어요. 이메일 주소나 비밀번호를 확인해 주세요.', 'info');
      return;
    }
    if (data.session) await hydrateSession(data.session);
    state.modal = null;
    render();
    showToast(data.session ? '🎉 가입이 완료됐어요. 내 노드 카드를 확인해 보세요.' : '📨 가입은 완료됐어요. 이메일 인증 후 로그인해 주세요.', 'success');
  }

  async function submitLogin(event) {
    event.preventDefault();
    const form = event.target;
    if (!form.reportValidity()) return;
    if (!supabaseClient) { showToast('인증 서버가 준비되지 않아 로그인할 수 없어요.', 'info'); return; }
    const email = document.getElementById('loginEmail')?.value.trim().toLowerCase() || '';
    const password = document.getElementById('loginPassword')?.value || '';
    const { data, error } = await supabaseClient.auth.signInWithPassword({ email, password });
    if (error) { showToast('로그인 정보를 확인해 주세요. 이메일 인증이 필요할 수도 있어요.', 'info'); return; }
    await hydrateSession(data.session);
    state.modal = null;
    render();
    showToast('👋 다시 만나서 반가워요. 작업실을 준비했어요.', 'success');
  }

  function handleClick(event) {
    const target = event.target.closest('button, [data-nav], [data-start-node], [data-company-action], [data-toggle-node], [data-review-action], [data-brand-action], [data-catalog-node-action], [data-member-filter], [data-finance-action], [data-notification]');
    if (!target) return;
    if (target.dataset.authMode) { state.authMode = target.dataset.authMode; render(); return; }
    if (target.dataset.nav) {
      if (isAdmin) state.adminPage = target.dataset.nav; else state.memberPage = target.dataset.nav;
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
    if (target.dataset.notification !== undefined) { openModal('notifications'); return; }
    if (target.dataset.menu === 'open') { document.getElementById('sidebar')?.classList.add('open'); document.getElementById('sidebarBackdrop')?.classList.add('open'); return; }
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
    if (action === 'install-app') { installApp(); return; }
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
      closeModal();
      return;
    }
    if (action === 'open-terms') { openModal('terms'); return; }
    if (action === 'open-privacy') { openModal('privacy'); return; }
    if (action === 'forgot-password') { sendPasswordReset(); return; }
    if (action === 'deposit-info') { openModal('deposit'); return; }
    if (action === 'withdraw-info') { openModal('withdraw'); return; }
    if (action === 'open-kyc') { openModal('kyc'); return; }
    if (action === 'open-run') { if (state.run) { state.run.overlayOpen = true; render(); } return; }
    if (action === 'close-run') { if (state.run) { state.run.overlayOpen = false; saveState(); render(); showToast('화면을 닫아도 작업은 서버 기준으로 계속 진행돼요.', 'info'); } return; }
    if (action === 'copy-referral') { navigator.clipboard?.writeText(referralCode()); showToast(`추천 코드 ${referralCode()}을 복사했어요.`, 'success'); return; }
    if (action === 'email-check') { const email = document.getElementById('signupEmail')?.value.trim() || ''; showToast(email && email.includes('@') ? '이메일 형식이 올바릅니다. 최종 중복 확인은 가입 단계에서 진행돼요.' : '이메일 주소를 올바르게 입력해 주세요.', email && email.includes('@') ? 'success' : 'info'); return; }
    if (action === 'export-history') { showToast('작업내역 내려받기는 서버 내보내기 계약이 열린 뒤에 제공돼요.', 'info'); return; }
    if (action === 'faq') { showToast('업무가 진행 중인 경우 서버 기록을 기준으로 이어집니다.', 'info'); return; }
    if (action === 'member-detail') { openMemberDetail(target.dataset.memberId); return; }
    if (action === 'member-credit' || action === 'member-debit') {
      const memberId = target.dataset.memberId || '';
      const cached = state.adminMembers.find((item) => String(item.id) === String(memberId) || String(item.user_id) === String(memberId)) || state.adminMemberDetail || {};
      openModal('balance-adjust', { ...cached, id: memberId, user_id: memberId, direction: action === 'member-debit' ? 'debit' : 'credit' });
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
    try {
      await adminRequest('adjust_balance', {
        user_id: values.user_id,
        direction,
        amount,
        currency: values.currency || 'KRW',
        reason: values.reason
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
        reward_amount: 0,
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
      showToast('알림을 보냈어요.', 'success');
    } catch (error) {
      showToast(friendlyAdminError(error), isUnsupportedAction(error) ? 'warning' : 'error');
    }
  }

  async function submitDepositForm(event) {
    event.preventDefault();
    if (!authState.session) { showToast('로그인 후 입금 확인을 요청할 수 있어요.', 'info'); return; }
    if (!financeEnabled()) {
      showToast('입출금 연결이 열리기 전에는 요청을 만들지 않아요. 잔액은 변경되지 않습니다.', 'warning');
      return;
    }
    const values = formValues(event.target);
    try {
      await edgeRequest('create_deposit', values);
      closeModal();
      showToast('💳 입금 확인 요청을 접수했어요.', 'success');
    } catch (error) {
      showToast(friendlyAdminError(error), isUnsupportedAction(error) ? 'warning' : 'error');
    }
  }

  async function submitWithdrawForm(event) {
    event.preventDefault();
    if (!authState.session) { showToast('로그인 후 출금 요청을 만들 수 있어요.', 'info'); return; }
    if (!financeEnabled()) {
      showToast('🔐 출금 전 본인확인과 출금 서버 연결이 필요해요. 잔액은 변경되지 않습니다.', 'warning');
      return;
    }
    const values = formValues(event.target);
    if (Number(values.amount) > Number(state.wallet.available || 0)) {
      showToast('출금 가능 잔액보다 큰 금액은 신청할 수 없어요.', 'warning');
      return;
    }
    try {
      await edgeRequest('create_withdrawal', values);
      closeModal();
      showToast('출금 확인 요청을 접수했어요.', 'success');
    } catch (error) {
      showToast(friendlyAdminError(error), isUnsupportedAction(error) ? 'warning' : 'error');
    }
  }

  async function submitKycForm(event) {
    event.preventDefault();
    if (!authState.session) { showToast('로그인 후 본인확인 자료를 제출할 수 있어요.', 'info'); return; }
    if (!financeEnabled()) {
      showToast('🔐 출금 전 본인확인이 필요해요. 업로드 계약이 열리면 제출됩니다.', 'warning');
      return;
    }
    try {
      await edgeRequest('submit_kyc', { has_front: Boolean(document.getElementById('kycFront')?.files?.[0]), has_back: Boolean(document.getElementById('kycBack')?.files?.[0]), has_selfie: Boolean(document.getElementById('kycSelfie')?.files?.[0]) });
      closeModal();
      showToast('본인확인 자료를 접수했어요.', 'success');
    } catch (error) {
      showToast(friendlyAdminError(error), isUnsupportedAction(error) ? 'warning' : 'error');
    }
  }

  async function submitReviewDecision(taskRunId, decision) {
    if (state.adminReviewBusyId) return;
    const item = state.adminReviews.find((row) => row.id === taskRunId);
    if (!item) { showToast('검수 대상 업무를 찾을 수 없어요.', 'info'); return; }
    const labels = { approved: '검수 완료', rework: '재확인 요청', rejected: '반려' };
    if (!window.confirm(`${labels[decision]} 처리할까요? 회원 화면과 보상 상태에 바로 반영됩니다.`)) return;
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
      showToast(decision === 'approved' ? '✅ 검수 완료와 보상 반영을 끝냈어요.' : `처리 결과를 회원에게 안내했어요: ${labels[decision]}`, 'success');
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
    if (event.target.id === 'depositForm') { submitDepositForm(event); return; }
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
    document.querySelectorAll('#nodeGrid .node-card').forEach((card, index) => { card.style.display = value === 'all' || nodes[index]?.level === value ? '' : 'none'; });
  });
  document.addEventListener('visibilitychange', () => {
    if (state.run) {
      updateRunDom(motionSceneCopy(nodeById(state.run.nodeId), state.run.progress));
      drawMotionCanvas();
    }
    if (!document.hidden && authState.session) {
      if (state.modal) {
        if (isAdmin && authState.adminAuthorized) refreshAdminPageData({ silent: true }).catch(() => {});
        return;
      }
      hydrateSession(authState.session).then(async () => {
        if (isAdmin && authState.adminAuthorized) {
          await refreshAdminPageData({ silent: true });
        }
      }).then(() => render()).catch(() => {});
    }
  });
  window.addEventListener('resize', () => { if (state.run) drawMotionCanvas(); });

  initializePwa();
  initializeAuth().then(() => render());
  render();
})();
