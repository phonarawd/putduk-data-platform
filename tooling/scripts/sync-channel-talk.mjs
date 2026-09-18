import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const srcJs = join(root, 'src', 'session', 'channel-talk.mjs');
const distDir = join(root, 'dist', 'assets');

const source = await readFile(srcJs, 'utf8');
const names = [];
for (const match of source.matchAll(/^export (?:async )?function (\w+)/gm)) names.push(match[1]);
for (const match of source.matchAll(/^export const (\w+)/gm)) names.push(match[1]);
const body = source.replace(/^export /gm, '');

const runtime = `
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
`;

const iife = [
  '(() => {',
  "  'use strict';",
  body.trimEnd(),
  runtime.trimEnd(),
  `  window.PutdukChannelTalk = { ${names.join(', ')}, sync, openMessenger };`,
  '})();',
  ''
].join('\n');

await mkdir(distDir, { recursive: true });
await writeFile(join(distDir, 'channel-talk.js'), iife, 'utf8');
console.log('채널톡 소스를 dist/assets에 동기화했습니다.');
