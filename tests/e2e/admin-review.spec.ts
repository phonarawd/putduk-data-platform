import { expect, test } from '@playwright/test';

const adminEmail = process.env.PUTDUK_ADMIN_EMAIL || '';
const adminPassword = process.env.PUTDUK_ADMIN_PASSWORD || '';
const baseUrl = process.env.PLAYWRIGHT_BASE_URL || 'https://ops.hiptk.app';

// Review E2E 대상 task_run (Production fixture)
// PDK-RUN-260923-D776AE2D / id: d776ae2d-71e8-4bf3-bf0f-edc620ff4823
// 이 run은 PHASE 3에서 생성된 실제 제출 run으로, 승인 시 원금(보증) 해제 + 수당 지급이 서버에서 발생한다.
const TARGET_RUN_ID = 'd776ae2d-71e8-4bf3-bf0f-edc620ff4823';
const TARGET_PUBLIC_ID = 'PDK-RUN-260923-D776AE2D';

test.describe('Production Admin Review E2E', () => {
  test.beforeAll(() => {
    if (!adminEmail || !adminPassword) throw new Error('PUTDUK_ADMIN_EMAIL / PUTDUK_ADMIN_PASSWORD are required for Admin Review E2E.');
  });

  test('Admin reviews the pending task run and approves it end to end', async ({ page }) => {
    let reviewTaskResponse: { status: number; body: { ok?: boolean; task_run?: { id?: string; status?: string } } } | null = null;

    page.on('response', async (response) => {
      // 운영 페이지는 admin-master(→ admin-phase5 → admin-control) 체인으로 호출한다.
      const url = response.url();
      if (!url.includes('/functions/v1/admin-master') && !url.includes('/functions/v1/admin-control')) return;
      try {
        const payload = response.request().postDataJSON?.();
        if (payload?.action !== 'review_task') return;
        reviewTaskResponse = { status: response.status(), body: await response.json() };
      } catch {}
    });

    // 1. Admin 로그인 (auth e2e와 동일한 흐름)
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

    // 2. 검수 메뉴 진입 (권한 확인 후 사이드바 노출)
    await expect(page.locator('[data-nav="reviews"]').first()).toBeVisible({ timeout: 20_000 });
    await page.locator('[data-nav="reviews"]').first().click();

    // 3. 검수 대기 목록에서 실제 pending task_run 확인
    const row = page.locator('tr', { has: page.locator(`[data-review-id="${TARGET_RUN_ID}"]`) });
    await expect(row).toBeVisible({ timeout: 20_000 });
    await expect(row).toContainText(TARGET_PUBLIC_ID.slice(-8)); // 화면에는 public_id 뒷자리가 표시될 수 있다

    // 4. 승인 처리 (브라우저 confirm 수락)
    page.once('dialog', (dialog) => dialog.accept());
    await row.locator('[data-review-action="approved"]').click();

    // 5. 결과 UI 확인: 행이 처리 완료로 바뀌는지
    await expect(row).toContainText('처리 완료', { timeout: 20_000 });

    // 6. 서버 결과 확인: review_task 응답이 200 + ok + approved인지
    await expect.poll(() => reviewTaskResponse?.status ?? 0).toBe(200);
    expect(reviewTaskResponse?.body.ok).toBe(true);
    expect(reviewTaskResponse?.body.task_run?.status).toBe('approved');
  });
});
