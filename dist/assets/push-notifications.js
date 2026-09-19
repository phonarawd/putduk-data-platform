(() => {
  'use strict';

  const config = window.PUTDUK_CONFIG || {};
  const isAdmin = document.documentElement.dataset.mode === 'admin';
  if (isAdmin) return;

  const pushUrl = config.supabaseUrl
    ? `${String(config.supabaseUrl).replace(/\/$/, '')}/functions/v1/member-push`
    : '';
  let vapidPublicKey = '';
  let syncing = false;

  function supportsPush() {
    return Boolean(
      pushUrl
      && config.supabasePublishableKey
      && 'serviceWorker' in navigator
      && 'PushManager' in window
      && 'Notification' in window
    );
  }

  function urlBase64ToUint8Array(base64String) {
    const padding = '='.repeat((4 - (base64String.length % 4)) % 4);
    const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/');
    const raw = atob(base64);
    const output = new Uint8Array(raw.length);
    for (let i = 0; i < raw.length; i++) output[i] = raw.charCodeAt(i);
    return output;
  }

  async function pushRequest(action, body = {}, token) {
    const headers = {
      apikey: config.supabasePublishableKey || '',
      'Content-Type': 'application/json'
    };
    if (token) headers.Authorization = `Bearer ${token}`;
    const response = await fetch(pushUrl, {
      method: 'POST',
      headers,
      body: JSON.stringify({ action, ...body })
    });
    const result = await response.json().catch(() => ({}));
    if (!response.ok || result.ok === false) {
      throw new Error(String(result.error || '푸시 설정을 처리하지 못했어요.'));
    }
    return result;
  }

  async function ensureVapidKey() {
    if (vapidPublicKey) return vapidPublicKey;
    const result = await pushRequest('vapid_public_key');
    vapidPublicKey = String(result.public_key || '').trim();
    if (!vapidPublicKey) throw new Error('푸시 키를 받지 못했어요.');
    return vapidPublicKey;
  }

  async function waitForServiceWorker() {
    const registration = await navigator.serviceWorker.register('./sw.js');
    return registration.ready || registration;
  }

  async function subscribeWithSession(session, { prompt = false } = {}) {
    if (!supportsPush() || !session?.access_token) return { ok: false, reason: 'unsupported' };
    if (syncing) return { ok: false, reason: 'busy' };
    syncing = true;
    try {
      let permission = Notification.permission;
      if (permission === 'default' && prompt) {
        permission = await Notification.requestPermission();
      }
      if (permission !== 'granted') {
        return { ok: false, reason: permission === 'denied' ? 'denied' : 'default' };
      }

      const registration = await waitForServiceWorker();
      const publicKey = await ensureVapidKey();
      let subscription = await registration.pushManager.getSubscription();
      if (!subscription) {
        subscription = await registration.pushManager.subscribe({
          userVisibleOnly: true,
          applicationServerKey: urlBase64ToUint8Array(publicKey)
        });
      }

      const json = subscription.toJSON();
      await pushRequest('subscribe', {
        endpoint: json.endpoint,
        p256dh: json.keys?.p256dh,
        auth_key: json.keys?.auth,
        user_agent: navigator.userAgent || null
      }, session.access_token);

      return { ok: true };
    } catch (error) {
      return { ok: false, reason: error?.message || 'failed' };
    } finally {
      syncing = false;
    }
  }

  async function unsubscribeWithSession(session) {
    if (!supportsPush() || !session?.access_token) return;
    try {
      const registration = await navigator.serviceWorker.getRegistration('./sw.js');
      const subscription = registration ? await registration.pushManager.getSubscription() : null;
      if (subscription) {
        await pushRequest('unsubscribe', { endpoint: subscription.endpoint }, session.access_token);
        await subscription.unsubscribe();
      } else {
        await pushRequest('unsubscribe', {}, session.access_token);
      }
    } catch (_) {}
  }

  async function maybePromptAfterLogin(session) {
    const result = await subscribeWithSession(session, { prompt: true });
    if (result.ok && typeof window.__putdukShowToast === 'function') {
      window.__putdukShowToast('🔔 휴대폰 알림을 켰어요. 화면을 꺼도 안내가 와요.', 'success');
    }
    return result;
  }

  window.PUTDUK_PUSH = {
    supportsPush,
    subscribeWithSession,
    unsubscribeWithSession,
    maybePromptAfterLogin
  };
})();
