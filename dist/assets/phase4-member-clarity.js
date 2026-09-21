(() => {
  'use strict';

  if (document.documentElement.dataset.mode !== 'member') return;
  if (window.__PUTDUK_PHASE4_MEMBER_CLARITY__) return;
  window.__PUTDUK_PHASE4_MEMBER_CLARITY__ = true;

  const HELP_TOPICS = [
    { id: 'work', title: '오늘 근무', copy: '업무 선택부터 제출·검수까지' },
    { id: 'badge', title: '사원증', copy: '사원번호·협력사 표시 기준' },
    { id: 'pay', title: '정산·지갑', copy: '지원금·업무잔액·수당 구분' },
    { id: 'out', title: '출금', copy: '수당·원금 포함 출금 기준' }
  ];

  function text(node) {
    return String(node?.textContent || '').replace(/\s+/g, ' ').trim();
  }

  function pageTitle(label) {
    return Array.from(document.querySelectorAll('h1.page-title')).find((node) => text(node) === label) || null;
  }

  function replaceText(root, replacements) {
    if (!(root instanceof Element)) return;
    const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
    let node = walker.nextNode();
    while (node) {
      let next = String(node.nodeValue || '');
      for (const [from, to] of replacements) next = next.replace(from, to);
      if (next !== node.nodeValue) node.nodeValue = next;
      node = walker.nextNode();
    }
  }

  function enhanceBenefits() {
    const title = pageTitle('등급·혜택');
    if (!title) return;
    const heading = title.closest('.section-heading');
    const firstCopy = heading?.querySelector('.page-copy');
    if (firstCopy) firstCopy.textContent = '현재 회원 단계와 각 단계에서 이용 가능한 업무 범위를 확인하세요.';

    if (heading && !document.querySelector('[data-phase4-tier-terms]')) {
      const terms = document.createElement('section');
      terms.className = 'phase4-tier-terms';
      terms.dataset.phase4TierTerms = '1';
      terms.setAttribute('aria-label', '등급과 업무 조건 용어 안내');
      terms.innerHTML = `
        <div><span>회원 단계</span><strong>현재 회원에게 표시되는 단계</strong></div>
        <div><span>업무 조건</span><strong>잔액·완료 기록 등 실제 조건으로 이용 여부 결정</strong></div>
        <div><span>다음 단계</span><strong>조건 충족 시 이용 가능한 업무 범위가 넓어지는 단계</strong></div>`;
      heading.insertAdjacentElement('afterend', terms);
    }

    const grid = document.querySelector('.benefit-grid.benefit-ladder');
    if (grid) {
      replaceText(grid, [
        [/다음 한 칸씩 완료 해금/g, '완료 기록에 따라 다음 업무 단계 이용 가능'],
        [/한 칸씩 해금/g, '조건 충족 시 순차 이용'],
        [/해금/g, '이용 가능']
      ]);
      grid.querySelectorAll('.benefit-card').forEach((card) => {
        const name = text(card.querySelector('h3')) || '회원 단계';
        card.setAttribute('aria-label', `${name} 단계 혜택`);
      });
    }

    const ladder = document.querySelector('.next-ladder-card');
    if (ladder) {
      ladder.dataset.phase4LadderClarity = '1';
      ladder.setAttribute('aria-label', '다음 업무 단계 조건');
      replaceText(ladder, [
        [/상위 라인 해금 게이지/g, '다음 업무 단계 조건'],
        [/다음 라인이 해금되었어요!/g, '다음 업무 단계를 이용할 수 있어요!'],
        [/라인이 즉시 열려요/g, '업무 이용 조건을 충족해요'],
        [/바로 열기/g, '조건 확인'],
        [/해금/g, '이용 가능']
      ]);
    }

    const note = document.querySelector('.benefit-note, .uiux-benefit-policy');
    if (note && note.dataset.phase4WithdrawalTruth !== '1') {
      note.dataset.phase4WithdrawalTruth = '1';
      const noteTitle = note.querySelector('h2');
      if (noteTitle) noteTitle.textContent = '업무잔액을 포함해 출금할 때';
      const lines = Array.from(note.querySelectorAll('.help-line span'));
      if (lines[0]) lines[0].textContent = '원금 포함 출금이 완료되면 완료된 원금만큼 업무잔액이 줄어요.';
      if (lines[1]) lines[1].textContent = '원금 출금 자체로 회원 등급·혜택·라인은 바뀌지 않아요.';
      if (lines[2]) lines[2].textContent = '남은 업무잔액이 필요한 보증금보다 적으면 해당 업무는 새로 시작할 수 없어요.';
      if (lines[3]) lines[3].textContent = '실제 이용 가능 여부는 출금 완료 후 서버의 잔액과 업무 조건으로 다시 판단해요.';
      const trailing = note.querySelector('.page-copy');
      if (trailing) trailing.textContent = '화면에서 등급이나 업무 상태를 임의로 바꾸지 않습니다.';
    }
  }

  function enhanceReferrals() {
    const title = pageTitle('추천 프로그램') || pageTitle('추천인 혜택');
    if (!title) return;
    if (title.textContent !== '추천 프로그램') title.textContent = '추천 프로그램';
    const heading = title.closest('.section-heading');
    const copy = heading?.querySelector('.page-copy');
    if (copy) copy.textContent = '기본 보상액, 확정 조건, 처리 상태를 한곳에서 확인하세요.';

    const overview = heading?.nextElementSibling;
    if (heading && !document.querySelector('[data-phase4-referral-terms]')) {
      const terms = document.createElement('section');
      terms.className = 'phase4-referral-terms';
      terms.dataset.phase4ReferralTerms = '1';
      terms.setAttribute('aria-label', '추천 보상 기준');
      terms.innerHTML = `
        <div><span>기본 보상액</span><strong>5,000원</strong><small>추천 관계 1건 기준 기본값</small></div>
        <div><span>확정 조건</span><strong>실제 입금 · 유효 업무 완료 · 검수 통과</strong><small>서버에 기록된 상태로 확인</small></div>
        <div><span>지갑 반영</span><strong>조건 확인 후 보상 확정 시 반영</strong><small>실제 금액은 확정 원장 기록 기준</small></div>`;
      if (overview) overview.insertAdjacentElement('beforebegin', terms);
      else heading.insertAdjacentElement('afterend', terms);
    }

    const codeCard = document.querySelector('.uiux-referral-code-card, .grid-hero .hero-card');
    const heroCopy = codeCard?.querySelector('.hero-copy');
    if (heroCopy) heroCopy.textContent = '초대한 회원이 실제 입금과 유효한 업무를 완료하고 검수를 통과하면 보상 조건을 충족해요. 확정된 보상만 지갑에 반영됩니다.';

    const funnel = codeCard?.querySelector('.referral-funnel');
    if (funnel) {
      funnel.setAttribute('aria-label', '추천 보상 확정 절차');
      const last = funnel.lastElementChild;
      if (last) last.textContent = '확정·반영';
    }

    const stats = document.querySelector('.uiux-referral-stats-card, .referral-stats');
    if (stats && !stats.querySelector('[data-phase4-referral-ledger-note]')) {
      const note = document.createElement('p');
      note.className = 'phase4-referral-ledger-note';
      note.dataset.phase4ReferralLedgerNote = '1';
      note.textContent = '표시 금액과 지급 여부는 서버의 추천 보상 원장 기록을 기준으로 합니다.';
      stats.appendChild(note);
    }
  }

  function enhanceHelp() {
    const title = pageTitle('도움말');
    if (!title) return;
    const heading = title.closest('.section-heading');
    const copy = heading?.querySelector('.page-copy');
    if (copy) copy.textContent = '궁금한 주제를 먼저 고르면 핵심 안내로 바로 이동합니다.';

    const tabs = document.querySelector('.help-tabs');
    if (tabs) {
      tabs.setAttribute('role', 'tablist');
      tabs.setAttribute('aria-label', '도움말 주제');
      tabs.querySelectorAll('[data-help-tab]').forEach((button) => {
        button.setAttribute('role', 'tab');
        button.setAttribute('aria-selected', button.classList.contains('active') ? 'true' : 'false');
        button.setAttribute('aria-controls', 'phase4HelpBody');
      });
    }

    if (heading && !document.querySelector('[data-phase4-help-index]')) {
      const index = document.createElement('nav');
      index.className = 'phase4-help-index';
      index.dataset.phase4HelpIndex = '1';
      index.setAttribute('aria-label', '도움말 빠른 찾기');
      index.innerHTML = HELP_TOPICS.map((topic) => `
        <button type="button" data-help-tab="${topic.id}">
          <strong>${topic.title}</strong><span>${topic.copy}</span>
        </button>`).join('');
      heading.insertAdjacentElement('afterend', index);
    }

    const body = document.querySelector('.help-body');
    if (body) {
      body.id = 'phase4HelpBody';
      body.setAttribute('role', 'tabpanel');
      body.setAttribute('aria-live', 'polite');
    }

    const accordion = document.querySelector('.help-accordion');
    if (accordion && !accordion.previousElementSibling?.classList?.contains('phase4-help-more-title')) {
      const more = document.createElement('h2');
      more.className = 'phase4-help-more-title';
      more.textContent = '자주 찾는 추가 안내';
      accordion.insertAdjacentElement('beforebegin', more);
    }

    const channel = document.querySelector('.help-channel');
    if (accordion && channel && accordion.nextElementSibling !== channel) {
      accordion.insertAdjacentElement('afterend', channel);
    }
  }

  function enhance() {
    enhanceBenefits();
    enhanceReferrals();
    enhanceHelp();
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

  function boot() {
    enhance();
    const app = document.getElementById('app');
    if (app) observer.observe(app, { childList: true, subtree: true });
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot, { once: true });
  else boot();
})();
