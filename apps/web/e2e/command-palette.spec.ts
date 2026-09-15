import { test, expect } from '@playwright/test';

/** Command palette: open from the header, search a ticker, navigate. Keyless e2e. */
test('command palette opens, searches a ticker, and navigates to Analyze', async ({ page }) => {
  await page.goto('/leaderboard');
  await expect(page.getByTestId('scan-board')).toBeVisible({ timeout: 30_000 });

  await page.getByTestId('cmdk-open').click();
  const input = page.getByTestId('cmdk-input');
  await expect(input).toBeVisible();

  await input.fill('nvid'); // → NVIDIA / NVDA
  const result = page.getByTestId('cmdk-item-ticker-NVDA');
  await expect(result).toBeVisible({ timeout: 10_000 });
  await result.click();

  await expect(page).toHaveURL(/\/analyze\?symbol=NVDA/);
});

test('command palette navigates to a page', async ({ page }) => {
  await page.goto('/leaderboard');
  await page.getByTestId('cmdk-open').click();
  await page.getByTestId('cmdk-item-nav-brokerage').click();
  await expect(page).toHaveURL(/\/brokerage/);
});
