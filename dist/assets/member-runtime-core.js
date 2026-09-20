(() => {
  'use strict';

  if (document.documentElement.dataset.mode !== 'member' || window.PUTDUK_MEMBER_RUNTIME) return;

  const config = window.PUTDUK_CONFIG || {};
  const app = document.getElementById('app');
  let client = null;
  let observer = null;
  let authSubscription = null;
  let snapshotToken = '';
  let snapshotValue = null;
  let snapshotExpiresAt = 0;
  let snapshotPromise = null;
  const mutationSubscribers = new Set();
  const authSubscribers = new Set();

  function getClient() {
    if (client) return client;
    if (!window.supabase || !config.supabaseUrl || !config.supabasePublishableKey) return null;
    client = window.supabase.createClient(config.supabaseUrl, config.supabasePublishableKey, {
      auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: false }
    });
    return client;
  }

  function ensureObserver() {
    if (observer || !app || !mutationSubscribers.size) return;
    observer = new MutationObserver((records) => {
      for (const subscriber of [...mutationSubscribers]) {
        try { subscriber(records); } catch (error) { console.warn('[member-runtime] mutation subscriber failed', error); }
      }
    });
    observer.observe(app, { childList: true, subtree: true, characterData: true });
  }

  function observeMutations(subscriber) {
    if (typeof subscriber !== 'function') return () => {};
    mutationSubscribers.add(subscriber);
    ensureObserver();
    return () => {
      mutationSubscribers.delete(subscriber);
      if (!mutationSubscribers.size && observer) {
        observer.disconnect();
        observer = null;
      }
    };
  }

  function clearMemberExperienceCache() {
    snapshotToken = '';
    snapshotValue = null;
    snapshotExpiresAt = 0;
    snapshotPromise = null;
  }

  async function getMemberExperience(endpoint, accessToken, { force = false, maxAgeMs = 2000 } = {}) {
    const token = String(accessToken || '');
    if (!endpoint || !token) throw new Error('로그인이 필요합니다.');
    const now = Date.now();
    if (snapshotToken !== token) clearMemberExperienceCache();
    snapshotToken = token;
    if (!force && snapshotValue && snapshotExpiresAt > now) return snapshotValue;
    if (!force && snapshotPromise) return snapshotPromise;
    const request = fetch(endpoint, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`,
        'apikey': config.supabasePublishableKey
      },
      body: JSON.stringify({ action: 'member_experience' })
    }).then(async (response) => {
      const data = await response.json().catch(() => ({}));
      if (!response.ok || data?.ok === false) throw new Error(String(data?.error || '회원 업무 현황을 불러오지 못했습니다.'));
      snapshotValue = data;
      snapshotExpiresAt = Date.now() + Math.max(0, Number(maxAgeMs || 0));
      return data;
    }).finally(() => {
      if (snapshotPromise === request) snapshotPromise = null;
    });
    snapshotPromise = request;
    return request;
  }

  function ensureAuthSubscription() {
    const sharedClient = getClient();
    if (authSubscription || !sharedClient || !authSubscribers.size) return;
    const result = sharedClient.auth.onAuthStateChange((event, session) => {
      clearMemberExperienceCache();
      for (const subscriber of [...authSubscribers]) {
        try { subscriber(event, session); } catch (error) { console.warn('[member-runtime] auth subscriber failed', error); }
      }
    });
    authSubscription = result?.data?.subscription || null;
  }

  function onAuthStateChange(subscriber) {
    if (typeof subscriber !== 'function') return () => {};
    authSubscribers.add(subscriber);
    ensureAuthSubscription();
    return () => {
      authSubscribers.delete(subscriber);
      if (!authSubscribers.size && authSubscription) {
        authSubscription.unsubscribe();
        authSubscription = null;
      }
    };
  }

  window.PUTDUK_MEMBER_RUNTIME = Object.freeze({
    getClient,
    getMemberExperience,
    clearMemberExperienceCache,
    observeMutations,
    onAuthStateChange
  });
})();
