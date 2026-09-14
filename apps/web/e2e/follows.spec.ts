import { test, expect } from '@playwright/test';

/**
 * Follow flows (keyless e2e → identity is the request IP, MemoryFollowStore,
 * shared per dev server). Each test cleans up the symbols it follows.
 */

test('follow from Analyze, see it under Following + the dashboard watchlist, then unfollow', async ({
  page,
}) => {
  await page.goto('/analyze?symbol=MOCKLONG&timeframe=swing');

  // Follow button lives top-right of the analysis header.
  const btn = page.getByTestId('follow-MOCKLONG');
  await expect(btn).toBeVisible({ timeout: 30_000 });
  if ((await btn.getAttribute('aria-pressed')) === 'true') {
    await btn.click();
    await expect(btn).toHaveAttribute('aria-pressed', 'false');
  }
  await btn.click();
  await expect(btn).toHaveAttribute('aria-pressed', 'true');

  // Following board tab.
  await page.goto('/leaderboard?tab=following');
  await expect(page.getByTestId('scan-row-MOCKLONG')).toBeVisible({ timeout: 30_000 });

  // Dashboard watchlist (leaderboard-style list) + unfollow.
  await page.goto('/dashboard');
  await expect(page.getByTestId('dashboard-follows')).toBeVisible();
  await expect(page.getByTestId('followed-row-MOCKLONG')).toBeVisible({ timeout: 30_000 });
  // The exact trade shows on the line (MOCKLONG emits a LONG on Daily).
  await expect(page.getByTestId('trade-MOCKLONG')).toContainText('Entry', { timeout: 30_000 });
  await page.getByTestId('followed-unfollow-MOCKLONG').click();
  await expect(page.getByTestId('followed-row-MOCKLONG')).toHaveCount(0);
});

test('dashboard autocomplete: typing a name finds the ticker and follows it', async ({ page }) => {
  await page.goto('/dashboard');
  const input = page.getByTestId('symbol-search-input');
  await expect(input).toBeVisible();

  await input.fill('nvid'); // → NVIDIA / NVDA
  const result = page.getByTestId('search-result-NVDA');
  await expect(result).toBeVisible({ timeout: 10_000 });
  await expect(result).toContainText('NVIDIA');

  await result.click();
  // Now followed → appears in the watchlist list with a price snapshot.
  await expect(page.getByTestId('followed-row-NVDA')).toBeVisible({ timeout: 10_000 });

  // Clean up.
  await page.getByTestId('followed-unfollow-NVDA').click();
  await expect(page.getByTestId('followed-row-NVDA')).toHaveCount(0);
});
