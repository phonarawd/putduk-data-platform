(() => {
  'use strict';

  if (document.documentElement.dataset.mode !== 'member') return;

  const KEEP_PATTERNS = [
    /근무 제출이 완료됐어요/,
    /입금 신청을 접수했어요/,
    /출금 신청을 접수했어요/,
    /새 근무가 배정됐어요/,
    /새 안내가 도착했어요/
  ];

  const DROP_PATTERNS = [
    /등급과 라인이 내려가는 출금/,
    /등급이 내려갔어요/,
    /사원증 등급이/,
    /배정된 라인을 라인 찾기에서 확인해요/
  ];

  const INLINE_PATTERNS = [
    /PIN|비밀번호|이메일|생년월일|이용약관|개인정보/,
    /증빙|파일을 확인|같은 금액|금액을 다시|금액은 .*입력/,
    /본인확인/,
    /상품명|배정 물량 5건|전표 번호|대조해 주세요|제출 준비/,
    /로그인하면|로그인 후|로그인 정보를 확인|인증 서버/,
    /근무 잔액이 잠금보다|체험은 지원금/,
    /중간 저장|화면에는 남겼어요|서버 저장/,
    /홈 화면|앱 설치|사파리 하단 공유/,
    /입금 안내.*잠|보안 PIN|계좌와 USDT 주소/,
    /첫 업무를 준비|형식은 괜찮아요|이메일 주소를 올바르게/,
    /읽음으로 바꾸지 못했어요|재설정 메일|인증 메일|가입 요청|가입 정보/,
    /검수 중이에요.*새 출근/,
    /실제 근무 제출은 아직 준비|입출금 자동 반영은 아직 준비/
  ];

  const WITHDRAWAL_COPY_REPLACEMENTS = [
    [
      '보증금까지 신청하면 대기 없이 바로 지급하고, 등급·라인은 내려가요.',
      '보증금까지 신청하면 운영자 확인 후 지급 처리되며, 완료된 원금만큼 업무잔액이 줄어요. 회원 등급은 출금 자체로 변경되지 않아요.'
    ],
    [
      '보증금까지 신청하면 대기 없이 바로 지급해요. 등급은 내려가고, 근무 잔액 0이면 그 라인은 바로 닫혀요.',
      '보증금까지 신청하면 운영자 확인 후 지급 처리돼요. 완료된 원금만큼 업무잔액이 줄고, 회원 등급은 출금 자체로 변경되지 않아요.'
    ],
    [
      '대기 기간 없이 바로 지급하고, 지위는 내려가요.',
      '운영자가 확인한 뒤 지급 처리하고, 출금 자체로 회원 등급을 낮추지 않아요.'
    ],
    [
      '근무 잔액이 0원이 되면 그 라인은 바로 닫혀요.',
      '출금 완료 후 남은 업무잔액이 필요한 보증금보다 적으면 해당 업무는 새로 시작할 수 없어요.'
    ],
    [
      '우선 집기·주간 근무 자리·전담 라인은 빠지고, 같은 고액 칸은 다시 입금해야 열려요.',
      '기존 회원 등급·혜택·라인 상태는 원금 출금 자체로 변경하지 않아요.'
    ]
  ];

  const recentInline = new Map();

  function normalize(value) {
    return String(value || '').replace(/\s+/g, ' ').trim();
  }

  function toastText(node) {
    const spans = node?.querySelectorAll?.(':scope > span');
    return normalize(spans?.[1]?.textContent || node?.textContent || '');
  }

  function toneOf(node) {
    if (node?.classList?.contains('error')) return 'error';
    if (node?.classList?.contains('warning')) return 'warning';
    if (node?.classList?.contains('success')) return 'success';
    return 'info';
  }

  function matchesAny(text, patterns) {
    return patterns.some((pattern) => pattern.test(text));
  }

  function inlineScope() {
    return document.querySelector('.modal-backdrop form')
      || document.querySelector('.modal-backdrop .modal-body')
      || document.querySelector('.modal-backdrop .modal')
      || document.querySelector('main .page.active, main [data-page].active, main')
      || document.getElementById('app');
  }

  function ensureInlineStyle() {
    if (document.getElementById('putdukToastPolicyStyle')) return;
    const style = document.createElement('style');
    style.id = 'putdukToastPolicyStyle';
    style.textContent = `
      [data-putduk-inline-feedback]{margin:10px 0 0;padding:10px 12px;border:1px solid var(--line,#dfe7e3);border-radius:12px;background:var(--surface,#fff);font-size:13px;line-height:1.5;color:var(--text,#19352c)}
      [data-putduk-inline-feedback][data-tone="error"],[data-putduk-inline-feedback][data-tone="warning"]{border-color:color-mix(in srgb,var(--gold,#c18a2d) 42%,transparent);background:color-mix(in srgb,var(--gold,#c18a2d) 7%,var(--surface,#fff))}
      [data-putduk-inline-feedback][data-tone="success"]{border-color:color-mix(in srgb,var(--emerald,#0d9f76) 35%,transparent);background:color-mix(in srgb,var(--emerald,#0d9f76) 6%,var(--surface,#fff))}
    `;
    document.head.appendChild(style);
  }

  function ensureWithdrawalPolicyStyle() {
    if (document.getElementById('putdukWithdrawalPolicyStyle')) return;
    const style = document.createElement('style');
    style.id = 'putdukWithdrawalPolicyStyle';
    style.textContent = '#demoteMotionCanvas{display:none!important}[data-modal="withdraw-principal"] .result-stage.compact{display:none!important}';
    document.head.appendChild(style);
  }

  function placeInline(text, tone) {
    const scope = inlineScope();
    if (!scope || !text) return false;
    ensureInlineStyle();

    const now = Date.now();
    const key = `${tone}:${text}`;
    if (recentInline.has(key) && now - recentInline.get(key) < 1200) return true;
    recentInline.set(key, now);

    let box = scope.querySelector?.('[data-putduk-inline-feedback]');
    if (!box || box.closest('#toastStack')) {
      box = document.createElement('div');
      box.setAttribute('data-putduk-inline-feedback', '1');
      const actions = scope.querySelector?.('.modal-actions');
      if (actions?.parentNode) actions.parentNode.insertBefore(box, actions);
      else if (scope.firstChild) scope.insertBefore(box, scope.firstChild);
      else scope.appendChild(box);
    }
    box.dataset.tone = tone;
    box.setAttribute('role', tone === 'error' || tone === 'warning' ? 'alert' : 'status');
    box.setAttribute('aria-live', tone === 'error' || tone === 'warning' ? 'assertive' : 'polite');
    box.textContent = text;
    return true;
  }

  function classify(node) {
    const text = toastText(node);
    if (!text) return 'keep';
    if (matchesAny(text, KEEP_PATTERNS)) return 'keep';
    if (matchesAny(text, DROP_PATTERNS)) return 'drop';
    if (matchesAny(text, INLINE_PATTERNS)) return 'inline';

    const tone = toneOf(node);
    if (tone === 'error' || tone === 'warning') return 'keep';
    return 'inline';
  }

  function applyPolicy(node) {
    if (!(node instanceof Element) || !node.matches('.toast')) return;
    const disposition = classify(node);
    if (disposition === 'keep') return;

    if (disposition === 'inline') {
      placeInline(toastText(node), toneOf(node));
    }
    node.remove();
  }

  function scan(root) {
    if (!(root instanceof Element)) return;
    if (root.matches('.toast')) applyPolicy(root);
    root.querySelectorAll?.('.toast').forEach(applyPolicy);
  }

  function replaceWithdrawalTextNode(node) {
    if (!node || node.nodeType !== Node.TEXT_NODE) return;
    const original = String(node.nodeValue || '');
    if (!original.trim()) return;

    let next = original;
    for (const [from, to] of WITHDRAWAL_COPY_REPLACEMENTS) {
      if (next.includes(from)) next = next.replace(from, to);
    }

    const principalModal = node.parentElement?.closest?.('[data-modal="withdraw-principal"]');
    if (principalModal) {
      if (next.includes('사원증 등급이')) {
        next = '원금 출금 자체로 회원 등급은 변경되지 않아요.';
      }
      next = next.replace(
        /같은 날\s+(.+?)까지\s+즉시 지급해요\.\s*며칠 뒤에 돈을 묶지 않아요\./,
        '운영자가 확인한 뒤 $1까지 지급 처리해요.'
      );
    }

    if (next !== original) node.nodeValue = next;
  }

  function sanitizeWithdrawalPolicy(root) {
    if (!root) return;
    ensureWithdrawalPolicyStyle();

    if (root.nodeType === Node.TEXT_NODE) {
      replaceWithdrawalTextNode(root);
      return;
    }
    if (!(root instanceof Element)) return;

    const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
    let node = walker.nextNode();
    while (node) {
      replaceWithdrawalTextNode(node);
      node = walker.nextNode();
    }

    const principalModal = root.matches?.('[data-modal="withdraw-principal"]')
      ? root
      : root.querySelector?.('[data-modal="withdraw-principal"]');
    if (principalModal) {
      const motionStage = principalModal.querySelector('#demoteMotionCanvas')?.closest('.result-stage');
      if (motionStage) motionStage.remove();
      const confirm = principalModal.querySelector('[data-action="confirm-principal"]');
      if (confirm) confirm.textContent = '출금 정보 입력';
    }
  }

  function installToastPolicy() {
    const stack = document.getElementById('toastStack');
    if (!stack) return false;
    scan(stack);
    const observer = new MutationObserver((records) => {
      for (const record of records) {
        for (const node of record.addedNodes) scan(node);
      }
    });
    observer.observe(stack, { childList: true, subtree: true });
    return true;
  }

  function installWithdrawalPolicy() {
    const app = document.getElementById('app');
    if (!app) return false;
    sanitizeWithdrawalPolicy(app);
    const observer = new MutationObserver((records) => {
      for (const record of records) {
        for (const node of record.addedNodes) sanitizeWithdrawalPolicy(node);
      }
    });
    observer.observe(app, { childList: true, subtree: true });
    return true;
  }

  function retryInstall(install) {
    if (install()) return;
    let attempts = 0;
    const timer = window.setInterval(() => {
      attempts += 1;
      if (install() || attempts >= 40) window.clearInterval(timer);
    }, 250);
  }

  retryInstall(installToastPolicy);
  retryInstall(installWithdrawalPolicy);
})();
