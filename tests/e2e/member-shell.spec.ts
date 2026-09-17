import { expect, test } from '@playwright/test';

test.describe('회원 셸', () => {
  test('한국어 회원 화면이 로드된다', async ({ page }) => {
    await page.goto('/');
    await expect(page.locator('html')).toHaveAttribute('lang', 'ko');
    await expect(page.locator('html')).toHaveAttribute('data-mode', 'member');
    await expect(page.getByText('퍼뜩').first()).toBeVisible();
    await expect(page.getByRole('button', { name: '테마 전환' })).toBeVisible();
  });

  test('테마 전환 버튼이 밝은 모드에서 동작한다', async ({ page }) => {
    await page.goto('/');
    const root = page.locator('html');
    await expect(root).toHaveAttribute('data-theme', 'light');
    await page.getByRole('button', { name: '테마 전환' }).first().click();
    await expect(root).toHaveAttribute('data-theme', 'dark');
  });
});
