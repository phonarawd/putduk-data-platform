(() => {
  'use strict';

  const root = document.documentElement;
  if (root.dataset.mode !== 'member') return;
  root.dataset.uiuxGrowth = '2026-09';

  function text(element) {
    return String(element?.textContent || '').trim();
  }

  function enhanceBenefits() {
    const title = Array.from(document.querySelectorAll('.page-title'))
      .find((node) => text(node) === '등급·혜택');
    if (!title) return;

    const heading = title.closest('.section-heading');
    heading?.classList.add('uiux-growth-heading', 'uiux-benefits-heading');
    title.textContent = '등급·혜택';

    const copies = heading ? Array.from(heading.querySelectorAll('.page-copy')) : [];
    if (copies[0]) copies[0].textContent = '현재 등급과 다음 단계에서 달라지는 업무 기회와 혜택을 한눈에 확인하세요.';
    if (copies[1]) copies[1].classList.add('uiux-benefits-quota');

    const grid = document.querySelector('.benefit-grid.benefit-ladder');
    if (!grid) return;
    grid.classList.add('uiux-tier-roadmap');
    grid.setAttribute('aria-label', '등급별 혜택 비교');

    const cards = Array.from(grid.querySelectorAll('.benefit-card'));
    cards.forEach((card, index) => {
      card.classList.add('uiux-tier-row');
      card.style.setProperty('--uiux-tier-order', String(index + 1));
      const badge = card.querySelector('.benefit-badge');
      if (badge) badge.setAttribute('aria-hidden', 'true');
    });

    const current = document.querySelector('.benefit-card.is-current');
    if (!current) return;
    current.classList.add('uiux-tier-current');

    const currentIndex = cards.indexOf(current);
    const next = currentIndex >= 0 ? cards[currentIndex + 1] : null;
    if (next) next.classList.add('uiux-tier-next');

    if (!document.querySelector('.uiux-tier-overview')) {
      const overview = document.createElement('section');
      overview.className = 'uiux-tier-overview';
      overview.setAttribute('aria-label', '현재 등급 요약');

      const summary = document.createElement('div');
      summary.className = 'uiux-tier-summary';
      const currentName = text(current.querySelector('h3')) || '현재 등급';
      const currentLadder = text(current.querySelector('.benefit-ladder'));
      summary.innerHTML = `<span class="uiux-growth-eyebrow">현재 등급</span><h2>${currentName}</h2>${currentLadder ? `<p>${currentLadder}</p>` : ''}`;

      const stats = current.querySelector('.benefit-stats');
      if (stats) {
        const statWrap = document.createElement('div');
        statWrap.className = 'uiux-tier-current-stats';
        Array.from(stats.children).forEach((item) => statWrap.appendChild(item.cloneNode(true)));
        summary.appendChild(statWrap);
      }

      const nextBox = document.createElement('div');
      nextBox.className = 'uiux-tier-next-summary';
      if (next) {
        const nextName = text(next.querySelector('h3'));
        const nextLadder = text(next.querySelector('.benefit-ladder'));
        nextBox.innerHTML = `<span class="uiux-growth-eyebrow">다음 단계</span><strong>${nextName}</strong>${nextLadder ? `<p>${nextLadder}</p>` : ''}`;
      } else {
        nextBox.innerHTML = '<span class="uiux-growth-eyebrow">현재 상태</span><strong>최고 등급</strong><p>현재 표시된 등급 중 가장 높은 단계예요.</p>';
      }

      overview.append(summary, nextBox);
      grid.insertAdjacentElement('beforebegin', overview);
    }

    const note = document.querySelector('.benefit-note');
    if (note) {
      note.classList.add('uiux-benefit-policy');
      const noteTitle = note.querySelector('h2');
      if (noteTitle) noteTitle.textContent = '업무 잔액을 포함해 출금할 때';
      const lines = Array.from(note.querySelectorAll('.help-line'));
      if (lines[0]?.querySelector('span')) lines[0].querySelector('span').textContent = '업무 잔액까지 출금하면 현재 등급과 이용 가능한 업무 조건이 달라질 수 있어요.';
      if (lines[1]?.querySelector('span')) lines[1].querySelector('span').textContent = '등급 변경 여부와 적용 범위는 실제 신청 화면에 표시되는 조건을 확인해 주세요.';
      if (lines[2]?.querySelector('span')) lines[2].querySelector('span').textContent = '업무 잔액이 없어지면 일부 업무가 더 이상 표시되지 않을 수 있어요.';
    }
  }

  function enhanceReferrals() {
    const title = Array.from(document.querySelectorAll('.page-title'))
      .find((node) => ['추천인 혜택', '추천 프로그램'].includes(text(node)));
    if (!title) return;

    title.textContent = '추천 프로그램';
    const heading = title.closest('.section-heading');
    heading?.classList.add('uiux-growth-heading', 'uiux-referral-heading');
    const copy = heading?.querySelector('.page-copy');
    if (copy) copy.textContent = '내 추천 코드와 초대 현황, 보상 처리 상태를 한곳에서 확인하세요.';

    const copyButton = heading?.querySelector('[data-action="copy-referral"]');
    if (copyButton) copyButton.setAttribute('aria-label', '내 추천 코드 복사');

    const heroGrid = title.closest('.section-heading')?.nextElementSibling;
    if (heroGrid?.classList.contains('grid-hero')) {
      heroGrid.classList.add('uiux-referral-overview');
      const codeCard = heroGrid.querySelector('.hero-card');
      const statsCard = heroGrid.querySelector('.referral-stats');

      if (codeCard) {
        codeCard.classList.add('uiux-referral-code-card');
        const eyebrow = codeCard.querySelector('.eyebrow');
        if (eyebrow) {
          eyebrow.classList.add('uiux-growth-eyebrow');
          Array.from(eyebrow.querySelectorAll('.pulse-dot')).forEach((dot) => dot.remove());
          eyebrow.textContent = '내 추천 코드';
        }

        const inlineCopy = codeCard.querySelector('[data-action="copy-referral"]');
        const codeLine = inlineCopy?.parentElement;
        if (codeLine) {
          codeLine.classList.add('uiux-referral-code-line');
          const codeValue = Array.from(codeLine.children).find((child) => child !== inlineCopy);
          codeValue?.classList.add('uiux-referral-code-value');
        }

        const heroCopy = codeCard.querySelector('.hero-copy');
        if (heroCopy) heroCopy.textContent = '추천 보상은 초대한 회원의 실제 서버 상태가 조건을 충족한 경우에만 확정돼요.';

        const funnel = codeCard.querySelector('.referral-funnel');
        if (funnel) {
          funnel.classList.add('uiux-referral-steps');
          funnel.setAttribute('aria-label', '추천 보상 진행 단계');
          Array.from(funnel.children).forEach((item, index) => {
            item.dataset.step = String(index + 1);
          });
        }
      }

      if (statsCard) {
        statsCard.classList.add('uiux-referral-stats-card');
        const panelTitle = statsCard.querySelector('.panel-title');
        if (panelTitle) panelTitle.textContent = '추천 현황';
        const balance = statsCard.querySelector('.wallet-balance');
        if (balance && !statsCard.querySelector('.uiux-referral-balance-label')) {
          const label = document.createElement('span');
          label.className = 'uiux-referral-balance-label';
          label.textContent = '확정된 추천 보상';
          balance.insertAdjacentElement('beforebegin', label);
        }
        statsCard.querySelectorAll('.wallet-row').forEach((row) => row.classList.add('uiux-referral-stat-row'));
      }
    }

    const timelinePanel = Array.from(document.querySelectorAll('.panel'))
      .find((panel) => text(panel.querySelector('.panel-title')) === '추천 회원 단계');
    if (timelinePanel) {
      timelinePanel.classList.add('uiux-referral-timeline-card');
      const panelTitle = timelinePanel.querySelector('.panel-title');
      const subtitle = timelinePanel.querySelector('.panel-subtitle');
      if (panelTitle) panelTitle.textContent = '초대 진행 현황';
      if (subtitle) subtitle.textContent = '개인정보는 가린 상태로, 실제 서버에 기록된 진행 상태만 표시해요.';
      timelinePanel.querySelectorAll('.timeline-item').forEach((item) => item.classList.add('uiux-referral-timeline-item'));
    }
  }

  function enhance() {
    enhanceBenefits();
    enhanceReferrals();
  }

  let queued = false;
  const observer = new MutationObserver((records) => {
    if (!records.some((record) => record.addedNodes.length)) return;
    if (queued) return;
    queued = true;
    queueMicrotask(() => {
      queued = false;
      enhance();
    });
  });

  function start() {
    enhance();
    const app = document.getElementById('app');
    if (app) observer.observe(app, { childList: true, subtree: true });
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start, { once: true });
  else start();
})();
