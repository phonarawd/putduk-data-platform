(() => {
  'use strict';

  const root = document.documentElement;
  root.dataset.uiuxFinal = '2026-09';
  if (root.dataset.mode === 'admin') return;

  const EXACT_TEXT_REPLACEMENTS = new Map([
    ['오늘 라인', '오늘 업무'],
    ['라인 더 보기', '업무 더 보기'],
    ['오늘 라인 근무', '오늘 업무'],
    ['방금 라인', '방금 매칭'],
    ['지금 라인', '지금 업무'],
    ['신청하고 처리 중으로', '출금 신청']
  ]);

  const COPY_REPLACEMENTS = [
    ['라인 찾기', '업무 매칭'],
    ['정산·지갑', '지갑·정산'],
    ['중복확인', '중복 확인'],
    ['휴대폰번호', '휴대폰 번호'],
    ['업무잔액', '업무 잔액'],
    ['출금가능', '출금 가능'],
    ['USDT로만 출금 가능해요', 'USDT로만 출금할 수 있어요'],
    ['오늘 배정된 라인이에요. 잠금 금액과 수당을 보고 출근하세요.', '오늘 참여할 수 있는 업무예요. 시작 조건과 예상 수당을 확인한 뒤 진행해 주세요.'],
    ['운영자가 배정한 라인이나 공개된 근무가 여기에 나타나요.', '운영자가 배정했거나 지금 참여할 수 있는 업무가 여기에 표시돼요.'],
    ['운영자가 배정한 라인이나 공개된 근무가 여기에 보여요.', '운영자가 배정했거나 지금 참여할 수 있는 업무가 여기에 표시돼요.'],
    ['오늘 공개된 라인이 아직 없어요.', '오늘 참여할 수 있는 업무가 아직 없어요.'],
    ['배정된 라인을 업무 매칭에서 확인해요.', '배정된 업무를 업무 매칭에서 확인해요.'],
    ['로그인하면 오늘 라인에 출근해요', '지금 참여할 수 있는 업무'],
    ['오늘 라인 근무와 등급·혜택을 쉽게 안내해요.', '오늘 업무와 등급·혜택을 쉽게 안내해요.'],
    ['협력사 라인 근무', '협력사 업무 운영'],
    ['퍼뜩 라인 근무', '퍼뜩 업무'],
    ['나만의 노드 카드를 발급해요.', '가입 후 나만의 회원 카드를 발급해요.']
  ];

  const DASHBOARD_METRIC_LABELS = new Map([
    ['오늘 라인', '매칭 가능 업무'],
    ['오늘 업무', '매칭 가능 업무'],
    ['검수 완료', '완료한 업무'],
    ['오늘 작업 가능', '오늘 남은 횟수'],
    ['근무 상태', '현재 상태']
  ]);

  const JOURNEY_STEPS = ['오더 확인', '업무 수행', '운영자 검수', '정산 완료'];

  function replaceExactText(text) {
    const trimmed = text.trim();
    const replacement = EXACT_TEXT_REPLACEMENTS.get(trimmed);
    if (!replacement) return text;
    const start = text.indexOf(trimmed);
    return `${text.slice(0, start)}${replacement}${text.slice(start + trimmed.length)}`;
  }

  function normalizeText(value) {
    let text = replaceExactText(String(value || ''));
    for (const [from, to] of COPY_REPLACEMENTS) {
      if (text.includes(from)) text = text.split(from).join(to);
    }
    return text;
  }

  function normalizeAttributes(element) {
    if (!(element instanceof Element)) return;
    for (const name of ['aria-label', 'title']) {
      if (!element.hasAttribute(name)) continue;
      const before = element.getAttribute(name) || '';
      const after = normalizeText(before);
      if (after !== before) element.setAttribute(name, after);
    }
  }

  function setButtonText(button, label) {
    if (!(button instanceof Element)) return;
    Array.from(button.childNodes)
      .filter((node) => node.nodeType === Node.TEXT_NODE)
      .forEach((node) => node.remove());
    button.appendChild(document.createTextNode(` ${label}`));
  }

  function buildJourneyStepper(activeIndex, completeThrough = activeIndex - 1) {
    const wrapper = document.createElement('div');
    wrapper.className = 'uiux-journey-stepper';
    wrapper.setAttribute('aria-label', '업무 진행 단계');
    JOURNEY_STEPS.forEach((label, index) => {
      const step = document.createElement('div');
      step.className = 'uiux-journey-step';
      if (index <= completeThrough) step.classList.add('is-complete');
      if (index === activeIndex) step.classList.add('is-active');
      const number = document.createElement('span');
      number.className = 'uiux-journey-number';
      number.textContent = index <= completeThrough ? '✓' : String(index + 1);
      const text = document.createElement('span');
      text.className = 'uiux-journey-label';
      text.textContent = label;
      step.append(number, text);
      wrapper.appendChild(step);
    });
    return wrapper;
  }

  function ensureJourneyStepper(host, activeIndex, completeThrough = activeIndex - 1) {
    if (!(host instanceof Element)) return;
    const existing = host.querySelector(':scope > .uiux-journey-stepper');
    if (existing) return;
    host.prepend(buildJourneyStepper(activeIndex, completeThrough));
  }

  function relabelReceipt(receipt, options = {}) {
    if (!(receipt instanceof Element)) return;
    receipt.classList.add('uiux-work-document');
    if (!receipt.querySelector('.uiux-document-brand')) {
      const brand = document.createElement('div');
      brand.className = 'uiux-document-brand';
      brand.innerHTML = '<span>PUTDUK WORK RECORD</span><strong>퍼뜩 업무 기록</strong>';
      receipt.prepend(brand);
    }

    receipt.querySelectorAll('.work-receipt-row').forEach((row) => {
      const label = row.querySelector('.work-receipt-label');
      const value = row.querySelector('.work-receipt-val');
      if (!label) return;
      const current = String(label.textContent || '').trim();
      if (current === '지원금 잠금' || current === '근무 보증') label.textContent = '업무 시작 금액';
      else if (current === '수당' || current === '예정 수당') label.textContent = options.approved ? '확정 수당' : '예상 수당';
      else if (current === '시간') label.textContent = '예상 소요';
      else if (current === '제출') label.textContent = '제출 시각';
      else if (current === '검수 물량') label.textContent = '처리 업무';

      if (value && current === '검수 물량') {
        const text = String(value.textContent || '').trim();
        if (text.startsWith('오늘 배정 물량 ')) value.textContent = text.replace(/^오늘 배정 물량\s+/, '배정 항목 ');
      }
    });
  }

  function enhanceDashboardHero() {
    const hero = document.querySelector('.grid-hero .hero-card');
    if (!hero) return;

    const eyebrow = hero.querySelector('.eyebrow');
    if (eyebrow) {
      const textNodes = Array.from(eyebrow.childNodes).filter((node) => node.nodeType === Node.TEXT_NODE);
      textNodes.forEach((node) => node.remove());
      eyebrow.appendChild(document.createTextNode(' 지금 참여할 수 있는 업무'));
    }

    const title = hero.querySelector('.hero-title');
    if (title) {
      title.innerHTML = '내 조건에 맞는 업무를<br><span style="color:var(--emerald-strong)">확인해 보세요.</span>';
    }

    const copy = hero.querySelector('.hero-copy');
    if (copy) {
      copy.textContent = '현재 참여 가능한 업무와 필요한 조건을 한눈에 확인하고, 준비가 되면 바로 업무 매칭을 시작할 수 있어요.';
    }

    const matchingButton = hero.querySelector('.hero-actions [data-nav="nodes"]');
    if (matchingButton) {
      setButtonText(matchingButton, '업무 매칭 시작');
      matchingButton.setAttribute('aria-label', '업무 매칭 시작');
    }

    hero.querySelectorAll('.hero-metrics .metric-label').forEach((label) => {
      const current = String(label.textContent || '').trim();
      const next = DASHBOARD_METRIC_LABELS.get(current);
      if (!next) return;
      label.textContent = next;
      if (next === '매칭 가능 업무') {
        const unit = label.parentElement?.querySelector('.metric-value small');
        if (unit) unit.textContent = '건';
      }
    });

    hero.querySelectorAll('.hero-metrics .metric-value').forEach((value) => {
      if (String(value.textContent || '').trim() === '로그인 후 출근') value.textContent = '로그인 후 확인';
    });
  }

  function enhanceMatchingPage() {
    const heading = Array.from(document.querySelectorAll('.section-heading .page-title'))
      .find((node) => String(node.textContent || '').trim() === '업무 매칭');
    if (!heading) return;

    const sectionHeading = heading.closest('.section-heading');
    sectionHeading?.classList.add('uiux-matching-heading');
    const pageCopy = sectionHeading?.querySelector('.page-copy');
    if (pageCopy) {
      pageCopy.textContent = '업무별 시작 금액, 예상 수당, 예상 소요를 비교해 보세요. 업무를 선택하면 실제 진행 조건을 한 번 더 확인할 수 있어요.';
    }

    const filterRow = document.querySelector('.filter-row');
    if (filterRow) {
      filterRow.classList.add('uiux-matching-filters');
      filterRow.setAttribute('aria-label', '업무 유형');
    }

    const grid = document.getElementById('nodeGrid');
    if (!grid) return;
    grid.classList.add('uiux-matching-grid');

    grid.querySelectorAll('.node-card').forEach((card) => {
      card.classList.add('uiux-work-card');

      card.querySelectorAll('.node-money .money-line span').forEach((span) => {
        const current = String(span.textContent || '').trim();
        if (current.startsWith('지원금 잠금 ')) span.textContent = current.replace(/^지원금 잠금\s+/, '업무 시작 금액 ');
        else if (current.startsWith('근무 보증 ')) span.textContent = current.replace(/^근무 보증\s+/, '업무 시작 금액 ');
        else if (current.startsWith('수당 ')) span.textContent = current.replace(/^수당\s+/, '예상 수당 ');
      });

      card.querySelectorAll('.node-meta span').forEach((span) => {
        const current = String(span.textContent || '').trim();
        if (current.startsWith('시간 ')) {
          span.textContent = current.replace(/^시간\s+/, '예상 소요 ');
          return;
        }
        if (current.startsWith('남은 자리 ')) {
          const count = current.replace(/^남은 자리\s+/, '').replace(/건$/, '').trim();
          span.textContent = `참여 가능 ${count}건`;
        }
      });

      const button = card.querySelector('[data-start-node]');
      if (button) {
        const current = String(button.textContent || '').trim();
        if (current === '출근하기') setButtonText(button, '업무 시작');
        else if (current === '입금 안내') setButtonText(button, '시작 조건 확인');
        const title = String(card.querySelector('.node-title')?.textContent || '업무').trim();
        if (!button.disabled) button.setAttribute('aria-label', `${title} ${String(button.textContent || '').trim()}`);
      }
    });
  }

  function enhanceStartConfirm() {
    const backdrop = document.querySelector('[data-modal="start-confirm"]');
    if (!backdrop) return;
    const modal = backdrop.querySelector('.assign-modal');
    if (!modal) return;
    modal.classList.add('uiux-order-modal');
    const body = modal.querySelector('.modal-body');
    if (body) ensureJourneyStepper(body, 0, -1);

    const kicker = modal.querySelector('.assign-kicker');
    if (kicker) kicker.textContent = '업무 오더 확인';
    const receipt = modal.querySelector('.assign-receipt');
    relabelReceipt(receipt, { approved: false });

    const copy = modal.querySelector('.assign-copy');
    if (copy) {
      const current = String(copy.textContent || '');
      if (current.includes('상품명·가격·옵션·배송')) {
        copy.textContent = '배정된 상품 정보를 확인하고 상품명·가격·옵션·배송 항목을 오더와 동일하게 입력해 주세요.';
      } else if (current.includes('실물 라벨 번호')) {
        copy.textContent = '배정 전표와 실물 라벨을 한 건씩 대조해 주세요. 입력한 내용은 제출 후 운영자가 확인합니다.';
      }
    }

    const startButton = modal.querySelector('[data-action="confirm-start"]');
    if (startButton) {
      setButtonText(startButton, '업무 시작');
      startButton.setAttribute('aria-label', '업무 시작');
    }
    const laterButton = modal.querySelector('[data-action="close-start"]');
    if (laterButton && String(laterButton.textContent || '').trim() === '다음에') setButtonText(laterButton, '나중에');
  }

  function enhanceActiveWork() {
    const backdrops = Array.from(document.querySelectorAll('.player-backdrop'))
      .filter((node) => node.getAttribute('data-modal') !== 'review-wait');
    backdrops.forEach((backdrop) => {
      const card = backdrop.querySelector('.player-card');
      if (!card) return;
      card.classList.add('uiux-active-work');
      ensureJourneyStepper(card, 1, 0);

      const kicker = card.querySelector('.player-kicker');
      if (kicker && !kicker.dataset.uiuxWorkKicker) {
        const current = String(kicker.textContent || '').trim();
        if (current.includes('상품 정리')) kicker.innerHTML = kicker.innerHTML.replace('상품 정리', '상품 정보 확인');
        kicker.dataset.uiuxWorkKicker = 'true';
      }

      card.querySelectorAll('.wms-card-tag').forEach((tag) => {
        if (String(tag.textContent || '').includes('오늘 배정 상품 카드')) {
          Array.from(tag.childNodes).filter((node) => node.nodeType === Node.TEXT_NODE).forEach((node) => node.remove());
          tag.appendChild(document.createTextNode(' 업무 오더'));
        }
      });

      card.querySelectorAll('.wms-mission-copy').forEach((copy) => {
        const current = String(copy.textContent || '').trim();
        if (current.includes('카드에 적힌 상품명')) {
          Array.from(copy.childNodes).filter((node) => node.nodeType === Node.TEXT_NODE).forEach((node) => node.remove());
          copy.appendChild(document.createTextNode(' 오더에 표시된 항목과 실제 정보를 순서대로 확인해 주세요.'));
        }
        if (current.includes('전표 번호를 보고')) {
          Array.from(copy.childNodes).filter((node) => node.nodeType === Node.TEXT_NODE).forEach((node) => node.remove());
          copy.appendChild(document.createTextNode(' 전표 번호와 실물 라벨 번호를 한 건씩 직접 대조해 주세요.'));
        }
      });
    });
  }

  function enhanceReviewWait() {
    const backdrop = document.querySelector('[data-modal="review-wait"]');
    if (!backdrop) return;
    const card = backdrop.querySelector('.player-card');
    if (!card) return;
    card.classList.add('uiux-review-wait');
    ensureJourneyStepper(card, 2, 1);

    const kicker = card.querySelector('.player-kicker');
    if (kicker) {
      Array.from(kicker.childNodes).filter((node) => node.nodeType === Node.TEXT_NODE).forEach((node) => node.remove());
      kicker.appendChild(document.createTextNode(' 업무 제출 완료 · 운영자 검수 대기'));
    }

    relabelReceipt(card.querySelector('.work-receipt-card'), { approved: false });

    const notice = card.querySelector('.notice div');
    if (notice && String(notice.textContent || '').includes('화면을 닫아도')) {
      notice.textContent = '화면을 닫아도 제출 기록은 서버에 저장돼요. 검수가 완료되면 결과와 정산 상태를 확인할 수 있어요.';
    }

    const closeButton = card.querySelector('[data-action="close-review-wait"]');
    if (closeButton && closeButton.classList.contains('secondary-button')) setButtonText(closeButton, '화면 닫기');
  }

  function enhanceResultScene() {
    const backdrop = document.querySelector('[data-modal="result-scene"]');
    if (!backdrop) return;
    const modal = backdrop.querySelector('.receipt-modal');
    if (!modal) return;
    modal.classList.add('uiux-result-document');
    const body = modal.querySelector('.modal-body');
    if (!body) return;

    const receipt = body.querySelector('.work-receipt-card');
    const approved = String(receipt?.querySelector('.pill')?.textContent || '').includes('검수 완료');
    ensureJourneyStepper(body, approved ? 3 : 2, approved ? 3 : 1);

    const kicker = body.querySelector('.assign-kicker');
    if (kicker) {
      Array.from(kicker.childNodes).filter((node) => node.nodeType === Node.TEXT_NODE).forEach((node) => node.remove());
      kicker.appendChild(document.createTextNode(approved ? ' 정산 완료' : ' 업무 제출 완료'));
    }

    const title = body.querySelector('h2');
    if (title) title.textContent = approved ? '업무가 승인되고 정산이 반영됐어요' : '업무 제출이 완료됐어요';

    const receiptTitle = receipt?.querySelector('.work-receipt-title');
    if (receiptTitle) receiptTitle.textContent = approved ? '업무 완료 확인서' : '업무 제출 확인서';
    relabelReceipt(receipt, { approved });

    const note = receipt?.querySelector('.work-receipt-note');
    if (note) {
      note.textContent = approved
        ? '운영자 검수가 완료됐고 확정 수당이 출금 가능 금액에 반영됐어요.'
        : '업무 제출이 기록됐어요. 운영자 검수가 완료되면 확정 수당과 정산 상태가 반영됩니다.';
    }

    const closeButton = modal.querySelector('[data-action="close-result"]');
    if (closeButton) setButtonText(closeButton, approved ? '확인 완료' : '검수 상태 확인');
  }

  function enhanceWorkJourney() {
    enhanceStartConfirm();
    enhanceActiveWork();
    enhanceReviewWait();
    enhanceResultScene();
  }

  function ensureMatchingTab() {
    const tabbar = document.querySelector('.member-tabbar');
    if (!tabbar) return;

    let matching = tabbar.querySelector('[data-nav="nodes"]');
    const dashboard = tabbar.querySelector('[data-nav="dashboard"]');
    const nodeNav = document.querySelector('#sidebar [data-nav="nodes"]');
    const nodeActive = Boolean(nodeNav?.classList.contains('active'));

    if (!matching && dashboard) {
      matching = document.createElement('button');
      matching.type = 'button';
      matching.className = 'member-tab';
      matching.dataset.nav = 'nodes';
      matching.setAttribute('aria-label', '업무 매칭');

      const iconWrap = document.createElement('span');
      iconWrap.className = 'member-tab-icon';
      const sourceIcon = nodeNav?.querySelector('svg');
      if (sourceIcon) iconWrap.appendChild(sourceIcon.cloneNode(true));
      else iconWrap.textContent = '↗';

      const label = document.createElement('span');
      label.className = 'member-tab-label';
      label.textContent = '업무 매칭';
      matching.append(iconWrap, label);
      dashboard.insertAdjacentElement('afterend', matching);
    }

    if (matching) matching.classList.toggle('active', nodeActive);
    if (dashboard && nodeActive) dashboard.classList.remove('active');
  }

  function normalizeTree(start) {
    if (!start) return;
    if (start.nodeType === Node.TEXT_NODE) {
      const parent = start.parentElement;
      if (!parent || ['SCRIPT', 'STYLE', 'NOSCRIPT', 'TEXTAREA'].includes(parent.tagName)) return;
      const before = start.nodeValue || '';
      const after = normalizeText(before);
      if (after !== before) start.nodeValue = after;
      return;
    }

    if (!(start instanceof Element) && start !== document) return;
    const scope = start === document ? document.documentElement : start;
    normalizeAttributes(scope);

    const walker = document.createTreeWalker(scope, NodeFilter.SHOW_TEXT);
    let node = walker.nextNode();
    while (node) {
      const parent = node.parentElement;
      if (parent && !['SCRIPT', 'STYLE', 'NOSCRIPT', 'TEXTAREA'].includes(parent.tagName)) {
        const before = node.nodeValue || '';
        const after = normalizeText(before);
        if (after !== before) node.nodeValue = after;
      }
      node = walker.nextNode();
    }

    if (scope.querySelectorAll) scope.querySelectorAll('[aria-label], [title]').forEach(normalizeAttributes);
  }

  const pending = new Set();
  let queued = false;

  function flush() {
    queued = false;
    const roots = Array.from(pending);
    pending.clear();
    roots.forEach(normalizeTree);
    enhanceDashboardHero();
    enhanceMatchingPage();
    enhanceWorkJourney();
    ensureMatchingTab();
  }

  function queue(node) {
    if (!node) return;
    pending.add(node);
    if (queued) return;
    queued = true;
    queueMicrotask(flush);
  }

  const observer = new MutationObserver((records) => {
    for (const record of records) record.addedNodes.forEach(queue);
  });

  function start() {
    normalizeTree(document);
    enhanceDashboardHero();
    enhanceMatchingPage();
    enhanceWorkJourney();
    ensureMatchingTab();
    observer.observe(document.body || document.documentElement, {
      childList: true,
      subtree: true
    });
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', start, { once: true });
  } else {
    start();
  }
})();
