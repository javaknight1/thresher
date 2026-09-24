import { test, expect } from '@playwright/test';

/**
 * The dedicated crypto section: the Crypto nav tab opens the /crypto board
 * (scoped ScanApp). Runs on the mock provider, whose curated coins power the
 * board.
 */
test('crypto nav tab opens the /crypto board', async ({ page }) => {
  await page.goto('/leaderboard');
  await expect(page.getByTestId('nav-crypto')).toBeVisible({ timeout: 30_000 });

  await page.getByTestId('nav-crypto').click();
  await expect(page).toHaveURL(/\/crypto/);
  await expect(page.getByRole('heading', { name: 'Top coins' })).toBeVisible({ timeout: 30_000 });
  // The board machinery renders (tabs present); no "market closed" hint for 24/7 crypto.
  await expect(page.getByTestId('scan-tab-top')).toBeVisible();
  await expect(page.getByTestId('market-closed')).toHaveCount(0);
});
