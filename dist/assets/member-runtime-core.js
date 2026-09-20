(() => {
  'use strict';

  if (document.documentElement.dataset.mode !== 'member' || window.PUTDUK_MEMBER_RUNTIME) return;

  const config = window.PUTDUK_CONFIG || {};
  const app = document.getElementById('app');
  let client = null;
  let observer = null;
  let authSubscription = null;
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

  function ensureAuthSubscription() {
    const sharedClient = getClient();
    if (authSubscription || !sharedClient || !authSubscribers.size) return;
    const result = sharedClient.auth.onAuthStateChange((event, session) => {
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
    observeMutations,
    onAuthStateChange
  });
})();
