(() => {
  'use strict';

  // Production auth watchdog. This is recovery-only: it never grants access,
  // changes authorization, or mutates work/finance state.
  const mode = () => document.documentElement?.dataset.mode === 'admin' ? 'admin' : 'member';
  const config = () => window.PUTDUK_CONFIG || {};

  function paintRecovery(shell) {
    const currentMode = mode();
    const title = shell.querySelector('strong, .page-title, h1');
    const copy = shell.querySelector('span, .page-copy, p');
    if (title) title.textContent = currentMode === 'admin'
      ? '운영자 로그인을 확인해 주세요'
      : '로그인을 확인하는 데 시간이 걸리고 있어요';
    if (copy) copy.textContent = currentMode === 'admin'
      ? '잠시 후에도 화면이 열리지 않으면 운영자 로그인으로 다시 시작할 수 있어요.'
      : '네트워크 상태를 확인한 뒤 로그인하면 안전하게 이어서 사용할 수 있어요.';

    const actions = shell.querySelector('.modal-actions') || (() => {
      const el = document.createElement('div');
      el.className = 'modal-actions';
      el.style.cssText = 'justify-content:center;margin-top:18px';
      shell.appendChild(el);
      return el;
    })();

    if (!actions.querySelector('[data-action="open-login"]')) {
      const button = document.createElement('button');
      button.type = 'button';
      button.className = currentMode === 'admin' ? 'primary-button' : 'pd-button pd-button--primary';
      button.dataset.action = 'open-login';
      button.textContent = currentMode === 'admin' ? '운영자 로그인' : '로그인';
      actions.appendChild(button);
    }
    shell.dataset.bootRecovery = '1';
    shell.setAttribute('role', 'status');
    shell.setAttribute('aria-live', 'polite');
  }

  function closeFallback() {
    document.querySelector('[data-putduk-fallback-auth]')?.remove();
    document.body?.classList.remove('modal-open', 'overlay-open');
  }

  function fallbackAuthModal() {
    if (document.querySelector('[data-putduk-fallback-auth]')) return;
    const root = document.createElement('div');
    root.dataset.putdukFallbackAuth = '1';
    root.innerHTML = `<div class="modal-backdrop" data-modal="auth" style="position:fixed;inset:0;z-index:99999;background:rgba(8,16,14,.46);display:grid;place-items:center;padding:20px"><div class="modal auth-modal" role="dialog" aria-modal="true" aria-labelledby="putdukFallbackAuthTitle" style="max-width:520px;width:min(100%,520px);max-height:92dvh;overflow:auto"><div class="modal-head"><div><h2 id="putdukFallbackAuthTitle">퍼뜩 로그인</h2><p>내 작업내역과 멤버십 카드를 이어서 확인해요.</p></div><button type="button" class="icon-button" data-fallback-close aria-label="닫기">닫기</button></div><div class="modal-body"><form data-fallback-login><div class="field"><label for="putdukFallbackEmail">이메일</label><input id="putdukFallbackEmail" name="email" type="email" autocomplete="email" required placeholder="name@example.com"></div><div class="field" style="margin-top:13px"><label for="putdukFallbackPassword">비밀번호</label><input id="putdukFallbackPassword" name="password" type="password" autocomplete="current-password" required placeholder="비밀번호를 입력해 주세요"></div><div class="modal-actions"><button type="button" class="secondary-button" data-fallback-close>취소</button><button type="submit" class="primary-button">로그인</button></div><p data-fallback-status role="status" aria-live="polite" style="min-height:1.4em"></p></form></div></div></div>`;
    document.body.appendChild(root);
    document.body.classList.add('modal-open', 'overlay-open');

    const setStatus = (text) => {
      const el = root.querySelector('[data-fallback-status]');
      if (el) el.textContent = text || '';
    };

    root.addEventListener('click', (event) => {
      if (event.target.closest('[data-fallback-close]')) {
        closeFallback();
      }
    });
    root.querySelector('[data-fallback-login]')?.addEventListener('submit', async (event) => {
      event.preventDefault();
      const form = event.currentTarget;
      const email = String(form.email?.value || '').trim().toLowerCase();
      const password = String(form.password?.value || '');
      if (!email || !password) return;
      const clientFactory = window.supabase?.createClient;
      const cfg = config();
      if (!clientFactory || !cfg.supabaseUrl || !cfg.supabasePublishableKey) {
        setStatus('인증 서버를 준비하지 못했어요. 잠시 후 다시 시도해 주세요.');
        return;
      }
      const button = form.querySelector('button[type="submit"]');
      if (button) { button.disabled = true; button.textContent = '로그인 중…'; }
      setStatus('인증 서버에 연결하고 있어요.');
      try {
        const client = clientFactory(cfg.supabaseUrl, cfg.supabasePublishableKey, {
          auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true }
        });
        const { data, error } = await client.auth.signInWithPassword({ email, password });
        if (error || !data?.session) throw error || new Error('세션을 만들지 못했어요.');
        setStatus('로그인됐어요. 화면을 이어서 열고 있어요.');
        closeFallback();
        window.setTimeout(() => window.location.reload(), 80);
      } catch (error) {
        const raw = String(error?.message || '').toLowerCase();
        setStatus(raw.includes('email not confirmed')
          ? '이메일 인증이 완료되지 않았어요. 받은 메일의 인증 링크를 확인해 주세요.'
          : raw.includes('invalid login credentials')
            ? '이메일 또는 비밀번호가 올바르지 않아요.'
            : '로그인하지 못했어요. 잠시 후 다시 시도해 주세요.');
        if (button) { button.disabled = false; button.textContent = '로그인'; }
      }
    });
    root.querySelector('#putdukFallbackEmail')?.focus();
  }

  function installFallbackAction() {
    if (window.__putdukFallbackAuthInstalled) return;
    window.__putdukFallbackAuthInstalled = true;
    document.addEventListener('click', (event) => {
      const target = event.target.closest('[data-action="open-login"]');
      if (!target) return;
      if (typeof window.__putdukOpenAuth === 'function') return;
      event.preventDefault();
      event.stopImmediatePropagation();
      fallbackAuthModal();
    }, true);
  }

  function start() {
    installFallbackAction();
    window.setTimeout(() => {
      const shell = document.querySelector('[data-boot-shell="1"]');
      if (!shell || !document.documentElement) return;
      if (!shell.querySelector('[data-action="open-login"], [data-action="open-signup"]')) paintRecovery(shell);
      installFallbackAction();
    }, 12000);
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start, { once: true });
  else start();
})();