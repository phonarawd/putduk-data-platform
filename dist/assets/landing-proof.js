(() => {
  'use strict';
  const cfg = window.PUTDUK_CONFIG || {};
  if (!cfg.supabaseUrl || !cfg.supabasePublishableKey) return;
  const headers = { apikey: cfg.supabasePublishableKey, Authorization: `Bearer ${cfg.supabasePublishableKey}` };
  const esc = (v) => String(v ?? '').replace(/[&<>"']/g, (c) => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#039;'}[c]));
  const typeLabel = (v) => ({ actual_automatic:'실제 집계', operator_confirmed:'운영자 확인', goal:'목표' }[v] || '');
  const dateLabel = (v) => {
    const d = new Date(v); if (Number.isNaN(d.getTime())) return '';
    return d.toLocaleDateString('ko-KR', { year:'numeric', month:'long', day:'numeric' });
  };
  async function get(path) {
    const response = await fetch(`${cfg.supabaseUrl}/rest/v1/${path}`, { headers, cache:'no-store' });
    if (!response.ok) throw new Error('landing content unavailable');
    return response.json();
  }
  function metricHtml(item) {
    return `<article class="landing-live-metric"><strong data-count="${Number(item.metric_value || 0)}">0</strong><span>${esc(item.label_ko)}</span><small>${esc(typeLabel(item.value_type))} · ${esc(dateLabel(item.measured_at))} 기준</small></article>`;
  }
  function reviewHtml(item) {
    const verified = item.review_type === 'verified_member' && item.is_work_verified;
    return `<article class="landing-review-card"><div><strong>${esc(item.author_display)}</strong><span class="pill ${verified ? 'ok':'wait'}">${verified ? '동의 확인 후기':'이용 예시'}</span></div><p>${esc(item.body_ko)}</p>${item.completed_work_label ? `<small>${esc(item.completed_work_label)}</small>` : ''}</article>`;
  }
  function animateCounts(root) {
    const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;
    root.querySelectorAll('[data-count]').forEach((el) => {
      const end = Number(el.dataset.count || 0);
      if (reduced) { el.textContent = end.toLocaleString('ko-KR'); return; }
      const start = performance.now();
      const tick = (now) => {
        const p = Math.min(1, (now - start) / 650);
        el.textContent = Math.round(end * (1 - Math.pow(1 - p, 3))).toLocaleString('ko-KR');
        if (p < 1) requestAnimationFrame(tick);
      };
      requestAnimationFrame(tick);
    });
  }
  function startReviews(track, count) {
    if (count < 4 || matchMedia('(prefers-reduced-motion: reduce)').matches) return;
    let paused = false;
    track.addEventListener('pointerenter', () => { paused = true; });
    track.addEventListener('pointerleave', () => { paused = false; });
    setInterval(() => {
      if (paused || !document.body.contains(track)) return;
      const card = track.querySelector('.landing-review-card');
      if (!card) return;
      const gap = 14;
      const next = track.scrollLeft + card.getBoundingClientRect().width + gap;
      if (next >= track.scrollWidth - track.clientWidth - 4) track.scrollTo({ left:0, behavior:'smooth' });
      else track.scrollTo({ left:next, behavior:'smooth' });
    }, 4200);
  }
  async function mount() {
    const landing = document.querySelector('.public-landing main');
    if (!landing || landing.querySelector('[data-landing-proof]')) return;
    try {
      const [metrics, reviews] = await Promise.all([
        get('landing_metric_settings?select=id,metric_key,label_ko,metric_value,value_type,source_note,measured_at,sort_order,updated_at&order=sort_order.asc,updated_at.desc'),
        get('landing_reviews?select=id,author_display,body_ko,completed_work_label,review_type,is_work_verified,sort_order,public_starts_at,public_ends_at,updated_at&order=sort_order.asc,updated_at.desc')
      ]);
      if (!metrics.length && !reviews.length) return;
      const section = document.createElement('section');
      section.className = 'landing-proof';
      section.dataset.landingProof = '1';
      section.innerHTML = `<div class="landing-section-head"><p>확인 가능한 퍼뜩 현황</p><h2>숫자와 후기는 근거를 구분해 보여드립니다.</h2></div>
        ${metrics.length ? `<div class="landing-live-metrics">${metrics.map(metricHtml).join('')}</div>` : ''}
        ${reviews.length ? `<div class="landing-review-heading"><h3>퍼뜩 이용 이야기</h3><p>실제 후기는 동의 여부를 확인하고, 예시는 예시로 표시합니다.</p></div><div class="landing-review-track" tabindex="0" aria-label="퍼뜩 이용 후기">${reviews.map(reviewHtml).join('')}</div>` : ''}`;
      const finalCta = landing.querySelector('.landing-final-cta');
      landing.insertBefore(section, finalCta || null);
      animateCounts(section);
      const track = section.querySelector('.landing-review-track');
      if (track) startReviews(track, reviews.length);
    } catch (_) {}
  }
  const observer = new MutationObserver(() => mount());
  observer.observe(document.documentElement, { childList:true, subtree:true });
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', mount);
  else mount();
})();