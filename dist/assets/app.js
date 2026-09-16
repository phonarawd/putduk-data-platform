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

  const companies = [
    { id: 'dhl', name: 'DHL', label: '국제 배송 데이터', mark: 'DHL', color: '#d49a17', status: '출처 확인', category: '특송·택배' },
    { id: 'ups', name: 'UPS', label: '운송 이벤트 데이터', mark: 'UPS', color: '#78502c', status: '출처 확인', category: '특송·택배' },
    { id: 'fedex', name: 'FedEx', label: '항공·통관 데이터', mark: 'FX', color: '#5d4fb2', status: '출처 확인', category: '항공·포워딩' },
    { id: 'maersk', name: 'Maersk', label: '해상 컨테이너 데이터', mark: 'M', color: '#0a7180', status: '자료 등록 대기', category: '해상 운송' },
    { id: 'alibaba', name: '알리바바', label: '상품 속성 데이터', mark: '阿', color: '#c85b27', status: '자료 등록 대기', category: '커머스 플랫폼' },
    { id: 'ebay', name: '이베이', label: '상품 정합성 데이터', mark: 'eB', color: '#2a64b7', status: '자료 등록 대기', category: '커머스 플랫폼' },
    { id: 'cj', name: 'CJ대한통운', label: '배송 예외 데이터', mark: 'CJ', color: '#bc2039', status: '자료 등록 대기', category: '특송·택배' },
    { id: 'gxo', name: 'GXO', label: '창고 재고 데이터', mark: 'GX', color: '#2b5da7', status: '자료 등록 대기', category: '창고·3PL' }
  ];

  const nodes = [
    { id: 'nod-dhl-01', companyId: 'dhl', title: '배송 이벤트 순서 확인', copy: '스캔·이동·도착 기록의 흐름이 맞는지 확인해요.', time: 60, minutes: '1분', reward: 1200, level: '빠른 확인', icon: 'scan-line', color: '#d49a17', available: 86, motion: 'scan' },
    { id: 'nod-alibaba-01', companyId: 'alibaba', title: '상품 속성 정합성 확인', copy: '상품명·규격·옵션 정보가 서로 맞는지 비교해요.', time: 75, minutes: '1~2분', reward: 1800, level: '일반 처리', icon: 'layers-3', color: '#c85b27', available: 42, motion: 'catalog' },
    { id: 'nod-ups-01', companyId: 'ups', title: '운송 예외 사유 분류', copy: '운송 흐름에서 발생한 예외 항목을 기준에 맞게 분류해요.', time: 150, minutes: '2~3분', reward: 2800, level: '일반 처리', icon: 'route', color: '#78502c', available: 31, motion: 'route' },
    { id: 'nod-maersk-01', companyId: 'maersk', title: '컨테이너 상태 대조', copy: '항로 이벤트와 컨테이너 상태가 일치하는지 살펴봐요.', time: 240, minutes: '4분', reward: 5200, level: '집중 처리', icon: 'ship-wheel', color: '#0a7180', available: 18, motion: 'ocean' },
    { id: 'nod-fedex-01', companyId: 'fedex', title: '항공 통관 필드 비교', copy: '송장 메타데이터와 운송 상태의 누락 항목을 확인해요.', time: 360, minutes: '6분', reward: 7400, level: '집중 처리', icon: 'file-check-2', color: '#5d4fb2', available: 12, motion: 'document' },
    { id: 'nod-gxo-01', companyId: 'gxo', title: '창고 재고 위치 확인', copy: '창고 위치와 재고 수량이 맞는지 한 건씩 검증해요.', time: 480, minutes: '8분', reward: 9800, level: '전문 검수', icon: 'warehouse', color: '#2b5da7', available: 7, motion: 'warehouse' }
  ];

  const defaultState = {
    theme: 'light',
    memberPage: 'dashboard',
    adminPage: 'overview',
    authMode: 'signup',
    modal: null,
    wallet: { support: 10000, task: 28400, referral: 10000, available: 38400, held: 7200 },
    run: null,
    history: [
      { id: 'RUN-260916-0042', nodeId: 'nod-ups-01', status: '검수 완료', reward: 2800, date: '오늘 00:42', duration: '2분 31초' },
      { id: 'RUN-260915-0318', nodeId: 'nod-dhl-01', status: '검수 완료', reward: 1200, date: '어제 23:18', duration: '58초' },
      { id: 'RUN-260915-0267', nodeId: 'nod-alibaba-01', status: '검수 대기', reward: 1800, date: '어제 21:07', duration: '1분 16초' }
    ],
    notifications: [
      { text: '새로운 국제 운송 데이터 노드가 공개됐어요.', time: '8분 전', type: 'info' },
      { text: '어제 제출한 업무 1건이 검수 대기 중이에요.', time: '1시간 전', type: 'work' }
    ],
    companies: companies.map((company, index) => ({ ...company, verified: index < 3, published: index < 3 })),
    nodeEnabled: Object.fromEntries(nodes.map(node => [node.id, true])),
    supportGrant: 10000,
    toast: null
  };

  let activeStorageKey = storageKey;
  let state = loadState();
  let runFrame = null;
  let chartInstance = null;

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
      const safe = { ...state, run: state.run ? { ...state.run, overlayOpen: false } : null, toast: null };
      localStorage.setItem(activeStorageKey, JSON.stringify(safe));
    } catch (_) {}
  }

  function switchToUserState(userId) {
    if (!userId) return;
    activeStorageKey = `${storageKey}:${userId}`;
    state = loadState(activeStorageKey);
  }

  function profileName() {
    return authState.profile?.display_name || authState.session?.user?.user_metadata?.display_name || '퍼뜩 회원';
  }

  function profileInitial() {
    return profileName().trim().slice(0, 1) || '회';
  }

  function publicId() {
    return authState.profile?.public_id || 'PDK-26-SG-88491';
  }

  function referralCode() {
    return authState.profile?.referral_code || 'PDK88491';
  }

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

  async function hydrateSession(session) {
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
        .select('id,public_id,node_id,status,reward_amount,created_at,completed_at,expected_completed_at,motion_variant,motion_seed')
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
          duration: row.completed_at && row.created_at ? `${Math.max(1, Math.round((new Date(row.completed_at) - new Date(row.created_at)) / 1000))}초` : '진행 중'
        }));
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
      if (isAdmin) await hydrateAdminAuthorization();
      supabaseClient.auth.onAuthStateChange((_event, session) => {
        window.setTimeout(async () => {
          await hydrateSession(session);
          if (isAdmin) await hydrateAdminAuthorization();
          render();
        }, 0);
      });
    } catch (error) {
      authState.loading = false;
      authState.adminLoading = false;
      authState.error = error;
    }
  }
  function esc(value) {
    return String(value ?? '').replace(/[&<>"']/g, (char) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#039;' }[char]));
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

  function companyById(id) { return companies.find((company) => company.id === id) || companies[0]; }
  function nodeById(id) { return nodes.find((node) => node.id === id) || nodes[0]; }

  function navItems() {
    return isAdmin ? [
      { id: 'overview', label: '전체 현황', icon: 'layout-dashboard' },
      { id: 'members', label: '회원 관리', icon: 'users', count: 1284 },
      { id: 'companies', label: '기업 관리', icon: 'building-2', count: 8 },
      { id: 'nodes', label: '업무 카드 관리', icon: 'waypoints', count: 24 },
      { id: 'reviews', label: '검수 대기', icon: 'clipboard-check', count: 37 },
      { id: 'finance', label: '입출금 처리', icon: 'wallet-cards', count: 11 },
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
    const title = isAdmin ? ({ overview: '전체 현황', members: '회원 관리', companies: '기업 관리', nodes: '업무 카드 관리', reviews: '검수 대기', finance: '입출금 처리', notifications: '공지·알림', settings: '운영 설정' }[state.adminPage] || '전체 현황') : ({ dashboard: '내 작업실', nodes: '업무 노드 찾기', history: '내 작업내역', wallet: '지갑·입출금', membership: '멤버십 카드', referrals: '추천인 혜택', support: '도움말' }[state.memberPage] || '내 작업실');
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
    const modeText = authState.session ? '회원 계정 연결됨' : '비회원 안내 화면';
    return `<div class="trust-strip"><div class="trust-title">${icon('badge-check', 15)} 연결 출처</div>${companies.slice(0, 7).map((company) => `<span class="partner-pill"><span class="dot"></span>${esc(company.name)}</span>`).join('')}<span style="margin-left:auto;color:var(--muted);font-size:11px">${modeText} · 공개 상태는 운영자 확인 후 반영</span></div>`;
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
          <div class="hero-metrics"><div><div class="metric-label">오늘 처리 가능</div><div class="metric-value">12<small>개 노드</small></div></div><div><div class="metric-label">검수 통과율</div><div class="metric-value">96.8<small>%</small></div></div><div><div class="metric-label">현재 상태</div><div class="metric-value" style="font-size:18px;color:var(--emerald-strong)">정상 운영</div></div></div>
        </div>
        <div class="id-card"><div class="id-card-top"><div><div class="id-card-kicker">퍼뜩 멤버십 카드</div><div class="id-card-title">우수 파트너</div></div><div class="id-chip"></div></div><div class="id-number">${esc(publicId())}</div><div class="id-footer"><span>${esc(profileName())}</span><span>${authState.session ? '인증 계정' : '가입 전 카드'}</span></div><div style="display:flex;align-items:center;gap:7px;margin-top:17px;color:#b9e8d2;font-size:11px">${icon('sparkles', 14)} 활동으로 등급이 올라가요</div></div>
      </section>
      ${inProgress ? `<div class="notice" style="margin-bottom:18px"><span style="color:var(--emerald)">${icon('activity',17)}</span><div style="flex:1"><strong>${esc(inProgress.title)}</strong>을(를) 처리하고 있어요.<br><span style="color:var(--muted)">화면을 닫아도 서버에서 진행됩니다.</span></div><button class="small-button primary" data-action="open-run">진행 화면 열기</button></div>` : ''}
      <section class="dashboard-grid">
        <div class="panel"><div class="panel-head"><div><div class="panel-title">처리 흐름</div><div class="panel-subtitle">최근 7일간 승인된 작업 보상</div></div><span class="status-badge">${icon('trending-up', 13)} 18.4% 증가</span></div><div class="chart-wrap"><canvas id="earningsChart" aria-label="최근 7일 보상 흐름"></canvas></div></div>
        <div class="wallet-card"><div class="eyebrow" style="color:#a8f3d2">${icon('wallet', 14)} 내 지갑</div><div class="wallet-balance">${money(state.wallet.available)}</div><div class="wallet-row"><span class="muted">업무 지원금</span><strong>${money(state.wallet.support)}</strong></div><div class="wallet-row"><span class="muted">작업 보상</span><strong>${money(state.wallet.task)}</strong></div><div class="wallet-row"><span class="muted">추천 보상</span><strong>${money(state.wallet.referral)}</strong></div><div style="display:flex;gap:8px;margin-top:17px"><button class="secondary-button" data-nav="wallet" style="flex:1;color:#fff;border-color:rgba(255,255,255,.2);background:rgba(255,255,255,.1)">지갑 보기</button><button class="gold-button" data-action="deposit-info" style="flex:1">충전 안내</button></div></div>
      </section>
      <div class="section-heading"><div><h2>오늘 추천 노드</h2><p>업무별 예상시간과 보상을 먼저 확인하세요.</p></div><button class="text-link" data-nav="nodes">전체 노드 보기 ${icon('arrow-right', 14)}</button></div>
      <section class="node-grid">${nodes.slice(0, 3).map(renderNodeCard).join('')}</section>
      <section class="dashboard-grid" style="margin-top:18px"><div class="panel"><div class="panel-head"><div><div class="panel-title">최근 작업 흐름</div><div class="panel-subtitle">실제 작업 단계가 여기에 기록돼요.</div></div><button class="text-link" data-nav="history">전체보기</button></div>${renderTimeline()}</div><div class="panel panel-pad"><div class="panel-title">처음 시작하는 분께</div><div class="notice" style="margin-top:14px"><span style="color:var(--gold)">${icon('lightbulb',17)}</span><div>빠른 확인 노드는 1분 안에 끝나고, 화면에 표시된 조건과 검수 결과에 따라 보상이 확정돼요.</div></div><button class="secondary-button" data-nav="support" style="width:100%;margin-top:13px">업무 과정 알아보기</button></div></section>
    `;
  }

  function renderNodeCard(node) {
    const company = companyById(node.companyId);
    const enabled = state.nodeEnabled[node.id] !== false;
    return `<article class="node-card" style="--node-color:${node.color};opacity:${enabled ? 1 : .55}"><div class="node-accent"></div><div class="node-top"><div class="company-mark">${esc(company.mark)}</div><span class="status-badge ${node.level === '전문 검수' ? 'gold' : ''}">${enabled ? '모집 중' : '일시 중지'}</span></div><div class="node-company">${esc(company.name)} · ${esc(company.category)}</div><div class="node-title">${esc(node.title)}</div><div class="node-copy">${esc(node.copy)}</div><div class="node-bottom"><div class="node-meta"><span>${icon('clock-3', 12)} ${esc(node.minutes)}</span><strong>${money(node.reward)}</strong><span>${node.available}건 남음</span></div><button class="small-button ${enabled ? 'primary' : ''}" data-start-node="${node.id}" ${enabled ? '' : 'disabled'}>${enabled ? '시작하기' : '대기 중'}</button></div></article>`;
  }

  function renderTimeline() {
    const items = [
      { label: '업무 제출', copy: '운송 예외 사유 분류', time: '오늘 00:44', done: true },
      { label: '검수 완료', copy: '배송 이벤트 순서 확인 · +1,200원', time: '어제 23:19', done: true },
      { label: '검수 대기', copy: '상품 속성 정합성 확인', time: '어제 21:08', done: false },
      { label: '다음 추천', copy: '컨테이너 상태 대조', time: '이용 가능', done: false }
    ];
    return `<div class="timeline">${items.map((item) => `<div class="timeline-item"><div class="timeline-dot ${item.done ? '' : 'pending'}"></div><div class="timeline-content"><strong>${item.label}</strong><p>${item.copy}</p></div><div class="timeline-time">${item.time}</div></div>`).join('')}</div>`;
  }

  function renderNodesPage() {
    return `<div class="section-heading" style="margin-top:0"><div><h1 class="page-title">업무 노드 찾기</h1><p class="page-copy">기업별 데이터 업무를 비교하고, 내게 맞는 작업부터 시작하세요.</p></div><button class="secondary-button" data-action="deposit-info">${icon('wallet', 16)} 이용 조건 안내</button></div><div class="filter-row"><button class="filter-button active" data-filter="all">전체</button><button class="filter-button" data-filter="빠른 확인">1~3분 업무</button><button class="filter-button" data-filter="일반 처리">일반 처리</button><button class="filter-button" data-filter="집중 처리">집중 처리</button><button class="filter-button" data-filter="전문 검수">전문 검수</button></div><section class="node-grid" id="nodeGrid">${nodes.map(renderNodeCard).join('')}</section><div class="notice" style="margin-top:18px"><span style="color:var(--emerald)">${icon('info',17)}</span><div><strong>보상 안내</strong><br>카드의 보상은 검수 완료 후 확정됩니다. 업무 시작 전에 예상시간과 조건을 꼭 확인하세요.</div></div>`;
  }

  function renderHistoryPage() {
    return `<div class="section-heading" style="margin-top:0"><div><h1 class="page-title">내 작업내역</h1><p class="page-copy">내가 처리한 업무와 검수·보상 상태를 한눈에 확인해요.</p></div><button class="secondary-button" data-action="export-history">${icon('download',16)} 내역 내려받기</button></div><div class="stat-grid" style="max-width:680px;margin-bottom:18px"><div class="mini-stat"><div class="metric-label">누적 완료</div><div class="num">${state.history.length + 42}건</div><div class="change">지난주보다 12건 증가</div></div><div class="mini-stat"><div class="metric-label">누적 보상</div><div class="num">${money(state.wallet.task)}</div><div class="change">검수 완료 기준</div></div></div><div class="panel"><div class="panel-pad"><div class="table-wrap"><table><thead><tr><th>실행번호</th><th>업무</th><th>처리시간</th><th>상태</th><th>보상</th><th>일시</th></tr></thead><tbody>${state.history.map((item) => { const node = nodeById(item.nodeId); const company = companyById(node.companyId); return `<tr><td><strong>${item.id}</strong></td><td>${company.name} · ${node.title}</td><td>${item.duration}</td><td><span class="pill ${item.status === '검수 완료' ? 'ok' : 'wait'}">${item.status}</span></td><td><strong>${money(item.reward)}</strong></td><td>${item.date}</td></tr>`; }).join('')}</tbody></table></div></div></div>`;
  }

  function renderWalletPage() {
    return `<div class="section-heading" style="margin-top:0"><div><h1 class="page-title">지갑·입출금</h1><p class="page-copy">지원금, 작업 보상, 추천 보상을 분리해서 확인할 수 있어요.</p></div><div style="display:flex;gap:8px"><button class="secondary-button" data-action="deposit-info">입금 안내</button><button class="primary-button" data-action="withdraw-info">출금 신청</button></div></div><div class="dashboard-grid"><div class="wallet-card"><div class="eyebrow" style="color:#a8f3d2">${icon('wallet',14)} 출금 가능 잔액</div><div class="wallet-balance">${money(state.wallet.available)}</div><div class="wallet-row"><span class="muted">현재 보류 중</span><strong>${money(state.wallet.held)}</strong></div><div class="wallet-row"><span class="muted">최근 반영</span><strong>오늘 00:44</strong></div><div style="margin-top:18px;color:#b7d0c2;font-size:11px;line-height:1.5">출금은 본인확인과 6자리 출금 비밀번호 확인 후 운영자가 수동 처리합니다.</div></div><div class="panel panel-pad"><div class="panel-title">잔액 구성</div><div class="stat-grid" style="margin-top:14px"><div class="mini-stat"><div class="metric-label">업무 지원금</div><div class="num" style="font-size:20px">${money(state.wallet.support)}</div><div class="metric-label" style="margin-top:5px">업무 조건에 따라 사용</div></div><div class="mini-stat"><div class="metric-label">작업 보상</div><div class="num" style="font-size:20px">${money(state.wallet.task)}</div><div class="metric-label" style="margin-top:5px">검수 완료 반영</div></div><div class="mini-stat"><div class="metric-label">추천 보상</div><div class="num" style="font-size:20px">${money(state.wallet.referral)}</div><div class="metric-label" style="margin-top:5px">조건 충족 후 확정</div></div><div class="mini-stat"><div class="metric-label">출금 보류</div><div class="num" style="font-size:20px">${money(state.wallet.held)}</div><div class="metric-label" style="margin-top:5px">확인 중인 금액</div></div></div></div></div><div class="section-heading"><div><h2>최근 지갑 내역</h2><p>모든 잔액 변경은 기록으로 남아요.</p></div></div><div class="panel"><div class="panel-pad"><div class="table-wrap"><table><thead><tr><th>구분</th><th>내용</th><th>금액</th><th>상태</th><th>일시</th></tr></thead><tbody><tr><td>작업 보상</td><td>UPS 운송 예외 사유 분류</td><td><strong>+2,800원</strong></td><td><span class="pill ok">확정</span></td><td>오늘 00:44</td></tr><tr><td>추천 보상</td><td>추천 회원 1명 조건 충족</td><td><strong>+5,000원</strong></td><td><span class="pill ok">확정</span></td><td>어제 18:22</td></tr><tr><td>입금</td><td>운영자 확인 대기</td><td><strong>+10,000원</strong></td><td><span class="pill wait">확인 중</span></td><td>어제 17:05</td></tr></tbody></table></div></div></div>`;
  }

  function renderMembershipPage() {
    const tiers = [
      ['일반 파트너', '가입 완료', '기본 노드 이용', '#7b8790'],
      ['인증 파트너', '본인확인 완료', '일반 노드와 작업내역', '#2d8f70'],
      ['우수 파트너', '검수 통과율 95% 이상', '고급 노드와 우선 검수', '#b8862c'],
      ['글로벌 디렉터', '장기 활동·전문 검수', '전문 노드와 전용 배정', '#694b9f']
    ];
    return `<div class="section-heading" style="margin-top:0"><div><h1 class="page-title">멤버십 카드</h1><p class="page-copy">입금액이 아니라 실제 활동과 작업 품질로 등급이 올라갑니다.</p></div><span class="status-badge gold">${icon('sparkles',13)} 다음 등급까지 14건</span></div><div class="id-card" style="max-width:620px;margin-bottom:22px"><div class="id-card-top"><div><div class="id-card-kicker">퍼뜩 멤버십 카드</div><div class="id-card-title">${esc(authState.profile?.member_tier || '우수 파트너')}</div></div><div class="id-chip"></div></div><div class="id-number">${esc(publicId())}</div><div class="id-footer"><span>${esc(profileName())}</span><span>${authState.session ? '인증 계정' : '가입 전 카드'}</span></div></div><section class="node-grid">${tiers.map((tier, index) => `<article class="node-card" style="--node-color:${tier[3]};min-height:190px"><div class="node-top"><div class="company-mark" style="background:${tier[3]}">${index + 1}</div><span class="status-badge ${index === 2 ? 'gold' : ''}">${index < 3 ? '현재·달성' : '다음 단계'}</span></div><div class="node-company">멤버십 등급</div><div class="node-title">${tier[0]}</div><div class="node-copy">${tier[1]}</div><div class="node-bottom"><div class="node-meta"><strong style="font-size:12px">${tier[2]}</strong></div></div></article>`).join('')}</section>`;
  }

  function renderReferralsPage() {
    return `<div class="section-heading" style="margin-top:0"><div><h1 class="page-title">추천인 혜택</h1><p class="page-copy">추천한 회원의 가입·인증·업무 완료 상태를 단계별로 확인해요.</p></div><button class="primary-button" data-action="copy-referral">${icon('copy',16)} 추천 코드 복사</button></div><div class="grid-hero"><div class="hero-card" style="min-height:220px"><div class="eyebrow"><span class="pulse-dot"></span> 내 추천 코드</div><div style="display:flex;align-items:center;gap:13px;margin-top:18px"><div style="font-size:34px;font-weight:900;letter-spacing:.08em">${esc(referralCode())}</div><button class="icon-button" data-action="copy-referral">${icon('copy',16)}</button></div><p class="hero-copy" style="margin-top:14px">초대한 회원이 실제 입금과 유효한 업무를 완료하고 검수를 통과하면 추천 보상이 확정됩니다.</p></div><div class="panel panel-pad"><div class="panel-title">추천 보상 현황</div><div class="wallet-balance" style="color:var(--text);margin:12px 0 18px">${money(state.wallet.referral)}</div><div class="wallet-row"><span>초대한 회원</span><strong>8명</strong></div><div class="wallet-row"><span>조건 확인 중</span><strong>2명</strong></div><div class="wallet-row"><span>보상 확정</span><strong>2명</strong></div></div></div><div class="panel"><div class="panel-head"><div><div class="panel-title">추천 회원 단계</div><div class="panel-subtitle">개인정보는 보호된 상태로 표시됩니다.</div></div></div><div class="timeline"><div class="timeline-item"><div class="timeline-dot"></div><div class="timeline-content"><strong>추천 회원 A***</strong><p>입금 확인 · 업무 2건 완료 · 보상 확정</p></div><div class="timeline-time">+5,000원</div></div><div class="timeline-item"><div class="timeline-dot pending"></div><div class="timeline-content"><strong>추천 회원 B***</strong><p>본인 인증 완료 · 첫 업무 진행 전</p></div><div class="timeline-time">확인 중</div></div></div></div>`;
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
    return `<div class="admin-stat-grid"><div class="admin-stat"><p>가입 회원</p><strong>1,284</strong><span>이번 주 +86명</span></div><div class="admin-stat"><p>오늘 처리 업무</p><strong>3,842</strong><span>정상 처리율 98.7%</span></div><div class="admin-stat"><p>검수 대기</p><strong>37</strong><span style="color:var(--gold)">평균 8분 대기</span></div><div class="admin-stat"><p>출금 확인 대기</p><strong>11</strong><span style="color:var(--gold)">수동 확인 필요</span></div></div><div class="admin-layout"><div><div class="admin-card"><div class="admin-card-head"><div><h3>오늘의 운영 흐름</h3><p>업무·검수·회원 활동을 한눈에 봅니다.</p></div><span class="status-badge">${icon('activity',13)} 정상</span></div><div class="chart-wrap" style="padding:0;height:250px"><canvas id="adminChart" aria-label="운영 현황"></canvas></div></div><div class="admin-card"><div class="admin-card-head"><div><h3>검수 대기 업무</h3><p>오래 기다리는 순서대로 먼저 확인하세요.</p></div><button class="text-link" data-nav="reviews">전체보기</button></div><div class="table-wrap"><table><thead><tr><th>회원</th><th>기업·업무</th><th>대기시간</th><th>예상 보상</th><th></th></tr></thead><tbody><tr><td><strong>김**</strong></td><td>DHL · 배송 이벤트</td><td>3분</td><td>1,200원</td><td><button class="small-button primary" data-action="review-detail">확인</button></td></tr><tr><td><strong>이**</strong></td><td>알리바바 · 상품 속성</td><td>8분</td><td>1,800원</td><td><button class="small-button primary" data-action="review-detail">확인</button></td></tr><tr><td><strong>박**</strong></td><td>Maersk · 컨테이너 상태</td><td>12분</td><td>5,200원</td><td><button class="small-button primary" data-action="review-detail">확인</button></td></tr></tbody></table></div></div></div><div><div class="admin-card"><div class="admin-card-head"><div><h3>기업 확인 현황</h3><p>공식 표시는 승인된 자료가 있는 기업만 가능합니다.</p></div><button class="text-link" data-nav="companies">관리</button></div>${state.companies.slice(0,5).map(renderCompanyRow).join('')}</div><div class="admin-card"><div class="admin-card-head"><div><h3>오늘 처리할 일</h3><p>운영자가 직접 확인해야 하는 항목입니다.</p></div></div><div class="notice"><span style="color:var(--gold)">${icon('landmark',17)}</span><div><strong>입금 확인 6건</strong><br>입금증과 회원 요청을 대조해 주세요.</div></div><div class="notice" style="margin-top:10px"><span style="color:var(--emerald)">${icon('file-check-2',17)}</span><div><strong>KYC 확인 5건</strong><br>본인확인 자료를 확인해 주세요.</div></div><button class="secondary-button" data-nav="finance" style="width:100%;margin-top:12px">처리 목록 열기</button></div></div></div>`;
  }

  function renderCompanyRow(company) {
    return `<div class="company-row"><div class="company-logo" style="--node-color:${company.color};background:${company.color}">${esc(company.mark)}</div><div class="company-info"><strong>${esc(company.name)}</strong><small>${esc(company.category)} · ${company.verified ? '자료 확인 완료' : '자료 등록 필요'}</small></div><span class="pill ${company.verified ? 'ok' : 'wait'}">${company.verified ? '공개 가능' : '확인 대기'}</span></div>`;
  }

  function renderAdminMembers() {
    return `<div class="section-heading" style="margin-top:0"><div><h1 class="page-title">회원 관리</h1><p class="page-copy">가입 정보와 작업 활동을 확인하고 필요한 조치를 할 수 있어요.</p></div><button class="primary-button" data-action="member-filter">회원 찾기</button></div><div class="admin-card"><div class="filter-row"><button class="filter-button active">전체 1,284</button><button class="filter-button">활동 중 842</button><button class="filter-button">KYC 대기 5</button><button class="filter-button">차단 12</button></div><div class="table-wrap"><table><thead><tr><th>회원번호</th><th>이름</th><th>이메일</th><th>등급</th><th>최근 접속</th><th>상태</th><th></th></tr></thead><tbody><tr><td><strong>PDK-26-SG-88491</strong></td><td>김**</td><td>kim***@mail.com</td><td>우수 파트너</td><td>방금 전</td><td><span class="pill ok">정상</span></td><td><button class="small-button" data-action="member-detail">자세히</button></td></tr><tr><td><strong>PDK-26-KR-32018</strong></td><td>이**</td><td>lee***@mail.com</td><td>인증 파트너</td><td>3분 전</td><td><span class="pill ok">정상</span></td><td><button class="small-button" data-action="member-detail">자세히</button></td></tr><tr><td><strong>PDK-26-KR-11907</strong></td><td>박**</td><td>park***@mail.com</td><td>일반 파트너</td><td>1시간 전</td><td><span class="pill wait">확인 중</span></td><td><button class="small-button" data-action="member-detail">자세히</button></td></tr></tbody></table></div></div>`;
  }

  function renderAdminCompanies() {
    return `<div class="section-heading" style="margin-top:0"><div><h1 class="page-title">기업 관리</h1><p class="page-copy">협력 자료, 로고, 공개 상태를 관리합니다.</p></div><button class="primary-button" data-action="add-company">${icon('plus',16)} 기업 등록</button></div><div class="notice" style="margin-bottom:18px"><span style="color:var(--gold)">${icon('file-lock-2',17)}</span><div><strong>공식 표시 기준</strong><br>협력 확인 자료와 로고 사용 자료를 등록한 뒤 공개 승인을 완료해야 회원 화면에 공식 배지가 표시됩니다.</div></div><div class="admin-card"><div class="table-wrap"><table><thead><tr><th>기업</th><th>분야</th><th>협력 자료</th><th>로고</th><th>회원 공개</th><th>관리</th></tr></thead><tbody>${state.companies.map((company) => `<tr><td><div style="display:flex;align-items:center;gap:9px"><div class="company-logo" style="background:${company.color}">${esc(company.mark)}</div><strong>${esc(company.name)}</strong></div></td><td>${esc(company.category)}</td><td><span class="pill ${company.verified ? 'ok' : 'wait'}">${company.verified ? '등록·승인' : '자료 등록 필요'}</span></td><td><span class="pill ${company.verified ? 'ok' : 'wait'}">${company.verified ? '사용 승인' : '파일 필요'}</span></td><td><span class="pill ${company.published ? 'ok' : ''}">${company.published ? '공개 중' : '비공개'}</span></td><td><button class="small-button ${company.verified ? '' : 'primary'}" data-company-action="${company.id}">${company.verified ? '자료 보기' : '등록하기'}</button></td></tr>`).join('')}</tbody></table></div></div>`;
  }

  function renderAdminNodes() {
    return `<div class="section-heading" style="margin-top:0"><div><h1 class="page-title">업무 카드 관리</h1><p class="page-copy">업무 내용, 예상시간, 보상, 노출 상태를 관리합니다.</p></div><button class="primary-button" data-action="add-node">${icon('plus',16)} 업무 카드 만들기</button></div><div class="admin-card"><div class="table-wrap"><table><thead><tr><th>업무 카드</th><th>기업</th><th>시간</th><th>보상</th><th>오늘 수량</th><th>노출</th><th>연출</th><th></th></tr></thead><tbody>${nodes.map((node) => { const company=companyById(node.companyId); const enabled=state.nodeEnabled[node.id] !== false; return `<tr><td><strong>${esc(node.title)}</strong><br><span style="color:var(--muted);font-size:11px">${esc(node.level)}</span></td><td>${esc(company.name)}</td><td>${esc(node.minutes)}</td><td>${money(node.reward)}</td><td>${node.available}건</td><td><button class="small-button ${enabled ? 'primary' : ''}" data-toggle-node="${node.id}">${enabled ? '공개 중' : '중지'}</button></td><td><span class="pill ok">${node.motion} 연출</span></td><td><button class="small-button" data-action="edit-node">수정</button></td></tr>`; }).join('')}</tbody></table></div></div>`;
  }

  function renderAdminReviews() {
    return `<div class="section-heading" style="margin-top:0"><div><h1 class="page-title">검수 대기</h1><p class="page-copy">회원이 제출한 업무를 확인하고 보상을 확정합니다.</p></div><button class="secondary-button" data-action="refresh">${icon('refresh-cw',16)} 새로고침</button></div><div class="admin-card"><div class="filter-row"><button class="filter-button active">전체 37</button><button class="filter-button">오래된 순</button><button class="filter-button">전문 검수</button><button class="filter-button">재확인 요청</button></div><div class="table-wrap"><table><thead><tr><th>회원</th><th>업무</th><th>제출시간</th><th>정확도</th><th>보상</th><th>상태</th><th></th></tr></thead><tbody><tr><td>김**<br><span style="color:var(--muted);font-size:11px">PDK-26-SG-88491</span></td><td>DHL 배송 이벤트 순서</td><td>00:42</td><td>자동검사 98%</td><td>1,200원</td><td><span class="pill wait">검수 대기</span></td><td><button class="small-button primary" data-action="review-detail">검수하기</button></td></tr><tr><td>이**<br><span style="color:var(--muted);font-size:11px">PDK-26-KR-32018</span></td><td>알리바바 상품 속성</td><td>00:37</td><td>자동검사 94%</td><td>1,800원</td><td><span class="pill wait">검수 대기</span></td><td><button class="small-button primary" data-action="review-detail">검수하기</button></td></tr></tbody></table></div></div>`;
  }

  function renderAdminFinance() {
    return `<div class="section-heading" style="margin-top:0"><div><h1 class="page-title">입출금 처리</h1><p class="page-copy">입금과 출금을 운영자가 직접 확인하고 처리합니다.</p></div><button class="secondary-button" data-action="refresh">${icon('refresh-cw',16)} 새로고침</button></div><div class="admin-stat-grid"><div class="admin-stat"><p>입금 확인 대기</p><strong>6</strong><span style="color:var(--gold)">수동 확인 필요</span></div><div class="admin-stat"><p>출금 신청</p><strong>5</strong><span style="color:var(--gold)">KYC 확인 필요</span></div><div class="admin-stat"><p>오늘 확정 보상</p><strong>482,000원</strong><span>검수 완료 기준</span></div><div class="admin-stat"><p>등록 계좌</p><strong>2</strong><span>원화·USDT</span></div></div><div class="admin-card"><div class="admin-card-head"><div><h3>처리 대기 목록</h3><p>회원에게 표시되는 상태와 처리 기록을 함께 관리합니다.</p></div></div><div class="table-wrap"><table><thead><tr><th>구분</th><th>회원</th><th>금액</th><th>확인 상태</th><th>요청 시간</th><th></th></tr></thead><tbody><tr><td>입금</td><td>김**</td><td>10,000원</td><td><span class="pill wait">입금증 확인</span></td><td>17:05</td><td><button class="small-button primary" data-action="finance-detail">확인</button></td></tr><tr><td>출금</td><td>이**</td><td>50,000원</td><td><span class="pill wait">KYC 승인 확인</span></td><td>16:48</td><td><button class="small-button primary" data-action="finance-detail">처리</button></td></tr><tr><td>출금</td><td>박**</td><td>30,000원</td><td><span class="pill wait">송금 대기</span></td><td>16:31</td><td><button class="small-button primary" data-action="finance-detail">처리</button></td></tr></tbody></table></div></div>`;
  }

  function renderAdminNotifications() {
    return `<div class="section-heading" style="margin-top:0"><div><h1 class="page-title">공지·알림</h1><p class="page-copy">회원에게 보여줄 안내와 실제 업무 배정 알림을 관리합니다.</p></div><button class="primary-button" data-action="new-notice">${icon('plus',16)} 새 안내 만들기</button></div><div class="admin-card"><div class="notice"><span style="color:var(--emerald)">${icon('bell-ring',17)}</span><div><strong>알림 원칙</strong><br>실제 배정·검수·입출금 상태를 바탕으로 안내하고, 가짜 마감이나 확정 수익 문구는 사용하지 않습니다.</div></div><div style="margin-top:18px"><div class="company-row"><div class="company-logo" style="background:var(--emerald)">${icon('target',17)}</div><div class="company-info"><strong>회원별 업무 배정 알림</strong><small>특정 회원에게 실제 노드가 배정됐을 때만 표시</small></div><button class="small-button primary" data-action="target-notice">설정</button></div><div class="company-row"><div class="company-logo" style="background:var(--gold)">${icon('megaphone',17)}</div><div class="company-info"><strong>전체 공지</strong><small>서비스 점검·업무 안내·지원금 정책</small></div><button class="small-button" data-action="new-notice">관리</button></div></div></div>`;
  }

  function renderAdminSettings() {
    return `<div class="section-heading" style="margin-top:0"><div><h1 class="page-title">운영 설정</h1><p class="page-copy">처음 가입한 회원에게 제공하는 조건과 하루 작업량을 설정합니다.</p></div><button class="primary-button" data-action="save-settings">설정 저장</button></div><div class="admin-card"><div class="admin-card-head"><div><h3>신규 회원 업무 지원금</h3><p>기존 지급 기록은 변경하지 않고, 앞으로 가입하는 회원에게만 적용됩니다.</p></div><span class="pill ok">사용 중</span></div><div class="form-grid"><div class="field"><label>기본 지급 금액</label><input id="supportGrantInput" type="number" value="${state.supportGrant}" min="0" step="1000" /></div><div class="field"><label>지급 시점</label><select><option>가입 완료 후</option><option>휴대폰 인증 후</option><option>본인확인 완료 후</option></select></div><div class="field full"><label>회원에게 보여줄 안내</label><textarea rows="3">가입을 환영해요. 업무를 시작하는 데 사용할 수 있는 지원금입니다.</textarea></div></div></div><div class="admin-card"><div class="admin-card-head"><div><h3>하루 작업량</h3><p>업무 카드별로 오늘 노출할 수량과 회원별 제한을 설정합니다.</p></div></div><div class="form-grid"><div class="field"><label>기본 하루 작업 수</label><input type="number" value="3" min="1" /></div><div class="field"><label>추천 완료 시 추가 수</label><input type="number" value="1" min="0" /></div><div class="field"><label>검수 대기 알림 횟수</label><input type="number" value="2" min="0" /></div><div class="field"><label>회원별 알림 빈도</label><select><option>하루 최대 2회</option><option>하루 최대 1회</option><option>사용자 선택</option></select></div></div></div>`;
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
    const stages = ['데이터 원본 연결', '데이터 조각 분할', '회원 처리·비교', '자동 품질검사', '운영 검수 대기'];
    const stageIndex = Math.min(stages.length - 1, Math.floor(progress * stages.length));
    return `<div class="modal-backdrop"><div class="modal motion-modal"><div class="motion-stage"><canvas id="motionCanvas"></canvas><div class="motion-vignette"></div><div class="motion-ui"><div class="motion-top"><div><div class="motion-kicker">${esc(company.name)} · ${esc(node.level)}</div><div class="motion-title">${esc(node.title)}</div></div><div class="motion-live"><span class="pulse-dot" style="background:#80efc1"></span> 노드 실행 중</div></div><div class="motion-center"><div class="motion-core"><div class="motion-percent" id="motionPercent">${Math.round(progress * 100)}%<small>처리 진행률</small></div></div></div><div class="motion-bottom"><div><div class="motion-stage-label" id="motionStageLabel">${stages[stageIndex]}</div><div class="motion-stage-copy" id="motionStageCopy">실제 데이터 흐름을 기반으로 처리 단계를 표시하고 있어요.</div><div class="progress-track"><div class="progress-fill" id="motionProgress" style="width:${progress * 100}%"></div></div></div><div class="motion-log" id="motionLog">${(state.run.logs || []).slice(-5).map((log) => `<div>${esc(log)}</div>`).join('')}</div></div><div style="display:flex;justify-content:flex-end;gap:9px;margin-top:16px"><button class="secondary-button" data-action="close-run" style="color:#effff8;border-color:rgba(255,255,255,.2);background:rgba(255,255,255,.08)">${progress > .98 ? '닫기' : '화면 닫기'}</button></div></div></div></div></div>`;
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
    if (kind === 'deposit') return `<div class="modal-backdrop" data-modal="info"><div class="modal"><div class="modal-head"><div><h2>충전·이용 조건 안내</h2><p>업무 이용에 필요한 조건을 먼저 확인해 주세요.</p></div><button class="icon-button" data-action="close-modal">${icon('x',18)}</button></div><div class="modal-body"><div class="notice"><span style="color:var(--emerald)">${icon('wallet',17)}</span><div><strong>현재 잔액으로 이용 가능한 업무</strong><br>빠른 확인·일반 처리 노드는 바로 시작할 수 있어요.</div></div><div class="panel panel-pad" style="margin-top:14px"><div class="panel-title">고급 업무 이용 예시</div><p class="page-copy" style="margin-top:8px">컨테이너 상태 대조 노드는 운영자가 정한 별도 이용 조건을 충족해야 공개될 수 있습니다. 필요한 금액·반환 조건·예상 보상 범위는 시작 전에 항상 표시합니다.</p><div style="display:flex;align-items:center;justify-content:space-between;margin-top:16px"><span style="color:var(--muted);font-size:13px">예상 보상 범위</span><strong style="font-size:18px">5,200원 전후</strong></div><div style="height:1px;background:var(--line);margin:12px 0"></div><div style="color:var(--muted);font-size:12px;line-height:1.6">보상은 실제 작업과 검수 결과에 따라 확정되며, 입금만으로 수익이 발생하지 않습니다.</div></div><div class="modal-actions"><button class="secondary-button" data-action="close-modal">확인했어요</button><button class="primary-button" data-nav="nodes">업무 둘러보기</button></div></div></div></div>`;
    return `<div class="modal-backdrop" data-modal="info"><div class="modal"><div class="modal-head"><div><h2>출금 신청 안내</h2><p>본인확인 후 운영자가 수동으로 처리합니다.</p></div><button class="icon-button" data-action="close-modal">${icon('x',18)}</button></div><div class="modal-body"><div class="notice"><span style="color:var(--gold)">${icon('shield-check',17)}</span><div>출금 전 KYC 본인확인과 6자리 출금 비밀번호 설정이 필요합니다.</div></div><div class="form-grid" style="margin-top:16px"><div class="field"><label>출금 금액</label><input type="number" placeholder="출금할 금액" /></div><div class="field"><label>출금 방식</label><select><option>원화 계좌</option><option>USDT 지갑</option></select></div><div class="field full"><label>출금 비밀번호 6자리</label><input type="password" inputmode="numeric" maxlength="6" placeholder="••••••" /></div></div><div class="modal-actions"><button class="secondary-button" data-action="close-modal">취소</button><button class="primary-button" data-action="withdraw-request">출금 요청 만들기</button></div></div></div></div>`;
  }

  function renderModal() {
    if (state.modal === 'auth') return renderAuthModalLive();
    if (state.modal === 'terms') return renderLegalModal('terms');
    if (state.modal === 'privacy') return renderLegalModal('privacy');
    if (state.modal === 'deposit') return renderInfoModal('deposit');
    if (state.modal === 'withdraw') return renderInfoModal('withdraw');
    return '';
  }

  function render() {
    document.documentElement.dataset.theme = state.theme;
    const page = isAdmin && !authState.adminAuthorized ? renderAdminGate() : isAdmin ? renderAdminPage() : renderMemberPage();
    const sidebar = isAdmin && !authState.adminAuthorized ? '' : renderSidebar();
    document.getElementById('app').innerHTML = `<div class="app-shell">${sidebar}<main class="main"><${'div'}>${renderTopbar()}${page}</div></main></div><div class="toast-stack" id="toastStack"></div>${renderRunOverlay()}${renderModal()}`;
    refreshIcons();
    if (!isAdmin && state.memberPage === 'dashboard') drawMemberChart();
    if (isAdmin && state.adminPage === 'overview') drawAdminChart();
    if (state.run && state.run.overlayOpen) requestAnimationFrame(() => { drawMotionCanvas(); if (!runFrame) runFrame = requestAnimationFrame(tickRun); });
    if (state.toast) showToast(state.toast.text, state.toast.kind, true);
  }

  function drawMemberChart() {
    const canvas = document.getElementById('earningsChart');
    if (!canvas || !window.Chart) return;
    if (chartInstance) chartInstance.destroy();
    chartInstance = new Chart(canvas, { type: 'line', data: { labels: ['월','화','수','목','금','토','오늘'], datasets: [{ data: [12000,18400,15300,24600,21100,30200,state.wallet.task], borderColor: '#0d9f76', backgroundColor: 'rgba(13,159,118,.12)', fill: true, tension: .42, pointRadius: 3, pointBackgroundColor: '#0d9f76', pointBorderWidth: 0 }] }, options: { responsive: true, maintainAspectRatio: false, plugins: { legend: { display:false }, tooltip: { displayColors:false, callbacks:{ label:(ctx)=>` ${Number(ctx.parsed.y).toLocaleString('ko-KR')}원` } } }, scales:{ x:{ grid:{display:false}, ticks:{color:'#7d8c86',font:{size:11}} }, y:{ grid:{color:'rgba(120,140,130,.12)'}, ticks:{color:'#7d8c86',font:{size:10},callback:(value)=>`${Math.round(value/1000)}k`} } } } });
  }

  function drawAdminChart() {
    const canvas = document.getElementById('adminChart');
    if (!canvas || !window.Chart) return;
    if (chartInstance) chartInstance.destroy();
    chartInstance = new Chart(canvas, { type: 'bar', data: { labels:['09시','12시','15시','18시','21시','현재'], datasets:[{label:'처리 완료',data:[421,642,713,580,766,720],backgroundColor:'rgba(13,159,118,.75)',borderRadius:8},{label:'검수 대기',data:[32,41,36,52,47,37],backgroundColor:'rgba(193,138,45,.72)',borderRadius:8}]}, options:{responsive:true,maintainAspectRatio:false,plugins:{legend:{position:'bottom',labels:{color:'#7d8c86',boxWidth:10,font:{size:11}}}},scales:{x:{grid:{display:false},ticks:{color:'#7d8c86'}},y:{grid:{color:'rgba(120,140,130,.12)'},ticks:{color:'#7d8c86'}}}}});
  }

  function showToast(text, kind = 'info', fromRender = false) {
    const stack = document.getElementById('toastStack');
    if (!stack) return;
    if (!fromRender) state.toast = { text, kind };
    const toast = document.createElement('div');
    toast.className = `toast ${kind === 'success' ? 'success' : ''}`;
    toast.innerHTML = `<span style="color:${kind === 'success' ? 'var(--emerald)' : 'var(--gold)'}">${icon(kind === 'success' ? 'check-circle-2' : 'info', 17)}</span><span>${esc(text)}</span>`;
    stack.appendChild(toast);
    refreshIcons();
    setTimeout(() => toast.remove(), 4200);
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
      runFrame = requestAnimationFrame(tickRun);
      return;
    }

    if (authState.session && config.enableWorkApi !== true) {
      showToast('🔒 실제 작업 제출 API가 연결되기 전에는 회원 계정으로 작업을 시작할 수 없어요.', 'info');
      return;
    }

    state.run = {
      id: `RUN-${Date.now().toString().slice(-8)}`,
      nodeId,
      startedAt: Date.now(),
      duration: node.time * 1000,
      progress: 0,
      overlayOpen: true,
      logs: [`[연결] ${node.title} 원본을 준비하고 있어요.`]
    };
    state.notifications.unshift({ text: `${node.title} 업무가 시작됐어요.`, time: '방금 전', type: 'work' });
    saveState();
    render();
    runFrame = requestAnimationFrame(tickRun);
  }
  function tickRun() {
    if (!state.run) { runFrame = null; return; }
    const now = Date.now();
    const elapsed = now - state.run.startedAt;
    state.run.progress = Math.min(1, elapsed / state.run.duration);
    const node = nodeById(state.run.nodeId);
    const stages = ['데이터 원본 연결', '데이터 조각 분할', '회원 처리·비교', '자동 품질검사', '운영 검수 대기'];
    const index = Math.min(stages.length - 1, Math.floor(state.run.progress * stages.length));
    const checkpoint = Math.floor(state.run.progress * 10);
    if (state.run._checkpoint !== checkpoint) {
      state.run._checkpoint = checkpoint;
      const messages = ['원본 연결 확인', '데이터 조각 1차 분할', '처리 항목을 화면에 배치', '회원 입력 결과 대조', '자동 검사 결과 정리', '검수 큐에 제출'];
      state.run.logs = [...(state.run.logs || []), `[${String(Math.round(state.run.progress * 100)).padStart(3,' ')}%] ${messages[Math.min(messages.length - 1, Math.floor(checkpoint / 2))]}`].slice(-8);
    }
    updateRunDom(stages[index]);
    drawMotionCanvas();
    if (state.run.progress >= 1) { finishRun(node); return; }
    runFrame = requestAnimationFrame(tickRun);
  }

  function updateRunDom(stage) {
    const percent = document.getElementById('motionPercent');
    const bar = document.getElementById('motionProgress');
    const label = document.getElementById('motionStageLabel');
    const log = document.getElementById('motionLog');
    if (percent) percent.innerHTML = `${Math.round(state.run.progress * 100)}%<small>처리 진행률</small>`;
    if (bar) bar.style.width = `${state.run.progress * 100}%`;
    if (label) label.textContent = stage;
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
      render();
      showToast('✅ 업무 제출이 완료됐어요. 운영 검수 후 보상이 확정됩니다.', 'success');
      return;
    }

    if (authState.session && config.enableWorkApi !== true) {
      state.run = null;
      saveState();
      render();
      showToast('작업 API 연결이 필요해 연출을 종료했어요. 잔액은 변경되지 않았습니다.', 'info');
      return;
    }

    state.history.unshift({ id: run.id, nodeId: node.id, status: '검수 대기', reward: node.reward, date: '방금 전', duration: `${Math.round(node.time * .95)}초` });
    state.wallet.task += node.reward;
    state.wallet.available += node.reward;
    state.notifications.unshift({ text: `${node.title} 제출 완료 · 운영 검수 대기`, time: '방금 전', type: 'work' });
    state.run = null;
    saveState();
    render();
    showToast('✅ 업무 제출이 완료됐어요. 운영 검수 후 보상이 확정됩니다.', 'success');
  }
  function drawMotionCanvas() {
    const canvas = document.getElementById('motionCanvas');
    if (!canvas || !state.run) return;
    const node = nodeById(state.run.nodeId);
    const ctx = canvas.getContext('2d');
    const rect = canvas.getBoundingClientRect();
    const dpr = Math.min(window.devicePixelRatio || 1, 1.75);
    const width = Math.max(1, Math.floor(rect.width * dpr));
    const height = Math.max(1, Math.floor(rect.height * dpr));
    if (canvas.width !== width || canvas.height !== height) { canvas.width = width; canvas.height = height; }
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    const w = rect.width; const h = rect.height;
    ctx.clearRect(0, 0, w, h);
    const points = [];
    const count = Math.min(21, Math.max(12, Math.floor(w / 45)));
    for (let i = 0; i < count; i++) {
      const angle = i * Math.PI * 2 / count + (state.run.progress * .9);
      const radius = Math.min(w, h) * (.18 + (i % 3) * .055);
      points.push({ x: w/2 + Math.cos(angle) * radius * 1.42, y: h/2 + Math.sin(angle) * radius * .72, r: i % 3 === 0 ? 3 : 2 });
    }
    const accent = node.color;
    ctx.lineWidth = 1;
    points.forEach((p, i) => {
      const next = points[(i + 1) % points.length];
      ctx.strokeStyle = `rgba(107, 236, 190, ${.08 + (i%4)*.02})`;
      ctx.beginPath(); ctx.moveTo(p.x, p.y); ctx.lineTo(next.x, next.y); ctx.stroke();
      if (i % 2 === 0) { ctx.strokeStyle = 'rgba(231,184,81,.12)'; ctx.beginPath(); ctx.moveTo(w/2, h/2); ctx.lineTo(p.x,p.y); ctx.stroke(); }
    });
    points.forEach((p, i) => {
      ctx.beginPath(); ctx.fillStyle = i % 4 === 0 ? accent : '#51e3b0'; ctx.shadowBlur = 14; ctx.shadowColor = ctx.fillStyle; ctx.arc(p.x,p.y,p.r,0,Math.PI*2); ctx.fill(); ctx.shadowBlur = 0;
    });
    const packetCount = 7;
    for (let i = 0; i < packetCount; i++) {
      const t = (state.run.progress * 3.8 + i / packetCount) % 1;
      const start = points[i % points.length]; const end = points[(i + 4) % points.length];
      const x = start.x + (end.x - start.x) * t; const y = start.y + (end.y - start.y) * t;
      ctx.beginPath(); ctx.fillStyle = i % 3 === 0 ? '#f3cd6b' : '#d8fff0'; ctx.shadowBlur = 16; ctx.shadowColor = ctx.fillStyle; ctx.arc(x,y,2.5,0,Math.PI*2); ctx.fill(); ctx.shadowBlur = 0;
    }
  }

  function closeModal() { state.modal = null; render(); }

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
    activeStorageKey = storageKey;
    state = loadState(storageKey);
    render();
    showToast('안전하게 로그아웃했어요.', 'success');
  }

  async function sendPasswordReset() {
    const email = document.getElementById('loginEmail')?.value.trim();
    if (!email || !email.includes('@')) { showToast('비밀번호를 받을 이메일을 먼저 입력해 주세요.', 'info'); return; }
    if (!supabaseClient) { showToast('인증 서버가 준비되지 않아 재설정 메일을 보낼 수 없어요.', 'info'); return; }
    const { error } = await supabaseClient.auth.resetPasswordForEmail(email, { redirectTo: window.location.href });
    if (error) { showToast('재설정 메일을 보내지 못했어요. 이메일을 확인해 주세요.', 'info'); return; }
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
    if (error) { showToast('가입을 완료하지 못했어요. 이메일 주소나 비밀번호를 확인해 주세요.', 'info'); return; }
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
    const target = event.target.closest('button, [data-nav], [data-start-node], [data-company-action], [data-toggle-node]');
    if (!target) return;
    if (target.dataset.authMode) { state.authMode = target.dataset.authMode; render(); return; }
    if (target.dataset.nav) {
      if (isAdmin) state.adminPage = target.dataset.nav; else state.memberPage = target.dataset.nav;
      document.getElementById('sidebar')?.classList.remove('open'); document.getElementById('sidebarBackdrop')?.classList.remove('open');
      state.modal = null; saveState(); render(); return;
    }
    if (target.dataset.startNode) { startNode(target.dataset.startNode); return; }
    if (target.dataset.companyAction) { approveCompany(target.dataset.companyAction); return; }
    if (target.dataset.toggleNode) { state.nodeEnabled[target.dataset.toggleNode] = state.nodeEnabled[target.dataset.toggleNode] === false; saveState(); render(); showToast(state.nodeEnabled[target.dataset.toggleNode] ? '✅ 업무 카드가 다시 공개됐어요.' : '⏸ 업무 카드가 잠시 중지됐어요.', state.nodeEnabled[target.dataset.toggleNode] ? 'success' : 'info'); return; }
    if (target.dataset.menu === 'open') { document.getElementById('sidebar')?.classList.add('open'); document.getElementById('sidebarBackdrop')?.classList.add('open'); return; }
    if (target.dataset.themeToggle !== undefined || target.closest('[data-theme-toggle]')) { state.theme = state.theme === 'dark' ? 'light' : 'dark'; saveState(); render(); return; }
    const action = target.dataset.action;
    if (action === 'open-signup') { state.authMode = 'signup'; state.modal = 'auth'; render(); return; }
    if (action === 'open-login') { state.authMode = 'login'; state.modal = 'auth'; render(); return; }
    if (action === 'logout') { signOut(); return; }
    if (action === 'install-app') { installApp(); return; }
    if (action === 'close-modal') { closeModal(); return; }
    if (action === 'open-terms') { state.modal = 'terms'; render(); return; }
    if (action === 'open-privacy') { state.modal = 'privacy'; render(); return; }
    if (action === 'forgot-password') { sendPasswordReset(); return; }
    if (action === 'deposit-info') { state.modal = 'deposit'; render(); return; }
    if (action === 'withdraw-info') { state.modal = 'withdraw'; render(); return; }
    if (action === 'withdraw-request') { closeModal(); showToast(authState.session ? '출금 확인 서버가 연결되기 전에는 요청을 만들지 않아요. 잔액은 변경되지 않습니다.' : '로그인 후 출금 요청을 만들 수 있어요.', 'info'); return; }
    if (action === 'open-run') { if (state.run) { state.run.overlayOpen = true; render(); } return; }
    if (action === 'close-run') { if (state.run) { state.run.overlayOpen = false; saveState(); render(); showToast('화면을 닫아도 작업은 서버 기준으로 계속 진행돼요.', 'info'); } return; }
    if (action === 'copy-referral') { navigator.clipboard?.writeText(referralCode()); showToast(`추천 코드 ${referralCode()}을 복사했어요.`, 'success'); return; }
    if (action === 'email-check') { const email = document.getElementById('signupEmail')?.value.trim() || ''; showToast(email && email.includes('@') ? '이메일 형식이 올바릅니다. 최종 중복 확인은 가입 단계에서 진행돼요.' : '이메일 주소를 올바르게 입력해 주세요.', email && email.includes('@') ? 'success' : 'info'); return; }
    if (action === 'export-history') { showToast('작업내역 내려받기를 준비하고 있어요.', 'info'); return; }
    if (action === 'faq') { showToast('업무가 진행 중인 경우 서버 기록을 기준으로 이어집니다.', 'info'); return; }
    if (action === 'member-detail') { showToast('회원 상세 패널을 열었어요. 개인정보는 권한에 따라 표시됩니다.', 'info'); return; }
    if (action === 'member-filter') { showToast('회원번호·이메일·휴대폰으로 찾을 수 있어요.', 'info'); return; }
    if (action === 'review-detail') { showToast('검수 상세 화면을 준비했어요. 최종 확정 전 내용을 확인하세요.', 'info'); return; }
    if (action === 'finance-detail') { showToast('입출금 요청의 증빙과 본인확인 상태를 함께 확인하세요.', 'info'); return; }
    if (action === 'refresh') { showToast('새로운 운영 내역을 불러왔어요.', 'success'); return; }
    if (action === 'add-company') { showToast('기업명·협력 자료·로고 파일을 등록하는 화면을 준비했어요.', 'info'); return; }
    if (action === 'add-node') { showToast('업무명·원본·시간·보상·전용 연출을 입력할 수 있어요.', 'info'); return; }
    if (action === 'edit-node') { showToast('업무 카드 설정을 열었어요.', 'info'); return; }
    if (action === 'new-notice' || action === 'target-notice') { showToast('실제 상태 기반 알림을 설정할 수 있어요.', 'info'); return; }
    if (action === 'save-settings') { const input = document.getElementById('supportGrantInput'); if (input) state.supportGrant = Number(input.value || 0); saveState(); showToast('운영 설정을 저장했어요.', 'success'); return; }
  }

  function approveCompany(companyId) {
    const company = state.companies.find((item) => item.id === companyId);
    if (!company) return;
    if (!company.verified) { company.verified = true; company.published = true; saveState(); render(); showToast(`${company.name} 자료가 승인되어 회원 화면에 공개됐어요.`, 'success'); }
    else showToast(`${company.name}의 협력 자료와 로고 상태를 확인했어요.`, 'info');
  }

  document.addEventListener('click', handleClick);
  document.addEventListener('submit', (event) => {
    if (event.target.id === 'signupForm') { submitSignup(event); return; }
    if (event.target.id === 'loginForm') { submitLogin(event); }
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
  document.addEventListener('visibilitychange', () => { if (state.run) { updateRunDom('현재 작업 상태를 동기화하는 중'); drawMotionCanvas(); } });
  window.addEventListener('resize', () => { if (state.run) drawMotionCanvas(); });

  initializePwa();
  initializeAuth().then(() => render());
  render();
})();
