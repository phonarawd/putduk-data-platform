import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const app = fs.readFileSync(new URL('../../dist/assets/app-ia13.js', import.meta.url), 'utf8');
const finance = fs.readFileSync(new URL('../../supabase/functions/member-finance/index.ts', import.meta.url), 'utf8');

 test('wallet exposes independent security and withdrawal PIN entry points', () => {
  assert.match(app, /data-action="open-pin-settings"/);
  assert.match(app, /securityPinSettingsForm/);
  assert.match(app, /withdrawalPinSettingsForm/);
  assert.match(app, /set_security_pin/);
  assert.match(app, /set_withdrawal_pin/);
  assert.match(app, /current_pin/);
  assert.match(app, /새 PIN을 두 칸에 똑같이 적어 주세요/);
  assert.match(app, /PIN은 숫자 6자리여야 해요/);
  assert.match(app, /PIN이 잠시 잠겨 있어요/);
  assert.match(app, /const securityForm = state\.depositDestinationsError/);
  assert.match(app, /const withdrawalForm = state\.withdrawalPinError/);
  assert.match(app, /state\.withdrawalPinError = true/);
});

test('withdrawal PIN status reads the private scope without consuming an attempt', () => {
  assert.match(finance, /withdrawalPinStatus/);
  assert.match(finance, /schema\("private"\)[\s\S]{0,180}from\("withdrawal_pins"\)/);
  assert.match(finance, /action === "withdrawal_pin_status"/);
  assert.doesNotMatch(finance, /withdrawalPinStatus[\s\S]{0,600}putduk_member_verify_withdrawal_pin/);
});

console.log('PIN UI contract: ok');
