import { test, expect } from '@playwright/test';

test('guide page renders its sections and glossary', async ({ page }) => {
  await page.goto('/guide');
  await expect(page.getByTestId('guide-page')).toBeVisible();
  await expect(page.getByTestId('guide-section-board')).toBeVisible();
  await expect(page.getByTestId('guide-section-gates')).toBeVisible();
});

test('the intro wizard opens, steps through, and closes', async ({ page }) => {
  await page.goto('/guide');
  await page.getByTestId('watch-intro').click();

  const wizard = page.getByTestId('onboarding');
  await expect(wizard).toBeVisible();
  await expect(page.getByTestId('onboarding-progress')).toHaveText('1 / 4');

  // Step to the last card, then finish.
  await page.getByTestId('onboarding-next').click();
  await page.getByTestId('onboarding-next').click();
  await page.getByTestId('onboarding-next').click();
  await expect(page.getByTestId('onboarding-progress')).toHaveText('4 / 4');
  await page.getByTestId('onboarding-done').click();
  await expect(wizard).toHaveCount(0);
});

test('the shared footer (guide + methodology links) appears on the board', async ({ page }) => {
  await page.goto('/app');
  await expect(page.getByTestId('scan-board')).toBeVisible({ timeout: 30_000 });
  await expect(page.getByTestId('site-footer')).toBeVisible();
  await expect(page.getByTestId('footer-guide')).toBeVisible();
  await expect(page.getByTestId('footer-methodology')).toBeVisible();
});
