// 퍼뜩 공식 홈(회원 웹)에 채널톡을 붙인다. Access Secret은 프론트에 넣지 않는다.

export const CHANNEL_PLUGIN_KEY = 'a1b92284-6a36-41aa-9f00-4f4b084c4f47';
export const CHANNEL_SCRIPT_SRC = 'https://cdn.channel.io/plugin/ch-plugin-web.js';
export const CHANNEL_Z_INDEX = 90;

export const MEMBER_PAGE_PATH = {
  dashboard: '/근무',
  nodes: '/라인찾기',
  history: '/내역',
  wallet: '/지갑',
  membership: '/사원증',
  benefits: '/등급혜택',
  referrals: '/추천',
  support: '/도움말'
};

export function pluginKeyFromConfig(config = {}) {
  return String(config.channelPluginKey || CHANNEL_PLUGIN_KEY).trim();
}

export function appearanceFromTheme(theme) {
  if (theme === 'dark') return 'dark';
  if (theme === 'light') return 'light';
  return 'system';
}

export function identityKey(session) {
  return String(session?.user?.id || '').trim();
}

export function memberPagePath(memberPage) {
  const key = String(memberPage || 'dashboard');
  return MEMBER_PAGE_PATH[key] || `/${key}`;
}

export function overlayHidesChannel(overlayKey) {
  return Boolean(overlayKey);
}

export function buildMemberProfile(session, profile) {
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

export function buildBootOption(input = {}) {
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
