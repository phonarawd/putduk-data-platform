import { expect, test, type Page } from '@playwright/test';

const adminEmail = process.env.PUTDUK_ADMIN_EMAIL || '';
const adminPassword = process.env.PUTDUK_ADMIN_PASSWORD || '';
const baseUrl = process.env.PLAYWRIGHT_BASE_URL || 'https://ops.hiptk.app';

// Review E2E — REJECTED 경로 (standalone: 회원 flow 없이 기존 pending fixture 사용)
// pending fixture가 필요하다. 사전 조건: task_runs에 submitted/review_pending이 1건 이상.

test.describe('Production Admin Review E2E — rejected', () => {
  test.beforeAll(() => {
    if (!adminEmail || !adminPassword) throw new Error('PUTDUK_ADMIN_EMAIL / PUTDUK_ADMIN_PASSWORD are required.');
  });

  test('admin rejection reverses reward and releases stake on a pending run', async ({ page }) => {
    test.setTimeout(120_000);

    let reviewTaskResponse: { status: number; body: { ok?: boolean; task_run?: { status?: string; reward_status?: string } } } | null = null;
    page.on('response', async (response) => {
      const url = response.url();
      if (!url.includes('/functions/v1/admin-master') && !url.includes('/functions/v1/admin-control')) return;
      try {
        const payload = response.request().postDataJSON?.();
        if (payload?.action !== 'review_task') return;
        reviewTaskResponse = { status: response.status(), body: await response.json() };
      } catch {}
    });

    // 1. Admin 로그인
    await page.goto(`${baseUrl}/admin/`, { waitUntil: 'domcontentloaded' });
    await expect(page.locator('html')).toHaveAttribute('data-mode', 'admin');
    const loginForm = page.locator('#loginForm');
    if (!(await loginForm.isVisible().catch(() => false))) {
      await page.getByRole('button', { name: '운영자 로그인' }).first().click();
    }
    await expect(loginForm).toBeVisible();
    await page.locator('#loginEmail').fill(adminEmail);
    await page.locator('#loginPassword').fill(adminPassword);
    await loginForm.getByRole('button', { name: '로그인' }).click();
    await expect(page.locator('[data-nav="reviews"]').first()).toBeVisible({ timeout: 20_000 });

    // 2. 검수 메뉴 진입
    await page.locator('[data-nav="reviews"]').first().click();

    // 3. 반려 버튼이 있는 첫 번째 pending 행
    const pendingRow = page.locator('tr', { has: page.locator('[data-review-action="rejected"]') }).first();
    await expect(pendingRow).toBeVisible({ timeout: 20_000 });

    // 4. 반려 처리 (confirm 수락)
    page.once('dialog', (dialog) => dialog.accept());
    await pendingRow.locator('[data-review-action="rejected"]').click();

    // 5. 결과 UI: 행이 처리 완료로 변경
    await expect(pendingRow).toContainText('처리 완료', { timeout: 20_000 });

    // 6. 서버 결과: 200 + ok + rejected/reversed
    await expect.poll(() => reviewTaskResponse?.status ?? 0).toBe(200);
    expect(reviewTaskResponse?.body.ok).toBe(true);
    expect(reviewTaskResponse?.body.task_run?.status).toBe('rejected');
    expect(reviewTaskResponse?.body.task_run?.reward_status).toBe('reversed');
  });
});
