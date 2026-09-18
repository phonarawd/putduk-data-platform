import test from 'node:test';
import assert from 'node:assert/strict';
import {
  CHANNEL_PLUGIN_KEY,
  CHANNEL_SCRIPT_SRC,
  CHANNEL_Z_INDEX,
  appearanceFromTheme,
  buildBootOption,
  buildMemberProfile,
  identityKey,
  memberPagePath,
  overlayHidesChannel,
  pluginKeyFromConfig
} from '../../src/session/channel-talk.mjs';

test('채널톡 플러그인 키와 공식 스크립트 주소가 있다', () => {
  assert.match(CHANNEL_PLUGIN_KEY, /^[0-9a-f-]{36}$/i);
  assert.equal(CHANNEL_SCRIPT_SRC, 'https://cdn.channel.io/plugin/ch-plugin-web.js');
  assert.equal(CHANNEL_Z_INDEX, 90);
});

test('비회원은 익명으로 켜고 회원은 사원 정보를 실어 보낸다', () => {
  const guest = buildBootOption({ theme: 'light' });
  assert.equal(guest.pluginKey, CHANNEL_PLUGIN_KEY);
  assert.equal(guest.language, 'ko');
  assert.equal(guest.memberId, undefined);
  assert.equal(guest.profile, undefined);
  assert.equal(guest.zIndex, 90);

  const session = {
    user: {
      id: '11111111-1111-4111-8111-111111111111',
      email: 'crew@example.com',
      phone: '+821011112222',
      user_metadata: { display_name: '김라인' }
    }
  };
  const profile = { display_name: '김라인', public_id: 'PDK-1024', member_tier: '라인' };
  const member = buildBootOption({ session, profile, theme: 'dark' });
  assert.equal(member.memberId, session.user.id);
  assert.equal(member.appearance, 'dark');
  assert.deepEqual(member.profile, {
    name: '김라인',
    email: 'crew@example.com',
    mobileNumber: '+821011112222',
    employeeNo: 'PDK-1024',
    memberTier: '라인'
  });
  assert.equal(identityKey(session), session.user.id);
});

test('설정 키·화면 경로·오버레이 숨김을 맞춘다', () => {
  assert.equal(pluginKeyFromConfig({ channelPluginKey: 'custom-key' }), 'custom-key');
  assert.equal(pluginKeyFromConfig({}), CHANNEL_PLUGIN_KEY);
  assert.equal(memberPagePath('wallet'), '/지갑');
  assert.equal(memberPagePath('support'), '/도움말');
  assert.equal(appearanceFromTheme('dark'), 'dark');
  assert.equal(overlayHidesChannel('modal:auth'), true);
  assert.equal(overlayHidesChannel(''), false);
  assert.deepEqual(buildMemberProfile(null, null), {});
});
