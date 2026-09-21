import { expect, test, type Page } from '@playwright/test';

const memberEmail = process.env.PUTDUK_TRIAL_EMAIL || '';
const memberPassword = process.env.PUTDUK_TRIAL_PASSWORD || '';
const adminEmail = process.env.PUTDUK_ADMIN_EMAIL || '';
const adminPassword = process.env.PUTDUK_ADMIN_PASSWORD || '';
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

  const memberKeysBefore = await page.evaluate(() => Object.keys(localStorage).filter((key) => key.startsWith('putduk-state-v2:')));
  expect(memberKeysBefore.length).toBeGreaterThan(0);

  await page.locator('[data-action="logout"]').first().click();
  await expect(page.locator('[data-action="open-login"]').first()).toBeVisible();

  const memberKeysAfter = await page.evaluate(() => Object.keys(localStorage).filter((key) => key.startsWith('putduk-state-v2:')));
  expect(memberKeysAfter).toEqual([]);
});

test('live gate: 운영자 회원 상세는 내부 스크롤과 역할별 PII 안내를 유지한다', async ({ page }) => {
  test.skip(!adminEmail || !adminPassword, 'PUTDUK_ADMIN_EMAIL / PUTDUK_ADMIN_PASSWORD가 있을 때만 실행합니다.');

  await page.goto(adminUrl);
  await login(page, adminEmail, adminPassword);
  await expect(page.locator('[data-action="logout"]').first()).toBeVisible();

  await page.locator('[data-nav="members"]').first().click();
  const detailButton = page.locator('[data-action="member-detail"]').first();
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
  await expect(privacyCopy).toBeVisible();
});
