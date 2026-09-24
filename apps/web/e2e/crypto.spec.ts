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

test('the /crypto board has a coin search that opens the Analyze view', async ({ page }) => {
  await page.goto('/crypto');
  const input = page.getByTestId('crypto-board-search-input');
  await expect(input).toBeVisible({ timeout: 30_000 });

  await input.fill('BTC');
  const result = page.getByTestId('search-result-BTC-USD');
  await expect(result).toBeVisible({ timeout: 10_000 });
  // The coin logo resolves to CoinCap's keyless icon set (falls back to a
  // monogram only if that 404s), so the row renders a real coin logo.
  await expect(result.locator('img')).toHaveAttribute(
    'src',
    /assets\.coincap\.io\/assets\/icons\/btc/,
  );
  await result.click();

  await expect(page).toHaveURL(/\/analyze\?symbol=BTC-USD/);
  await expect(page.getByTestId('crypto-panel')).toBeVisible({ timeout: 30_000 });
});

test('analyzing a coin shows the crypto panel and fractional sizing, no fundamentals', async ({
  page,
}) => {
  await page.goto('/analyze?symbol=BTC-USD&timeframe=swing');

  // Crypto context panel replaces the equity company/fundamentals panel.
  await expect(page.getByTestId('crypto-panel')).toBeVisible({ timeout: 30_000 });
  await expect(page.getByTestId('company-panel')).toHaveCount(0);

  // The sizer is present; once sized it labels fractional units, not shares.
  const sizer = page.getByTestId('position-sizer');
  await expect(sizer).toBeVisible();
  await sizer.getByTestId('ps-account').fill('100000');
  await expect(sizer.getByTestId('ps-result')).toBeVisible();
  await expect(sizer.getByText('units')).toBeVisible();
});
