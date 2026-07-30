import { test, expect } from '@playwright/test';

/**
 * Shared app header (Dashboard / Leaderboard / Search / Brokerage / Profile).
 * Runs keyless, so protected routes are reachable without a login.
 */
test('the shared header links reach dashboard and brokerage', async ({ page }) => {
  await page.goto('/app');
  await expect(page.getByTestId('site-header')).toBeVisible({ timeout: 30_000 });

  await page.getByTestId('nav-dashboard').click();
  await expect(page).toHaveURL(/\/dashboard/);
  await expect(page.getByTestId('dashboard-page')).toBeVisible();

  await page.getByTestId('nav-brokerage').click();
  await expect(page).toHaveURL(/\/brokerage/);
  await expect(page.getByTestId('brokerage-page')).toBeVisible();

  await page.getByTestId('nav-leaderboard').click();
  await expect(page).toHaveURL(/\/app/);
  await expect(page.getByTestId('scan-board')).toBeVisible({ timeout: 30_000 });
});

test('reference pages show a Back button; app pages do not', async ({ page }) => {
  await page.goto('/guide');
  await expect(page.getByTestId('nav-back')).toBeVisible();

  await page.goto('/app');
  await expect(page.getByTestId('scan-board')).toBeVisible({ timeout: 30_000 });
  await expect(page.getByTestId('nav-back')).toHaveCount(0);
});
