(() => {
  'use strict';
// 퍼뜩 공식 홈(회원 웹)에 채널톡을 붙인다. Access Secret은 프론트에 넣지 않는다.

const CHANNEL_PLUGIN_KEY = 'a1b92284-6a36-41aa-9f00-4f4b084c4f47';
const CHANNEL_SCRIPT_SRC = 'https://cdn.channel.io/plugin/ch-plugin-web.js';
const CHANNEL_Z_INDEX = 90;

const MEMBER_PAGE_PATH = {
  dashboard: '/근무',
  nodes: '/라인찾기',
  history: '/내역',
  wallet: '/지갑',
  membership: '/사원증',
  benefits: '/등급혜택',
  referrals: '/추천',
  support: '/도움말'
};

function pluginKeyFromConfig(config = {}) {
  return String(config.channelPluginKey || CHANNEL_PLUGIN_KEY).trim();
}

function appearanceFromTheme(theme) {
  if (theme === 'dark') return 'dark';
  if (theme === 'light') return 'light';
  return 'system';
}

function identityKey(session) {
  return String(session?.user?.id || '').trim();
}

function memberPagePath(memberPage) {
  const key = String(memberPage || 'dashboard');
  return MEMBER_PAGE_PATH[key] || `/${key}`;
}

function overlayHidesChannel(overlayKey) {
  return Boolean(overlayKey);
}

function buildMemberProfile(session, profile) {
  const user = session?.user || {};
  const meta = user.user_metadata || {};
  const name = String(profile?.display_name || meta.display_name || '').trim();
  const email = String(user.email || meta.email || '').trim();
  const mobileNumber = String(profile?.phone_e164 || profile?.phone || user.phone || '').trim();
  const publicId = String(profile?.public_id || '').trim();
  const tier = String(profile?.member_tier || '').trim();
  const out = {};
  if (name) out.name = name;
  if (email) out.email = email;
  if (mobileNumber) out.mobileNumber = mobileNumber;
  if (publicId) out.employeeNo = publicId;
  if (tier) out.memberTier = tier;
  return out;
}

function buildBootOption(input = {}) {
  const pluginKey = pluginKeyFromConfig({ channelPluginKey: input.pluginKey });
  const option = {
    pluginKey,
    language: 'ko',
    zIndex: CHANNEL_Z_INDEX,
    trackDefaultEvent: true,
    trackUtmSource: true,
    hideChannelButtonOnBoot: false
  };
  const appearance = appearanceFromTheme(input.theme);
  if (appearance) option.appearance = appearance;
  const memberId = identityKey(input.session);
  if (memberId) {
    option.memberId = memberId;
    const profile = buildMemberProfile(input.session, input.profile);
    if (Object.keys(profile).length) option.profile = profile;
  }
  return option;
}

  function loadChannelScript() {
    const w = window;
    if (w.ChannelIO) return;
    const ch = function () { ch.c(arguments); };
    ch.q = [];
    ch.c = function (args) { ch.q.push(args); };
    w.ChannelIO = ch;
    function inject() {
      if (w.ChannelIOInitialized) return;
      w.ChannelIOInitialized = true;
      const s = document.createElement('script');
      s.type = 'text/javascript';
      s.async = true;
      s.src = CHANNEL_SCRIPT_SRC;
      const x = document.getElementsByTagName('script')[0];
      if (x && x.parentNode) x.parentNode.insertBefore(s, x);
      else document.head.appendChild(s);
    }
    if (document.readyState === 'complete') inject();
    else {
      w.addEventListener('DOMContentLoaded', inject);
      w.addEventListener('load', inject);
    }
  }

  function channelIO(...args) {
    if (typeof window.ChannelIO === 'function') window.ChannelIO(...args);
  }

  const runtimeState = {
    booted: false,
    identity: null,
    page: '',
    overlay: false,
    appearance: ''
  };

  function sync(input) {
    const next = input || {};
    if (next.enabled === false) {
      if (runtimeState.booted) {
        channelIO('shutdown');
        runtimeState.booted = false;
        runtimeState.identity = null;
        runtimeState.page = '';
        runtimeState.overlay = false;
      }
      return;
    }
    loadChannelScript();
    const option = buildBootOption({
      pluginKey: next.pluginKey || pluginKeyFromConfig(window.PUTDUK_CONFIG || {}),
      session: next.session,
      profile: next.profile,
      theme: next.theme
    });
    const identity = identityKey(next.session);
    if (!runtimeState.booted || runtimeState.identity !== identity) {
      if (runtimeState.booted) channelIO('shutdown');
      channelIO('boot', option);
      runtimeState.booted = true;
      runtimeState.identity = identity;
      runtimeState.page = '';
      runtimeState.overlay = overlayHidesChannel(next.overlayKey);
      runtimeState.appearance = option.appearance || '';
      if (runtimeState.overlay) {
        channelIO('hideMessenger');
        channelIO('hideChannelButton');
      }
    } else if (option.profile) {
      channelIO('updateUser', { profile: option.profile, language: 'ko' });
    }
    const page = memberPagePath(next.page);
    if (page !== runtimeState.page) {
      runtimeState.page = page;
      channelIO('setPage', page);
    }
    const appearance = appearanceFromTheme(next.theme);
    if (appearance && appearance !== runtimeState.appearance) {
      runtimeState.appearance = appearance;
      channelIO('setAppearance', appearance);
    }
    const hide = overlayHidesChannel(next.overlayKey);
    if (hide !== runtimeState.overlay) {
      runtimeState.overlay = hide;
      if (hide) {
        channelIO('hideMessenger');
        channelIO('hideChannelButton');
      } else {
        channelIO('showChannelButton');
      }
    }
  }

  function openMessenger() {
    loadChannelScript();
    if (!runtimeState.booted) {
      sync({
        enabled: true,
        pluginKey: pluginKeyFromConfig(window.PUTDUK_CONFIG || {}),
        theme: document.documentElement.dataset.theme
      });
    }
    channelIO('showChannelButton');
    channelIO('showMessenger');
  }

  loadChannelScript();
  if (document.documentElement.getAttribute('data-mode') === 'member') {
    sync({
      enabled: true,
      pluginKey: pluginKeyFromConfig(window.PUTDUK_CONFIG || {}),
      theme: document.documentElement.dataset.theme || 'light'
    });
  }
  window.PutdukChannelTalk = { pluginKeyFromConfig, appearanceFromTheme, identityKey, memberPagePath, overlayHidesChannel, buildMemberProfile, buildBootOption, CHANNEL_PLUGIN_KEY, CHANNEL_SCRIPT_SRC, CHANNEL_Z_INDEX, MEMBER_PAGE_PATH, sync, openMessenger };
})();
