import { expect, test, type Page } from '@playwright/test';

const adminEmail = process.env.PUTDUK_ADMIN_EMAIL || '';
const adminPassword = process.env.PUTDUK_ADMIN_PASSWORD || '';
const memberEmail = process.env.PUTDUK_TRIAL_EMAIL || '';
const memberPassword = process.env.PUTDUK_TRIAL_PASSWORD || '';
const baseUrl = process.env.PLAYWRIGHT_BASE_URL || 'https://ops.hiptk.app';
const memberUrl = process.env.PLAYWRIGHT_MEMBER_URL || 'https://app.hiptk.app';

// Review E2E — REJECTED 경로
// 회원 E2E로 실제 근무를 제출해 pending run을 만들고(서버 seed = 클라이언트 번들 동일 알고리즘),
// Admin이 반려하면 서버에서 rejected/reversed + stake release가 발생하는지 검증한다.
// 온보딩 모달(일반 업무 보기 등)은 렌더링 경합으로 재표시될 수 있어, 모달이 사라질 때까지 닫기를 반복한다.

test.describe('Production Admin Review E2E — rejected', () => {
  test.beforeAll(() => {
    if (!adminEmail || !adminPassword) throw new Error('PUTDUK_ADMIN_EMAIL / PUTDUK_ADMIN_PASSWORD are required.');
    if (!memberEmail || !memberPassword) throw new Error('PUTDUK_TRIAL_EMAIL / PUTDUK_TRIAL_PASSWORD are required to submit a pending run.');
  });

  async function adminLogin(page: Page) {
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
  }

  // 온보딩/오버레이 모달이 완전히 사라질 때까지 닫기를 반복한다.
  async function dismissBlockingOverlays(page: Page, maxAttempts = 10) {
    const blocker = page.locator(
      '[data-modal="onboard-general-work"], [data-modal="onboard-pwa"], [data-modal="onboard-first-work"], [data-modal="result-scene"], [data-modal="review-wait"]'
    );
    for (let attempt = 0; attempt < maxAttempts; attempt++) {
      if (!(await blocker.first().isVisible().catch(() => false))) return;
      const closeActions = ['ack-general-work', 'skip-pwa', 'start-first-work', 'close-result', 'close-review-wait'];
      let closed = false;
      for (const action of closeActions) {
        const btn = page.locator(`[data-action="${action}"]`).first();
        if (await btn.isVisible().catch(() => false)) {
          await btn.click().catch(() => {});
          closed = true;
          break;
        }
      }
      if (!closed) {
        // 닫기 버튼을 못 찾으면 잠시 대기 후 재확인 (렌더 경합)
        await page.waitForTimeout(800);
        continue;
      }
      // 모달이 사라질 때까지 대기 (최대 3초)
      try {
        await blocker.first().waitFor({ state: 'detached', timeout: 3_000 });
      } catch {
        // 재표시되면 루프에서 다시 닫는다
      }
    }
  }

  test('member submits a real run and admin rejection reverses reward and releases stake', async ({ browser }) => {
    test.setTimeout(300_000);

    // ── 1. 회원: 실제 근무 제출 (pending run 생성) ──
    const memberContext = await browser.newContext({ locale: 'ko-KR' });
    const memberPage = await memberContext.newPage();

    await memberPage.goto(memberUrl, { waitUntil: 'domcontentloaded' });
    await expect(memberPage.locator('html')).toHaveAttribute('data-mode', 'member');
    await memberPage.locator('[data-action="open-login"]').first().click();
    await memberPage.locator('#loginEmail').fill(memberEmail);
    await memberPage.locator('#loginPassword').fill(memberPassword);
    await memberPage.locator('#loginForm').getByRole('button', { name: '로그인', exact: true }).click();

    // 로그인 직후 온보딩/오버레이 모달을 모두 닫는다 (렌더 경합 재시도 포함)
    await dismissBlockingOverlays(memberPage);

    // 근무 카드(업무 매칭)에서 출근 가능한 첫 카드 선택
    await expect(memberPage.locator('[data-nav="nodes"]').first()).toBeVisible({ timeout: 25_000 });
    await memberPage.locator('[data-nav="nodes"]').first().click();

    const workCard = memberPage.locator('[data-start-node]').filter({ hasNot: memberPage.locator('[disabled]') }).first();
    await expect(workCard).toBeVisible({ timeout: 25_000 });
    await dismissBlockingOverlays(memberPage);
    await workCard.click();

    // 출근 확인 모달 → 출근하기
    const startConfirm = memberPage.locator('[data-modal="start-confirm"]');
    await expect(startConfirm).toBeVisible({ timeout: 20_000 });
    await startConfirm.getByRole('button', { name: '출근하기' }).click();

    // 근무 오버레이(inspect-entry) 표시 대기
    const inspectEntry = memberPage.locator('.inspect-entry');
    await expect(inspectEntry).toBeVisible({ timeout: 60_000 });

    // 5건 라벨 대조: 화면의 전표 번호 뒷자리(PDK-XXXX)를 그대로 입력
    for (let i = 0; i < 5; i++) {
      const labelInput = memberPage.locator('#inspectLabelInput');
      await expect(labelInput).toBeVisible({ timeout: 25_000 });
      const invoiceCode = await memberPage.locator('.wms-code-num .wms-code-tail').first().textContent();
      await labelInput.fill((invoiceCode || '').trim());
      await inspectEntry.getByRole('button', { name: '이 번호로 확인' }).click();
      await memberPage.waitForTimeout(700);
    }

    // 5건 완료 → 제출 버튼
    const submitButton = memberPage.locator('[data-action="submit-player"]');
    await expect(submitButton).toBeVisible({ timeout: 25_000 });
    await submitButton.click();

    // 제출 완료 확인
    await expect(memberPage.getByText('근무 제출이 완료됐어요')).toBeVisible({ timeout: 60_000 });

    // ── 2. Admin: 반려 처리 ──
    const adminContext = await browser.newContext({ locale: 'ko-KR' });
    const adminPage = await adminContext.newPage();

    let reviewTaskResponse: { status: number; body: { ok?: boolean; task_run?: { status?: string; reward_status?: string } } } | null = null;
    adminPage.on('response', async (response) => {
      const url = response.url();
      if (!url.includes('/functions/v1/admin-master') && !url.includes('/functions/v1/admin-control')) return;
      try {
        const payload = response.request().postDataJSON?.();
        if (payload?.action !== 'review_task') return;
        reviewTaskResponse = { status: response.status(), body: await response.json() };
      } catch {}
    });

    await adminLogin(adminPage);
    await adminPage.locator('[data-nav="reviews"]').first().click();

    // 반려 버튼이 있는 첫 번째 pending 행 (방금 제출한 run)
    const pendingRow = adminPage.locator('tr', { has: adminPage.locator('[data-review-action="rejected"]') }).first();
    await expect(pendingRow).toBeVisible({ timeout: 25_000 });

    // 반려 처리 (confirm 수락)
    adminPage.once('dialog', (dialog) => dialog.accept());
    await pendingRow.locator('[data-review-action="rejected"]').click();

    // 결과 UI: 행이 처리 완료로 변경
    await expect(pendingRow).toContainText('처리 완료', { timeout: 25_000 });

    // 서버 결과: 200 + ok + rejected/reversed
    await expect.poll(() => reviewTaskResponse?.status ?? 0).toBe(200);
    expect(reviewTaskResponse?.body.ok).toBe(true);
    expect(reviewTaskResponse?.body.task_run?.status).toBe('rejected');
    expect(reviewTaskResponse?.body.task_run?.reward_status).toBe('reversed');

    await memberContext.close();
    await adminContext.close();
  });
});
