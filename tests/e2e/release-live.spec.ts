import { expect, test, type Page } from '@playwright/test';

const memberEmail = process.env.PUTDUK_TRIAL_EMAIL || '';
const memberPassword = process.env.PUTDUK_TRIAL_PASSWORD || '';
const adminEmail = process.env.PUTDUK_ADMIN_EMAIL || '';
const adminPassword = process.env.PUTDUK_ADMIN_PASSWORD || '';
const adminMemberPublicId = process.env.PUTDUK_E2E_MEMBER_PUBLIC_ID || '';
const memberUrl = process.env.PLAYWRIGHT_MEMBER_URL || process.env.PLAYWRIGHT_BASE_URL || 'http://127.0.0.1:4173/';
const adminUrl = process.env.PLAYWRIGHT_ADMIN_URL || new URL('/admin/', memberUrl).toString();

async function login(page: Page, email: string, password: string) {
  await page.locator('[data-action="open-login"]').first().click();
  await page.locator('#loginEmail').fill(email);
  await page.locator('#loginPassword').fill(password);
  await page.locator('#loginForm').getByRole('button', { name: '로그인', exact: true }).click();
}

test('live gate: 전용 회원 계정 로그인 → 로그아웃 후 사용자 캐시 제거', async ({ page }) => {
  test.skip(!memberEmail || !memberPassword, 'PUTDUK_TRIAL_EMAIL / PUTDUK_TRIAL_PASSWORD가 있을 때만 실행합니다.');

  await page.goto(memberUrl);
  await login(page, memberEmail, memberPassword);
  await expect(page.locator('[data-action="logout"]').first()).toBeVisible();

  // 온보딩 모달이 있으면 닫아 로그아웃 클릭이 가려지지 않게 한다.
  const ackGeneral = page.locator('[data-action="ack-general-work"]');
  if (await ackGeneral.isVisible().catch(() => false)) await ackGeneral.click();
  const skipPwa = page.locator('[data-action="skip-pwa"]');
  if (await skipPwa.isVisible().catch(() => false)) await skipPwa.click();
  const ackGrant = page.locator('[data-action="ack-grant"]');
  if (await ackGrant.isVisible().catch(() => false)) await ackGrant.click();

  // 로그인 hydrate만으로는 saveState가 안 탈 수 있어, 세션 userId로 유저 스코프 캐시를 남긴 뒤 로그아웃 정리를 검증한다.
  await page.evaluate(() => {
    const authKey = Object.keys(localStorage).find((key) => key.startsWith('sb-') && key.endsWith('-auth-token'));
    const raw = authKey ? localStorage.getItem(authKey) : null;
    const parsed = raw ? JSON.parse(raw) : null;
    const userId = parsed?.user?.id;
    if (!userId) throw new Error('missing authenticated user id');
    localStorage.setItem(`putduk-state-v2:${userId}`, JSON.stringify({ theme: 'light', history: [{ id: 'live-gate-sentinel' }] }));
  });

  const memberKeysBefore = await page.evaluate(() => Object.keys(localStorage).filter((key) => key.startsWith('putduk-state-v2:')));
  expect(memberKeysBefore.length).toBeGreaterThan(0);

  await page.locator('.topbar [data-action="logout"], .profile-logout').first().click();
  await expect(page.locator('[data-action="open-login"]').first()).toBeVisible({ timeout: 20_000 });

  const memberKeysAfter = await page.evaluate(() => Object.keys(localStorage).filter((key) => key.startsWith('putduk-state-v2:')));
  expect(memberKeysAfter).toEqual([]);
});

test('live gate: 전용 테스트 회원 상세는 내부 스크롤과 역할별 PII 안내를 유지한다', async ({ page }) => {
  test.skip(!adminEmail || !adminPassword, 'PUTDUK_ADMIN_EMAIL / PUTDUK_ADMIN_PASSWORD가 있을 때만 실행합니다.');
  test.skip(!adminMemberPublicId, 'PUTDUK_E2E_MEMBER_PUBLIC_ID로 전용 테스트 회원을 지정했을 때만 실행합니다.');

  await page.goto(adminUrl);
  await login(page, adminEmail, adminPassword);
  await expect(page.locator('[data-action="logout"]').first()).toBeVisible({ timeout: 20_000 });

  await page.locator('[data-nav="members"]').first().click();
  await page.locator('#memberSearchInput').fill(adminMemberPublicId);
  await page.locator('#memberSearchForm').getByRole('button', { name: '찾기', exact: true }).click();

  const testMemberRow = page.locator('tr', { hasText: adminMemberPublicId }).first();
  await expect(testMemberRow).toBeVisible();
  await expect(testMemberRow.getByText(adminMemberPublicId, { exact: true })).toBeVisible();
  const detailButton = testMemberRow.locator('[data-action="member-detail"]');
  await expect(detailButton).toBeVisible();
  await detailButton.click();

  const modal = page.locator('.member-detail-modal');
  const body = modal.locator('.modal-body');
  await expect(modal).toBeVisible();
  await expect(body).toBeVisible();

  const scrollContract = await body.evaluate((element) => ({
    overflowY: getComputedStyle(element).overflowY,
    clientHeight: element.clientHeight,
    scrollHeight: element.scrollHeight
  }));
  expect(['auto', 'scroll']).toContain(scrollContract.overflowY);
  expect(scrollContract.clientHeight).toBeGreaterThan(0);

  const privacyCopy = modal.getByText(/전체 휴대폰 번호 표시 중|전체 번호는 최고관리자만 볼 수 있습니다/);
  await expect(privacyCopy).toBeVisible({ timeout: 15_000 });
});
