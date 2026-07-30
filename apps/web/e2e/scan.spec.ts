import { test, expect } from '@playwright/test';

/**
 * Smoke tests for the Scan board (landing page, TODO M2 / design §6.3).
 * Runs against the dev server with THRESHER_PROVIDER=mock. The mock universe
 * puts MOCKLONG (a clean uptrend) on the board and collapses the rest.
 */
test.describe('scan board', () => {
  test('landing renders the board with counts and a ranked row', async ({ page }) => {
    await page.goto('/app');

    const board = page.getByTestId('scan-board');
    await expect(board).toBeVisible({ timeout: 30_000 });
    await expect(page.getByTestId('scan-counts')).toBeVisible();

    // MOCKLONG clears all gates on the Daily tab.
    const row = page.getByTestId('scan-row-MOCKLONG');
    await expect(row).toBeVisible();
    await expect(page.getByTestId('scan-bias-MOCKLONG')).toContainText(/long/i);

    await expect(page.getByTestId('disclaimer')).toBeVisible();
  });

  test('clicking a row expands an inline detail drawer', async ({ page }) => {
    await page.goto('/app');
    const bias = page.getByTestId('scan-bias-MOCKLONG');
    await expect(bias).toBeVisible({ timeout: 30_000 });

    // Clicking the row (a non-link cell) expands the drawer, it does not navigate.
    await bias.click();
    await expect(page.getByTestId('scan-detail-MOCKLONG')).toBeVisible();
    await expect(page).toHaveURL(/\/app(\?|$)/);
  });

  test('the symbol link and drawer link open the full Analyze view', async ({ page }) => {
    await page.goto('/app');
    await expect(page.getByTestId('scan-row-MOCKLONG')).toBeVisible({ timeout: 30_000 });

    // The symbol is a link into the full per-symbol view.
    await page.getByTestId('scan-row-MOCKLONG').getByRole('link').first().click();
    await expect(page).toHaveURL(/\/analyze\?symbol=MOCKLONG/);

    const badge = page.getByTestId('direction-badge');
    await expect(badge).toBeVisible({ timeout: 30_000 });
    await expect(badge).toContainText(/long/i);
  });

  test('Top is the default view and aggregates candle sizes; tabs switch', async ({ page }) => {
    await page.goto('/app');
    await expect(page.getByTestId('scan-tab-top')).toHaveAttribute('aria-pressed', 'true');

    const board = page.getByTestId('scan-board');
    await expect(board).toBeVisible({ timeout: 30_000 });
    // MOCKLONG (a Daily setup) surfaces on the aggregated Top board.
    await expect(page.getByTestId('scan-row-MOCKLONG')).toBeVisible();

    // Switching to the Daily tab still shows it.
    await page.getByTestId('scan-tab-swing').click();
    await expect(page.getByTestId('scan-row-MOCKLONG')).toBeVisible({ timeout: 30_000 });
  });

  test('the direction filter narrows the board', async ({ page }) => {
    await page.goto('/app');
    await expect(page.getByTestId('scan-row-MOCKLONG')).toBeVisible({ timeout: 30_000 });

    // MOCKLONG is a long setup, so filtering to Shorts hides it.
    await page.getByTestId('filter-short').click();
    await expect(page.getByTestId('scan-row-MOCKLONG')).toHaveCount(0);

    await page.getByTestId('filter-all').click();
    await expect(page.getByTestId('scan-row-MOCKLONG')).toBeVisible();
  });

  test('the selected tab persists across a reload via the URL', async ({ page }) => {
    await page.goto('/app');
    await page.getByTestId('scan-tab-swing').click();
    await expect(page).toHaveURL(/[?&]tab=swing/);

    await page.reload();
    await expect(page.getByTestId('scan-tab-swing')).toHaveAttribute('aria-pressed', 'true');
  });

  test('the header Search link navigates to the Analyze view', async ({ page }) => {
    await page.goto('/app');
    await page.getByTestId('nav-search').click();
    await expect(page).toHaveURL(/\/analyze/);
    await expect(page.getByTestId('ticker-input')).toBeVisible();
  });
});
