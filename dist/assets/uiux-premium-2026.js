(() => {
  'use strict';

  const root = document.documentElement;
  root.dataset.uiuxPremium = '2026-09';
  if (root.dataset.mode === 'admin') return;

  const TEXT_REPLACEMENTS = [
    ['내 근무 내역', '업무 내역'],
    ['아직 제출한 근무가 없어요.', '아직 진행한 업무가 없어요.'],
    ['근무를 시작하면 검수와 수당이 여기에 쌓여요.', '업무를 진행하면 제출·검수·정산 기록이 시간순으로 여기에 표시돼요.'],
    ['예상 보상', '예상 수당'],
    ['확정 보상', '확정 수당'],
    ['누적 완료', '완료한 업무'],
    ['검수 완료만 집계', '운영자 검수 완료 기준'],
    ['원장에 오른 수당만', '지갑에 반영된 확정 수당'],
    ['내역 내려받기', '업무 내역 받기'],
    ['세 칸 잔액', '자금 현황'],
    ['업무잔액', '업무 잔액'],
    ['출금가능', '출금 가능'],
    ['출금 안 됨', '업무 전용'],
    ['근무에 쓰는 돈', '업무 시작에 사용하는 금액'],
    ['기본은 수당만', '검수 완료 후 확정된 수당'],
    ['수당만 출금', '출금 가능 금액 출금'],
    ['보증금까지 출금', '업무 잔액 포함 출금'],
    ['본인확인 자료 제출', '본인확인'],
    ['신분증 앞면·뒷면·셀카를 올리면 운영자가 검수합니다.', '신분증 앞면·뒷면과 셀카를 제출하면 운영자가 확인해요.'],
    ['검수 요청', '본인확인 제출'],
    ['KYC 창 닫기', '본인확인 창 닫기'],
    ['오늘 라인 근무', '업무 진행'],
    ['오늘 근무부터 정산까지, 사원 안내를 나눠 두었어요.', '업무 시작부터 검수·정산·출금까지 필요한 안내를 확인할 수 있어요.'],
    ['작업실에서 한 칸만 골라 출근해요. 오늘 배정 물량 5건의 실물 라벨 번호를 입력해 전표와 대조하면 돼요.', '업무 매칭에서 오더를 확인한 뒤 배정된 항목을 한 건씩 처리해 주세요. 입력한 내용은 제출 후 운영자가 확인해요.'],
    ['컴퓨터 화면에서도 근무할 수 있어요. 홈 화면 아이콘은 있으면 편하고, 없어도 출근할 수 있어요.', '업무 화면은 휴대폰과 PC에서 이용할 수 있어요. 진행 중인 업무는 같은 계정의 기록을 기준으로 확인합니다.'],
    ['5건을 마치면 제출해요. 하루 30~60분이면 충분해요.', '배정된 항목을 모두 확인한 뒤 제출하면 운영자 검수가 시작돼요.'],
    ['지금 출근하는 라인의 협력사가 카드에 보여요. 다른 협력사 칸으로 일하면 배지도 그 라인으로 바뀌어요.', '현재 진행 중인 업무의 협력사가 카드에 표시돼요. 업무가 바뀌면 표시되는 협력사 정보도 함께 갱신돼요.'],
    ['근무 보증은 잠금 금액이에요. 승인되면 원금은 업무잔액, 수당은 출금가능 칸에 보여요.', '업무 시작 금액은 진행 중인 업무에 사용되는 금액이에요. 검수가 완료되면 업무 잔액과 확정 수당이 각 항목에 반영돼요.'],
    ['큰 버튼은 수당만 출금이에요. 원금은 업무잔액에 남아 보여요.', '기본 출금은 출금 가능 금액을 대상으로 해요. 업무 잔액은 별도로 표시돼요.']
  ];

  function replaceText(value) {
    let text = String(value || '');
    for (const [from, to] of TEXT_REPLACEMENTS) {
      if (text.includes(from)) text = text.split(from).join(to);
    }
    return text;
  }

  function rewriteTextTree(scope) {
    if (!(scope instanceof Element) && scope !== document) return;
    const rootNode = scope === document ? document.documentElement : scope;
    const walker = document.createTreeWalker(rootNode, NodeFilter.SHOW_TEXT);
    let node = walker.nextNode();
    while (node) {
      const parent = node.parentElement;
      if (parent && !['SCRIPT', 'STYLE', 'NOSCRIPT', 'TEXTAREA'].includes(parent.tagName)) {
        const before = node.nodeValue || '';
        const after = replaceText(before);
        if (after !== before) node.nodeValue = after;
      }
      node = walker.nextNode();
    }
    rootNode.querySelectorAll?.('[aria-label], [title]').forEach((element) => {
      for (const name of ['aria-label', 'title']) {
        if (!element.hasAttribute(name)) continue;
        const before = element.getAttribute(name) || '';
        const after = replaceText(before);
        if (after !== before) element.setAttribute(name, after);
      }
    });
  }

  function setTextKeepingIcon(element, text) {
    if (!(element instanceof Element)) return;
    Array.from(element.childNodes)
      .filter((node) => node.nodeType === Node.TEXT_NODE)
      .forEach((node) => node.remove());
    element.appendChild(document.createTextNode(` ${text}`));
  }

  function enhanceHistoryPage() {
    const title = Array.from(document.querySelectorAll('.page-title'))
      .find((node) => String(node.textContent || '').trim() === '업무 내역');
    if (!title) return;
    const heading = title.closest('.section-heading');
    heading?.classList.add('uiux-premium-history-heading');
    const copy = heading?.querySelector('.page-copy');
    if (copy) copy.textContent = '내가 진행한 업무와 제출·검수·정산 상태를 시간순으로 확인할 수 있어요.';

    const exportButton = heading?.querySelector('[data-action="export-history"]');
    if (exportButton) setTextKeepingIcon(exportButton, '업무 내역 받기');

    document.querySelectorAll('.record-card').forEach((card) => {
      card.classList.add('uiux-premium-record');
      const id = card.querySelector('.record-card-id');
      if (id) id.textContent = String(id.textContent || '').replace('문의 번호', '업무 기록 번호');
    });

    document.querySelectorAll('.record-table th').forEach((th) => {
      const text = String(th.textContent || '').trim();
      if (text === '근무') th.textContent = '업무';
      if (text === '보상') th.textContent = '수당';
    });
  }

  function enhanceWalletPage() {
    const title = Array.from(document.querySelectorAll('.page-title'))
      .find((node) => String(node.textContent || '').trim() === '지갑');
    if (!title) return;
    const heading = title.closest('.section-heading');
    heading?.classList.add('uiux-premium-wallet-heading');
    const copy = heading?.querySelector('.page-copy');
    if (copy) copy.textContent = '업무에 사용하는 금액과 검수 완료 후 출금할 수 있는 금액을 구분해서 확인해요.';

    const walletCard = document.querySelector('.wallet-card');
    walletCard?.classList.add('uiux-premium-wallet');
    const eyebrow = walletCard?.querySelector('.eyebrow');
    if (eyebrow) setTextKeepingIcon(eyebrow, '자금 현황');

    document.querySelectorAll('.wallet-slot').forEach((slot) => {
      slot.classList.add('uiux-premium-wallet-slot');
      const lead = slot.querySelector('.ui-lead span:last-child');
      const small = slot.querySelector('small');
      const label = String(lead?.textContent || '').trim();
      if (label === '지원금') {
        slot.dataset.walletKind = 'support';
        if (small) small.textContent = '업무에 사용할 수 있는 지원 금액';
      } else if (label === '업무 잔액' || label === '업무잔액') {
        slot.dataset.walletKind = 'work';
        if (lead) lead.textContent = '업무 잔액';
        if (small && !String(small.textContent || '').includes('잠금')) small.textContent = '업무 시작에 사용하는 금액';
      } else if (label === '출금 가능' || label === '출금가능') {
        slot.dataset.walletKind = 'available';
        if (lead) lead.textContent = '출금 가능 금액';
        if (small) small.textContent = '검수 완료 후 확정된 수당';
      }
    });

    document.querySelectorAll('.withdraw-actions button').forEach((button) => {
      const text = String(button.textContent || '').trim();
      if (text.includes('수당만 출금')) setTextKeepingIcon(button, '출금 가능 금액 출금');
      if (text.includes('보증금까지 출금')) setTextKeepingIcon(button, '업무 잔액 포함 출금');
    });

    document.querySelectorAll('.notice').forEach((notice) => {
      const text = String(notice.textContent || '').trim();
      const target = notice.querySelector('div') || notice;
      if (text.includes('출금') && text.includes('처리 중') && text.includes('같은 날')) {
        target.innerHTML = target.innerHTML
          .replace(/운영자가 같은 날 바로 처리해요\.?/g, '운영자가 요청 내용을 확인 중이에요. 처리 결과는 지갑 내역에 반영됩니다.');
      }
      if (text.includes('기본 출금은 수당만')) {
        target.textContent = '기본 출금은 출금 가능 금액을 대상으로 해요. 업무 잔액까지 출금하면 등급·혜택 조건이 달라질 수 있으니 신청 전에 영향 범위를 확인해 주세요.';
      }
    });

    const recent = Array.from(document.querySelectorAll('.section-heading h2'))
      .find((node) => String(node.textContent || '').trim() === '최근 지갑 내역');
    const recentHeading = recent?.closest('.section-heading');
    const recentCopy = recentHeading?.querySelector('p');
    if (recentCopy) recentCopy.textContent = '입금·출금 요청과 업무 정산 결과를 실제 처리 상태 기준으로 확인할 수 있어요.';
  }

  function enhanceKycModal() {
    const modal = document.querySelector('[data-modal="kyc"] .modal');
    if (!modal) return;
    modal.classList.add('uiux-premium-kyc');
    const title = modal.querySelector('.modal-head h2');
    const copy = modal.querySelector('.modal-head p');
    if (title) title.textContent = '본인확인';
    if (copy) copy.textContent = '신분증 앞면·뒷면과 셀카를 제출하면 운영자가 확인해요.';

    const notice = modal.querySelector('.notice div');
    if (notice) notice.textContent = '제출한 원본 파일 주소는 회원 화면에 공개되지 않아요. 확인에 필요한 범위에서만 운영자가 검토합니다.';

    const submit = modal.querySelector('button[type="submit"]');
    if (submit) submit.textContent = '본인확인 제출';
    modal.querySelectorAll('[aria-label]').forEach((element) => {
      if ((element.getAttribute('aria-label') || '').includes('KYC')) element.setAttribute('aria-label', '본인확인 창 닫기');
    });
  }

  function enhanceFinanceModals() {
    document.querySelectorAll('.modal-backdrop .modal').forEach((modal) => {
      const title = String(modal.querySelector('.modal-head h2')?.textContent || '').trim();
      if (!title) return;
      if (title.includes('입금')) modal.classList.add('uiux-premium-finance-modal', 'is-deposit');
      if (title.includes('출금')) modal.classList.add('uiux-premium-finance-modal', 'is-withdraw');
    });

    document.querySelectorAll('.deposit-method').forEach((button) => {
      button.classList.add('uiux-premium-method');
      const strong = button.querySelector('strong');
      const span = button.querySelector('span');
      if (strong?.textContent?.trim() === '원화 계좌' && span) span.textContent = '은행 계좌로 입금';
      if (strong?.textContent?.trim() === 'USDT' && span) span.textContent = 'USDT로 입금';
    });
  }

  function enhanceHelp() {
    const title = Array.from(document.querySelectorAll('.page-title'))
      .find((node) => String(node.textContent || '').trim() === '도움말');
    if (!title) return;
    const heading = title.closest('.section-heading');
    const copy = heading?.querySelector('.page-copy');
    if (copy) copy.textContent = '업무 시작부터 검수·정산·출금까지 필요한 내용을 단계별로 확인할 수 있어요.';
    document.querySelector('.help-body')?.classList.add('uiux-premium-help');
  }

  function enhanceMembershipAndBenefits() {
    const membership = Array.from(document.querySelectorAll('.page-title'))
      .find((node) => String(node.textContent || '').trim() === '사원증');
    if (membership) {
      const heading = membership.closest('.section-heading');
      const copy = heading?.querySelector('.page-copy');
      if (copy) copy.textContent = '회원 정보와 현재 등급·협력사 정보를 한 장에서 확인할 수 있어요.';
      document.querySelector('.membership-stage')?.classList.add('uiux-premium-membership');
    }

    document.querySelectorAll('.benefit-card').forEach((card) => card.classList.add('uiux-premium-benefit'));
  }

  function enhanceAll() {
    rewriteTextTree(document);
    enhanceHistoryPage();
    enhanceWalletPage();
    enhanceKycModal();
    enhanceFinanceModals();
    enhanceHelp();
    enhanceMembershipAndBenefits();
  }

  let queued = false;
  const observer = new MutationObserver((records) => {
    if (!records.some((record) => record.addedNodes.length)) return;
    if (queued) return;
    queued = true;
    queueMicrotask(() => {
      queued = false;
      enhanceAll();
    });
  });

  function start() {
    enhanceAll();
    observer.observe(document.body || document.documentElement, { childList: true, subtree: true });
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start, { once: true });
  else start();
})();
