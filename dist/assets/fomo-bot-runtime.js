(() => {
  'use strict';

  if (document.documentElement.dataset.mode === 'admin') return;

  const FEED_SLOTS = 4;
  const NAME_COOLDOWN = FEED_SLOTS * 4;
  const SURNAMES = ['김', '이', '박', '최', '정', '강', '조', '윤', '장', '임', '한', '오', '서', '신', '권', '황', '안', '송', '전', '홍', '유', '고', '문', '양', '손', '배', '백', '허', '남', '심'];
  const GIVEN = ['은', '호', '영', '진', '우', '서', '민', '아', '준', '현', '수', '지', '윤', '하', '린', '솔', '빈', '재', '성', '혜', '나', '율', '원', '기', '태', '석', '희', '정', '훈', '경'];
  const NAME_POOL = SURNAMES.flatMap((sur) => GIVEN.map((tail) => `${sur}○${tail}`));
  const ACTIONS = ['방금 출근했어요', '자리를 가져갔어요', '라인에 들어왔어요', '근무를 시작했어요'];
  const FALLBACK_PARTNERS = ['DHL', 'CJ대한통운', 'FedEx', 'UPS', 'GXO'];

  let settings = { bot_enabled: true, crowd_min: 8, crowd_max: 24, burn_per_minute: 2 };
  let feedCache = { bucket: -1, items: [] };
  let nameCooldown = [];
  let applying = false;
  const slotCaps = new Map();

  function esc(value) {
    return String(value ?? '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#039;');
  }

  function seed(value) {
    const text = String(value || '');
    let hash = 0;
    for (let i = 0; i < text.length; i += 1) hash = (hash * 33 + text.charCodeAt(i)) >>> 0;
    return hash;
  }

  function rng(seedValue) {
    let t = seedValue >>> 0;
    return function next() {
      t = Math.imul(t ^ (t >>> 15), t | 1) >>> 0;
      t ^= t + (Math.imul(t ^ (t >>> 7), t | 61) >>> 0);
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  function shuffle(list, random) {
    const arr = list.slice();
    for (let i = arr.length - 1; i > 0; i -= 1) {
      const j = Math.floor(random() * (i + 1));
      [arr[i], arr[j]] = [arr[j], arr[i]];
    }
    return arr;
  }

  function partnerList() {
    const visible = Array.from(document.querySelectorAll('.node-company'))
      .map((el) => String(el.textContent || '').trim())
      .filter(Boolean);
    return [...new Set(visible.length ? visible : FALLBACK_PARTNERS)];
  }

  function pickNames(count, random) {
    const recent = new Set(nameCooldown);
    const shuffled = shuffle(NAME_POOL, random);
    const picked = [];
    const usedSurnames = new Set();
    const take = (allowRecent, allowSameSurname) => {
      for (const name of shuffled) {
        if (picked.length >= count) break;
        if (picked.includes(name)) continue;
        if (!allowRecent && recent.has(name)) continue;
        const surname = name.charAt(0);
        if (!allowSameSurname && usedSurnames.has(surname)) continue;
        picked.push(name);
        usedSurnames.add(surname);
      }
    };
    take(false, false);
    if (picked.length < count) take(false, true);
    if (picked.length < count) take(true, true);
    nameCooldown = nameCooldown.concat(picked).slice(-NAME_COOLDOWN);
    return picked;
  }

  function pickPartners(count, random) {
    const list = partnerList();
    const shuffled = shuffle(list, random);
    const out = [];
    for (let i = 0; i < count; i += 1) {
      const previous = out[i - 1];
      const unused = shuffled.filter((name) => !out.includes(name));
      const noAdjacent = shuffled.filter((name) => name !== previous);
      const source = unused.length ? unused : (noAdjacent.length ? noAdjacent : shuffled);
      out.push(source[0] || shuffled[i % shuffled.length] || 'DHL');
    }
    return out;
  }

  function buildFeed(bucket) {
    const random = rng(seed(`${bucket}-${settings.crowd_max}-${settings.burn_per_minute}-${NAME_POOL.length}`));
    const names = pickNames(FEED_SLOTS, random);
    const partners = pickPartners(FEED_SLOTS, random);
    return Array.from({ length: FEED_SLOTS }, (_, index) => {
      const roll = seed(`${bucket}-${index}-${names[index]}-${partners[index]}`);
      const action = ACTIONS[Math.floor(random() * ACTIONS.length)] || '방금 출근했어요';
      const ago = roll % 4 === 0 ? '방금' : `${(roll % 7) + 1}분 전`;
      return { name: names[index] || NAME_POOL[index], action, partner: partners[index] || 'DHL', ago };
    });
  }

  function currentFeed() {
    const bucket = Math.floor(Date.now() / 8000);
    if (feedCache.bucket === bucket && feedCache.items.length === FEED_SLOTS) return feedCache.items;
    const items = buildFeed(bucket);
    feedCache = { bucket, items };
    return items;
  }

  function pulse() {
    if (!settings.bot_enabled) return { on: false, crowd: 0, burn: 0, feed: [] };
    const span = Math.max(0, settings.crowd_max - settings.crowd_min);
    const wave = 0.5 + 0.5 * Math.sin(Date.now() / 9000);
    return {
      on: true,
      crowd: Math.round(settings.crowd_min + span * wave),
      burn: settings.burn_per_minute,
      feed: currentFeed()
    };
  }

  function metric(value) {
    return `<span class="fomo-metric-num">${Number(value || 0).toLocaleString('ko-KR')}</span>`;
  }

  function feedHtml(items) {
    const rows = items.slice(0, FEED_SLOTS);
    while (rows.length < FEED_SLOTS) rows.push({ name: '\u00a0', action: '\u00a0', partner: '\u00a0', ago: '\u00a0' });
    return rows.map((item) => `<li><span class="fomo-feed-copy"><strong>${esc(item.name)}</strong> 님이 ${esc(item.partner)} 라인에서 ${esc(item.action)}</span><span class="fomo-feed-ago">${esc(item.ago)}</span></li>`).join('');
  }

  function isNodesPage() {
    return Boolean(document.querySelector('[data-nav="nodes"].active'));
  }

  function boardHtml() {
    const p = pulse();
    const nodesPage = isNodesPage();
    const title = nodesPage ? '지금 라인' : '지금 작업실';
    if (!p.on) {
      return `<section class="fomo-board is-off" aria-label="${title}"><p class="fomo-off-copy"><span>지금은 방금 들어온 크루 안내를 잠시 쉬고 있어요.</span></p></section>`;
    }
    return `<section class="fomo-board" aria-label="${title}" data-fomo-bot-runtime="1">
      <div class="fomo-metrics">
        <div><div class="metric-label">지금 활동</div><div class="metric-value" id="fomoCrowd">${metric(p.crowd)}<small>명</small></div></div>
        <div><div class="metric-label">자리 소진</div><div class="metric-value" id="fomoBurn">${metric(p.burn)}<small>칸/분</small></div></div>
      </div>
      <p class="fomo-kicker"><span>${nodesPage ? '방금 라인' : '방금 들어온 크루'}</span></p>
      <ul class="fomo-feed" id="fomoFeed">${feedHtml(p.feed)}</ul>
    </section>`;
  }

  function captureSlotCap(el) {
    const key = el.getAttribute('data-fomo-slot') || '';
    if (!key) return 0;
    if (slotCaps.has(key)) return slotCaps.get(key);
    const match = String(el.textContent || '').match(/([\d,]+)/);
    const cap = match ? Number(match[1].replace(/,/g, '')) : 0;
    if (Number.isFinite(cap) && cap >= 0) slotCaps.set(key, cap);
    return slotCaps.get(key) || 0;
  }

  function slotsLeft(el) {
    const cap = captureSlotCap(el);
    if (!settings.bot_enabled || !cap) return cap;
    const key = el.getAttribute('data-fomo-slot') || '';
    const minutes = Math.floor((Date.now() / 60000) % 180);
    const burned = Math.min(cap, (minutes * settings.burn_per_minute + (seed(key) % 7)) % (cap + 1));
    return Math.max(0, cap - burned);
  }

  function apply() {
    if (applying) return;
    applying = true;
    try {
      const board = document.querySelector('.fomo-board');
      if (board) {
        const wrap = document.createElement('div');
        wrap.innerHTML = boardHtml();
        const next = wrap.firstElementChild;
        if (next && board.outerHTML !== next.outerHTML) board.replaceWith(next);
      }
      document.querySelectorAll('[data-fomo-slot]').forEach((el) => {
        const next = `${slotsLeft(el).toLocaleString('ko-KR')}자리 남음`;
        if (el.textContent !== next) el.textContent = next;
      });
    } finally {
      applying = false;
    }
  }

  async function hydrateSettings() {
    try {
      const config = window.PUTDUK_CONFIG || {};
      if (!window.supabase || !config.supabaseUrl || !config.supabasePublishableKey) return;
      const client = window.supabase.createClient(config.supabaseUrl, config.supabasePublishableKey, {
        auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false }
      });
      const result = await client
        .from('crew_pulse')
        .select('live,crowd_min,crowd_max,burn_per_minute')
        .eq('id', 1)
        .maybeSingle();
      if (result.error || !result.data) return;
      const minRaw = Number(result.data.crowd_min ?? 8);
      const maxRaw = Number(result.data.crowd_max ?? 24);
      const burnRaw = Number(result.data.burn_per_minute ?? 2);
      const min = Number.isFinite(minRaw) ? Math.min(Math.max(0, Math.round(minRaw)), 10000) : 8;
      const max = Number.isFinite(maxRaw) ? Math.min(Math.max(min, Math.round(maxRaw)), 10000) : Math.max(min, 24);
      settings = {
        bot_enabled: result.data.live !== false,
        crowd_min: min,
        crowd_max: max,
        burn_per_minute: Number.isFinite(burnRaw) ? Math.min(Math.max(0, Math.round(burnRaw)), 100000) : 2
      };
    } catch (_) {}
  }

  let scheduled = false;
  const scheduleApply = () => {
    if (scheduled) return;
    scheduled = true;
    queueMicrotask(() => {
      scheduled = false;
      apply();
    });
  };

  const observer = new MutationObserver(scheduleApply);
  observer.observe(document.documentElement, { subtree: true, childList: true, characterData: true });

  hydrateSettings().finally(apply);
  setInterval(() => {
    if (!document.hidden) apply();
  }, 4000);
})();
