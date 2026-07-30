import { test, expect } from '@playwright/test';

test('guide page renders its sections and glossary', async ({ page }) => {
  await page.goto('/guide');
  await expect(page.getByTestId('guide-page')).toBeVisible();
  await expect(page.getByTestId('guide-section-board')).toBeVisible();
  await expect(page.getByTestId('guide-section-gates')).toBeVisible();
});

test('the shared footer (guide + methodology links) appears on the board', async ({ page }) => {
  await page.goto('/app');
  await expect(page.getByTestId('scan-board')).toBeVisible({ timeout: 30_000 });
  await expect(page.getByTestId('site-footer')).toBeVisible();
  await expect(page.getByTestId('footer-guide')).toBeVisible();
  await expect(page.getByTestId('footer-methodology')).toBeVisible();
});
