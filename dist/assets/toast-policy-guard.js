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

  function install() {
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

  if (!install()) {
    let attempts = 0;
    const timer = window.setInterval(() => {
      attempts += 1;
      if (install() || attempts >= 40) window.clearInterval(timer);
    }, 250);
  }
})();
