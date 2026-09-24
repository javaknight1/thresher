import { test, expect } from '@playwright/test';

/**
 * The Leaderboard is the combined board (stocks + crypto merged), and the new
 * Stocks tab is the equity-only board. Runs on the mock provider.
 */

// Which scan scopes a page fetched (equity = no scope param, crypto = scope=crypto).
function trackScopes(page: import('@playwright/test').Page): Set<string> {
  const scopes = new Set<string>();
  page.on('request', (req) => {
    const u = req.url();
    if (u.includes('/api/v1/scan?')) scopes.add(u.includes('scope=crypto') ? 'crypto' : 'equity');
  });
  return scopes;
}

test('leaderboard combines stocks and crypto — fetches both scopes', async ({ page }) => {
  const scopes = trackScopes(page);
  await page.goto('/leaderboard');
  await expect(page.getByRole('heading', { name: 'Top setups' })).toBeVisible({ timeout: 30_000 });
  await expect(page.getByTestId('scan-tab-top')).toBeVisible();
  // The combined board reads both per-scope boards.
  await expect.poll(() => [...scopes].sort().join(','), { timeout: 15_000 }).toBe('crypto,equity');
});

test('the Stocks nav tab opens the equity-only board', async ({ page }) => {
  await page.goto('/leaderboard');
  await expect(page.getByTestId('nav-stocks')).toBeVisible({ timeout: 30_000 });

  await page.getByTestId('nav-stocks').click();
  await expect(page).toHaveURL(/\/stocks/);
  await expect(page.getByRole('heading', { name: 'Top stocks' })).toBeVisible({ timeout: 30_000 });
});

test('the Stocks board fetches only the equity scope', async ({ page }) => {
  const scopes = trackScopes(page);
  await page.goto('/stocks');
  await expect(page.getByRole('heading', { name: 'Top stocks' })).toBeVisible({ timeout: 30_000 });
  await expect(page.getByTestId('scan-tab-top')).toBeVisible();
  // Equity board never asks for the crypto scope.
  await expect.poll(() => [...scopes].join(','), { timeout: 15_000 }).toBe('equity');
});
