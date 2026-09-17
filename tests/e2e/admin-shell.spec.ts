import { expect, test } from '@playwright/test';

test.describe('운영자 셸', () => {
  test('한국어 운영자 화면이 로드된다', async ({ page }) => {
    await page.goto('/admin/');
    await expect(page.locator('html')).toHaveAttribute('lang', 'ko');
    await expect(page.locator('html')).toHaveAttribute('data-mode', 'admin');
    await expect(page.getByText('퍼뜩').first()).toBeVisible();
  });
});
