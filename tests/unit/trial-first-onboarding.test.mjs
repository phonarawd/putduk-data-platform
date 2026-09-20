import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const app = await readFile(new URL('../../dist/assets/app.js', import.meta.url), 'utf8');

test('new members see trial-first onboarding before install or balance education', () => {
  assert.match(app, /state\.onboardingStep = 'first-work'/);
  assert.match(app, /data-action="start-first-work"/);
  assert.match(app, /첫 업무는 퍼뜩이 지원해요/);
  assert.match(app, /입금이나 보증금 설명은 첫 업무를 마친 뒤/);
  assert.doesNotMatch(app, /체험 수당 3천원은 USDT로만 출금가능해요/);
});

test('general work explanation follows approved trial', () => {
  assert.match(app, /approvedTrialExists/);
  assert.match(app, /state\.onboardingStep = 'general-work'/);
  assert.match(app, /data-action="ack-general-work"/);
  assert.match(app, /업무 보증금은 진행 중에만 잠기고/);
});

test('PWA prompt is gated behind approved trial and general explanation', () => {
  assert.match(app, /trialApproved && state\.onboardingGeneralSeen && !state\.onboardingPwaDone/);
});
