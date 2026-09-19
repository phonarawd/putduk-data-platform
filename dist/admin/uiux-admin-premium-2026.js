(() => {
  'use strict';

  const root = document.documentElement;
  if (root.dataset.mode !== 'admin') return;
  root.dataset.uiuxAdminPremium = '2026-09-perf2';

  const REPLACEMENTS = [
    ['전체 현황', '운영 현황'],
    ['업무 카드 관리', '업무 관리'],
    ['오늘 확정 보상', '오늘 확정 수당'],
    ['예상 보상', '예상 수당'],
    ['확정 보상', '확정 수당'],
    ['특정 회원 업무 배정', '회원 업무 배정'],
    ['보상(참고, 서버가 확정)', '예상 수당 (서버 확정 전 참고값)'],
    ['예상시간(초)', '예상 소요 시간(초)'],
    ['자세히', '회원 상세']
  ];

  function replaceText(value) {
    let text = String(value || '');
    for (const [from, to] of REPLACEMENTS) {
      if (text.includes(from)) text = text.split(from).join(to);
    }
    return text;
  }

  function setText(node, value) {
    if (!node) return;
    const next = String(value ?? '');
    if (node.textContent !== next) node.textContent = next;
  }

  function setAttr(node, name, value) {
    if (!node) return;
    const next = String(value ?? '');
    if (node.getAttribute(name) !== next) node.setAttribute(name, next);
  }

  function addClass(node, className) {
    if (node && !node.classList.contains(className)) node.classList.add(className);
  }

  function rewrite(scope = document) {
    const rootNode = scope === document ? document.documentElement : scope;
    if (!(rootNode instanceof Element)) return;
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
    rootNode.querySelectorAll('[aria-label], [title]').forEach((element) => {
      for (const name of ['aria-label', 'title']) {
        if (!element.hasAttribute(name)) continue;
        const before = element.getAttribute(name) || '';
        const after = replaceText(before);
        if (after !== before) element.setAttribute(name, after);
      }
    });
  }

  function enhancePageHeading() {
    const title = document.querySelector('.section-heading .page-title');
    if (!title) return;
    const heading = title.closest('.section-heading');
    addClass(heading, 'uiux-admin-page-heading');
    const copy = heading?.querySelector('.page-copy');
    const name = String(title.textContent || '').trim();

    const copyByPage = {
      '운영 현황': '오늘 처리해야 할 업무와 회원·검수·입출금 상태를 한 화면에서 확인합니다.',
      '회원 관리': '회원별 상태, 업무 진행, 출금 가능 금액을 확인하고 필요한 운영 작업을 처리합니다.',
      '기업 관리': '회원에게 노출되는 협력사 정보와 공개 상태를 관리합니다.',
      '업무 관리': '운영자가 등록한 업무의 노출 상태와 배정 조건을 관리합니다.',
      '업무 검수': '회원이 제출한 업무 기록을 확인하고 승인·재확인·반려를 처리합니다.',
      '입출금 처리': '회원의 입금·출금·본인확인 요청을 실제 서버 기록 기준으로 확인하고 처리합니다.',
      '공지·알림': '회원에게 표시할 운영 안내와 실제 업무 상태 알림을 관리합니다.',
      '운영 설정': '서비스 운영에 필요한 설정을 확인하고 변경합니다.'
    };
    if (copy && copyByPage[name]) setText(copy, copyByPage[name]);
  }

  function enhanceMembers() {
    const title = Array.from(document.querySelectorAll('.page-title'))
      .find((node) => String(node.textContent || '').trim() === '회원 관리');
    if (!title) return;
    const card = title.closest('.section-heading')?.nextElementSibling?.classList.contains('admin-card')
      ? title.closest('.section-heading').nextElementSibling
      : document.querySelector('.admin-card');
    addClass(card, 'uiux-admin-members-card');

    document.querySelectorAll('table th').forEach((th) => {
      const text = String(th.textContent || '').trim();
      if (text === '출금 가능') setText(th, '출금 가능 금액');
      if (text === '잠금') setText(th, '업무 잠금');
    });

    document.querySelectorAll('[data-action="member-detail"]').forEach((button) => {
      setText(button, '회원 상세');
      setAttr(button, 'aria-label', '회원 상세 보기');
    });
  }

  function enhanceOverview() {
    document.querySelectorAll('.admin-stat').forEach((stat) => addClass(stat, 'uiux-admin-stat'));
    document.querySelectorAll('.admin-card').forEach((card) => addClass(card, 'uiux-admin-card-premium'));
  }

  function enhanceAssignmentModal() {
    const modal = document.querySelector('[data-modal="assign-task"] .modal');
    if (!modal) return;
    addClass(modal, 'uiux-admin-assignment-modal');
    const title = modal.querySelector('.modal-head h2');
    const copy = modal.querySelector('.modal-head p');
    setText(title, '회원 업무 배정');
    setText(copy, '회원, 협력사, 업무와 노출 기간을 확인한 뒤 실제 업무를 배정합니다.');
    const submit = modal.querySelector('button[type="submit"]');
    setText(submit, '업무 배정');
  }

  function enhanceFinance() {
    const title = Array.from(document.querySelectorAll('.page-title'))
      .find((node) => String(node.textContent || '').trim() === '입출금 처리');
    if (!title) return;
    document.querySelectorAll('.admin-stat').forEach((stat) => addClass(stat, 'uiux-admin-finance-stat'));
    const waiting = Array.from(document.querySelectorAll('.admin-card h3'))
      .find((node) => String(node.textContent || '').trim() === '처리 대기 목록');
    const copy = waiting?.parentElement?.querySelector('p');
    setText(copy, '회원에게 표시되는 상태와 실제 처리 기록을 함께 확인합니다.');
  }

  function enhanceTables() {
    document.querySelectorAll('.table-wrap').forEach((wrap) => addClass(wrap, 'uiux-admin-table-wrap'));
    document.querySelectorAll('.admin-card table').forEach((table) => addClass(table, 'uiux-admin-table'));
  }

  function enhanceModals() {
    document.querySelectorAll('.modal-backdrop .modal').forEach((modal) => {
      addClass(modal, 'uiux-admin-modal');
    });
  }

  let observer = null;
  let queued = false;
  let enhancing = false;
  let frame = 0;

  function observe() {
    if (!observer) return;
    const target = document.body || document.documentElement;
    if (!target) return;
    observer.observe(target, { childList: true, subtree: true });
  }

  function enhanceAll() {
    if (enhancing) return;
    enhancing = true;
    // Ignore mutations authored by this enhancement pass. Without this disconnect,
    // textContent replacements can create childList records and recursively schedule
    // another whole-document enhancement forever on data-heavy admin pages.
    observer?.disconnect();
    try {
      rewrite(document);
      enhancePageHeading();
      enhanceMembers();
      enhanceOverview();
      enhanceAssignmentModal();
      enhanceFinance();
      enhanceTables();
      enhanceModals();
    } finally {
      enhancing = false;
      observe();
    }
  }

  function scheduleEnhance() {
    if (queued || enhancing) return;
    queued = true;
    if (frame) cancelAnimationFrame(frame);
    frame = requestAnimationFrame(() => {
      frame = 0;
      queued = false;
      enhanceAll();
    });
  }

  observer = new MutationObserver((records) => {
    if (enhancing) return;
    if (!records.some((record) => record.addedNodes.length || record.removedNodes.length)) return;
    scheduleEnhance();
  });

  function start() {
    enhanceAll();
    observe();
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start, { once: true });
  else start();
})();
