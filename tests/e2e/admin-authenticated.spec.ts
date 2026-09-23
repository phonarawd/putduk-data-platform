import { expect, test } from '@playwright/test';

const adminEmail = process.env.PUTDUK_ADMIN_EMAIL || '';
const adminPassword = process.env.PUTDUK_ADMIN_PASSWORD || '';
const baseUrl = process.env.PLAYWRIGHT_BASE_URL || 'https://ops.hiptk.app';

test.describe('Production Admin authenticated E2E', () => {
  test.skip(!adminEmail || !adminPassword, 'PUTDUK_ADMIN_EMAIL / PUTDUK_ADMIN_PASSWORD are required for authenticated Admin E2E.');

  test('Admin login creates an authorized work-review session', async ({ page }) => {
    let meResponse: { status: number; body: { ok?: boolean; roles?: string[] } } | null = null;

    page.on('response', async (response) => {
      if (!response.url().includes('/functions/v1/admin-control')) return;
      try {
        const request = response.request();
        const payload = request.postDataJSON?.();
        if (payload?.action !== 'me') return;
        meResponse = { status: response.status(), body: await response.json() };
      } catch {}
    });

    await page.goto(`${baseUrl}/admin/`, { waitUntil: 'domcontentloaded' });
    await expect(page.locator('html')).toHaveAttribute('data-mode', 'admin');
    const loginForm = page.locator('#loginForm');
    await expect(loginForm).toBeVisible();
    await page.locator('#loginEmail').fill(adminEmail);
    await page.locator('#loginPassword').fill(adminPassword);
    await loginForm.getByRole('button', { name: '로그인' }).click();

    await expect.poll(() => meResponse?.status ?? 0, { timeout: 15_000 }).toBe(200);
    expect(meResponse?.body.ok).toBe(true);
    expect(meResponse?.body.roles || []).toEqual(expect.arrayContaining(['work_review']));
    await expect(page.locator('[data-nav="reviews"], [data-nav="review"]').first()).toBeVisible();
  });
});