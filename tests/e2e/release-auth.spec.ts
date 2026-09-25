import { expect, test } from '@playwright/test';

const LOGIN_CASES = [
  {
    name: '잘못된 인증정보',
    status: 400,
    code: 'invalid_credentials',
    message: 'Invalid login credentials',
    expected: '이메일 또는 비밀번호가 올바르지 않아요. 다시 확인하거나 비밀번호를 재설정해 주세요.'
  },
  {
    name: '이메일 미인증',
    status: 400,
    code: 'email_not_confirmed',
    message: 'Email not confirmed',
    expected: '이메일 인증이 완료되지 않았어요. 받은 메일의 인증 링크를 확인해 주세요.'
  },
  {
    name: '이용 제한 계정',
    status: 403,
    code: 'user_banned',
    message: 'User is banned',
    expected: '이 계정은 현재 이용이 제한되어 있어요. 고객센터에 문의해 주세요.'
  },
  {
    name: '요청 제한',
    status: 429,
    code: 'over_request_rate_limit',
    message: 'Too many requests',
    expected: '로그인 요청이 잠시 제한됐어요. 잠시 후 다시 시도해 주세요.'
  },
  {
    name: '인증 서버 장애',
    status: 503,
    code: 'unexpected_failure',
    message: 'Temporary server failure',
    expected: '인증 서버에 연결하지 못했어요. 인터넷 연결을 확인한 뒤 다시 시도해 주세요.'
  }
] as const;

for (const scenario of LOGIN_CASES) {
  test(`로그인 오류 분류: ${scenario.name}`, async ({ page }) => {
    await page.route('**/auth/v1/token*', async (route) => {
      await route.fulfill({
        status: scenario.status,
        contentType: 'application/json',
        headers: { 'x-supabase-api-version': '2024-01-01' },
        body: JSON.stringify({ error: 'invalid_grant', error_description: scenario.message, error_code: scenario.code, code: scenario.code, msg: scenario.message, message: scenario.message })
      });
    });

    await page.goto('/');
    await page.locator('[data-action="open-login"]').first().click();
    await page.locator('#loginEmail').fill('phase6.invalid@example.test');
    await page.locator('#loginPassword').fill('not-a-real-password');
    await page.locator('#loginForm').getByRole('button', { name: '로그인', exact: true }).click();

    await expect(page.locator('[data-auth-feedback]').filter({ hasText: scenario.expected })).toBeVisible();
  });
}

function fakeJwt(payload: Record<string, unknown>) {
  const encode = (value: unknown) => Buffer.from(JSON.stringify(value)).toString('base64url');
  return `${encode({ alg: 'none', typ: 'JWT' })}.${encode(payload)}.phase6`;
}

test('SIGNED_OUT/로그아웃은 회원 전용 캐시와 화면 상태를 정리한다', async ({ page }) => {
  const userId = '11111111-1111-4111-8111-111111111111';
  const email = 'phase6.member@example.test';
  const authStorageKey = 'sb-gaugwamwceqdnqdqrxqg-auth-token';
  const memberStateKey = `putduk-state-v2:${userId}`;
  const accessToken = fakeJwt({
    sub: userId,
    email,
    role: 'authenticated',
    aud: 'authenticated',
    exp: Math.floor(Date.now() / 1000) + 86_400
  });

  await page.addInitScript(({ authStorageKey, memberStateKey, userId, email, accessToken }) => {
    localStorage.setItem(authStorageKey, JSON.stringify({
      access_token: accessToken,
      refresh_token: 'phase6-refresh-token',
      expires_in: 86400,
      expires_at: Math.floor(Date.now() / 1000) + 86400,
      token_type: 'bearer',
      user: { id: userId, email, role: 'authenticated', aud: 'authenticated', user_metadata: { display_name: 'Phase6 회원' } }
    }));
    localStorage.setItem(memberStateKey, JSON.stringify({
      theme: 'light',
      memberPage: 'wallet',
      history: [{ id: 'phase6-private-history-sentinel', status: '검수 완료' }],
      notifications: [{ id: 'phase6-private-notice-sentinel' }],
      onboardingExperienceStarted: true,
      wallet: { work: 123456, available: 7890 }
    }));
  }, { authStorageKey, memberStateKey, userId, email, accessToken });

  await page.route('**/rest/v1/**', async (route) => {
    const url = route.request().url();
    const headers = { 'content-type': 'application/json', 'content-range': '0-0/1' };
    if (url.includes('/profiles?')) {
      await route.fulfill({
        status: 200,
        headers,
        body: JSON.stringify({
          id: userId,
          public_id: 'PDK-PHASE6',
          display_name: 'Phase6 회원',
          member_tier: '라인',
          status: 'active',
          kyc_status: 'pending',
          trial_consumed_at: '2026-09-20T00:00:00.000Z'
        })
      });
      return;
    }
    await route.fulfill({ status: 200, headers, body: '[]' });
  });
  await page.route('**/functions/v1/**', async (route) => {
    await route.fulfill({ status: 200, contentType: 'application/json', body: '{}' });
  });
  await page.route('**/auth/v1/logout*', async (route) => {
    await route.fulfill({ status: 204, body: '' });
  });

  await page.goto('/');
  const logout = page.locator('[data-action="logout"]:visible').first();
  await expect(logout).toBeVisible();

  await page.evaluate(() => {
    history.pushState(null, '', '/wallet');
    document.body.classList.add('sidebar-open', 'modal-open', 'overlay-open');
  });

  await logout.click();
  await expect(page.locator('[data-action="open-login"]').first()).toBeVisible();
  await page.waitForTimeout(250);

  const snapshot = await page.evaluate(({ memberStateKey }) => ({
    path: location.pathname,
    hasMemberState: localStorage.getItem(memberStateKey) !== null,
    baseState: JSON.parse(localStorage.getItem('putduk-state-v2') || '{}'),
    classes: Array.from(document.body.classList)
  }), { memberStateKey });

  expect(snapshot.path).toBe('/');
  expect(snapshot.hasMemberState).toBe(false);
  expect(snapshot.baseState.history || []).toEqual([]);
  expect(snapshot.baseState.notifications || []).toEqual([]);
  expect(snapshot.classes).not.toContain('sidebar-open');
  expect(snapshot.classes).not.toContain('modal-open');
  expect(snapshot.classes).not.toContain('overlay-open');
});
