(() => {
  'use strict';

  if (document.documentElement.dataset.mode !== 'member') return;
  if (window.__PUTDUK_PHASE5_MEMBER_FOCUS__) return;
  window.__PUTDUK_PHASE5_MEMBER_FOCUS__ = true;

  function text(node) {
    return String(node?.textContent || '').replace(/\s+/g, ' ').trim();
  }

  function parseKrw(value) {
    const normalized = String(value || '').replace(/[^0-9.-]/g, '');
    if (!normalized) return null;
    const amount = Number(normalized);
    return Number.isFinite(amount) ? amount : null;
  }

  function pageTitle(label) {
    return Array.from(document.querySelectorAll('h1.page-title')).find((node) => text(node) === label) || null;
  }

  function workBalanceText() {
    const slot = Array.from(document.querySelectorAll('.wallet-slot'))
      .find((node) => text(node).includes('업무잔액'));
    return text(slot?.querySelector('strong'));
  }

  function restoreProgressCard(card) {
    card.hidden = false;
    card.classList.remove('phase5-progress-zero');
    card.querySelector('[data-phase5-progress-note]')?.remove();
    card.querySelectorAll('[data-phase5-progress-original]').forEach((node) => {
      node.hidden = false;
      node.removeAttribute('data-phase5-progress-original');
    });
  }

  function showZeroProgressState(card) {
    if (!card.querySelector('[data-phase5-progress-note]')) {
      Array.from(card.children).forEach((node) => {
        node.dataset.phase5ProgressOriginal = '1';
        node.hidden = true;
      });
      const note = document.createElement('div');
      note.className = 'phase5-progress-empty';
      note.dataset.phase5ProgressNote = '1';
      note.innerHTML = '<span>다음 업무 단계</span><strong>업무잔액이 생기면 진행률을 표시해요.</strong><p>0% 게이지 대신 실제 잔액이 반영된 뒤 다음 업무 조건을 보여드립니다.</p>';
      card.appendChild(note);
    }
    card.hidden = false;
    card.classList.add('phase5-progress-zero');
    card.dataset.phase5ProgressState = 'zero';
  }

  function enhanceProgress() {
    const card = document.querySelector('.next-ladder-card');
    if (!card) return;

    const workText = workBalanceText();
    if (!workText || workText === '확인 필요') {
      card.hidden = true;
      card.dataset.phase5ProgressState = 'loading';
      return;
    }

    const workAmount = parseKrw(workText);
    if (workAmount == null) {
      card.hidden = true;
      card.dataset.phase5ProgressState = 'unknown';
      return;
    }

    if (workAmount <= 0) {
      showZeroProgressState(card);
      return;
    }

    restoreProgressCard(card);
    card.dataset.phase5ProgressState = 'ready';
  }

  function enhanceFomoTruth() {
    document.querySelectorAll('.fomo-board:not(.is-off)').forEach((board) => {
      const metrics = Array.from(board.querySelectorAll('.fomo-metric-num')).map((node) => Number(text(node).replace(/,/g, '')) || 0);
      const feedEmpty = Boolean(board.querySelector('.fomo-feed-empty'));
      const noRecentActivity = metrics.length >= 2 && metrics.every((value) => value === 0) && feedEmpty;
      board.classList.toggle('phase5-fomo-empty', noRecentActivity);
      board.dataset.phase5ActivityTruth = noRecentActivity ? 'none' : 'observed';
      const kicker = board.querySelector('.fomo-kicker span');
      if (kicker) {
        const label = noRecentActivity ? '현재 확인된 최근 활동 없음' : '실제 최근 활동';
        if (text(kicker) !== label) kicker.textContent = label;
      }
    });
  }

  function enhanceMembership() {
    const title = pageTitle('사원증');
    if (!title) return;
    const page = title.closest('.membership-page') || document.querySelector('.membership-page');
    if (!page) return;

    const heading = title.closest('.section-heading');
    const copy = heading?.querySelector('.page-copy');
    if (copy) {
      const memberCopy = '이름·사원번호·오늘 라인을 확인하는 카드예요. 현재 등급은 카드 앞면에 한 번만 표시합니다.';
      if (text(copy) !== memberCopy) copy.textContent = memberCopy;
    }

    const duplicateBadge = heading?.querySelector('.status-badge.gold');
    if (duplicateBadge) {
      duplicateBadge.hidden = true;
      duplicateBadge.dataset.phase5DuplicateTier = 'header';
    }

    const backMeta = page.querySelector('.id-back-meta');
    if (backMeta) {
      const children = Array.from(backMeta.children);
      const tier = children.find((node) => node !== children[0] && /등급/.test(text(node)));
      if (tier) {
        tier.hidden = true;
        tier.dataset.phase5DuplicateTier = 'back';
      }
      const separator = backMeta.querySelector('.id-back-sep');
      if (separator && tier) separator.hidden = true;
    }

    const benefitLink = page.querySelector('[data-nav="benefits"]');
    if (benefitLink) {
      const label = text(benefitLink);
      if (label.includes('등급·혜택') && !label.includes('상세')) {
        benefitLink.childNodes.forEach((node) => {
          if (node.nodeType === Node.TEXT_NODE && String(node.nodeValue || '').includes('등급·혜택 보기')) {
            node.nodeValue = String(node.nodeValue).replace('등급·혜택 보기', '등급·혜택 상세 보기');
          }
        });
      }
    }

    page.dataset.phase5MembershipFocus = 'identity';
  }

  function enhance() {
    enhanceProgress();
    enhanceFomoTruth();
    enhanceMembership();
  }

  let queued = false;
  const observer = new MutationObserver((records) => {
    if (!records.some((record) => record.addedNodes.length || record.type === 'characterData')) return;
    if (queued) return;
    queued = true;
    queueMicrotask(() => {
      queued = false;
      enhance();
    });
  });

  function boot() {
    enhance();
    const app = document.getElementById('app');
    if (app) observer.observe(app, { childList: true, subtree: true, characterData: true });
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot, { once: true });
  else boot();
})();
