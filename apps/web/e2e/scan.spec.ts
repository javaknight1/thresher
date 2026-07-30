import { test, expect } from '@playwright/test';

/**
 * Smoke tests for the Scan board (landing page, TODO M2 / design §6.3).
 * Runs against the dev server with THRESHER_PROVIDER=mock. The mock universe
 * puts MOCKLONG (a clean uptrend) on the board and collapses the rest.
 */
test.describe('scan board', () => {
  test('landing renders the board with counts and a ranked row', async ({ page }) => {
    await page.goto('/');

    const board = page.getByTestId('scan-board');
    await expect(board).toBeVisible({ timeout: 30_000 });
    await expect(page.getByTestId('scan-counts')).toBeVisible();

    // MOCKLONG clears all gates on the Daily tab.
    const row = page.getByTestId('scan-row-MOCKLONG');
    await expect(row).toBeVisible();
    await expect(page.getByTestId('scan-bias-MOCKLONG')).toContainText(/long/i);

    await expect(page.getByTestId('disclaimer')).toBeVisible();
  });

  test('a row deep-links into the Analyze view and runs it', async ({ page }) => {
    await page.goto('/');
    await expect(page.getByTestId('scan-row-MOCKLONG')).toBeVisible({ timeout: 30_000 });

    // Click the bias cell (not the symbol link) to prove the WHOLE row navigates.
    await page.getByTestId('scan-bias-MOCKLONG').click();
    await expect(page).toHaveURL(/\/analyze\?symbol=MOCKLONG/);

    const badge = page.getByTestId('direction-badge');
    await expect(badge).toBeVisible({ timeout: 30_000 });
    await expect(badge).toContainText(/long/i);
  });

  test('the Search button navigates to the Analyze view', async ({ page }) => {
    await page.goto('/');
    await page.getByTestId('search-button').click();
    await expect(page).toHaveURL(/\/analyze/);
    await expect(page.getByTestId('ticker-input')).toBeVisible();
  });
});
