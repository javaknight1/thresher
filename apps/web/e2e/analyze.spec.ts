import { test, expect, type Page } from '@playwright/test';

/**
 * Smoke tests for the Analyze page (TODO M1):
 *   1. liquid symbol → full trade plan
 *   2. refusal case  → no-trade panel, families still rendered (design §6.2)
 *   3. unknown symbol → error banner
 *
 * Runs against the dev server with THRESHER_PROVIDER=mock (see playwright.config.ts).
 */

const FAMILY_KEYS = ['trend', 'momentum', 'volume', 'structure'] as const;
const STAT_TILES = ['stat-entry', 'stat-stop', 'stat-target', 'stat-ev'] as const;

/** Fill the ticker, select the swing timeframe, and submit. */
async function analyze(page: Page, symbol: string): Promise<void> {
  await page.goto('/');
  await page.getByTestId('ticker-input').fill(symbol);
  await page.getByTestId('tf-swing').click();
  await page.getByTestId('analyze-button').click();
}

test.describe('analyze smoke', () => {
  test('liquid symbol renders a full trade plan', async ({ page }) => {
    await analyze(page, 'MOCKLONG');

    // First analyze pays the dev-server cold-compile cost — extra-generous here.
    const badge = page.getByTestId('direction-badge');
    await expect(badge).toBeVisible({ timeout: 30_000 });
    await expect(badge).toContainText(/long/i);

    await expect(page.getByTestId('trade-ladder')).toBeVisible();
    for (const tile of STAT_TILES) {
      await expect(page.getByTestId(tile)).toBeVisible();
    }

    await expect(page.getByTestId('disclaimer')).toBeVisible();

    await expect(page.getByTestId('family-grid')).toBeVisible();
    for (const key of FAMILY_KEYS) {
      await expect(page.getByTestId(`family-card-${key}`)).toBeVisible();
    }

    await expect(page.getByTestId('price-chart')).toBeVisible();
    await expect(page.getByTestId('freshness')).toBeVisible();

    // Company context panel loads independently of the trade plan.
    const company = page.getByTestId('company-panel');
    await expect(company).toBeVisible({ timeout: 15_000 });
    await expect(company).toContainText(/MOCKLONG/);
  });

  test('choppy symbol renders a refusal, families still shown', async ({ page }) => {
    await analyze(page, 'MOCKCHOP');

    const badge = page.getByTestId('direction-badge');
    await expect(badge).toBeVisible({ timeout: 30_000 });
    await expect(badge).toContainText(/no[\s-]?trade|refus/i);

    // Refusal panel names the failed gate (G1–G5).
    const noTrade = page.getByTestId('no-trade');
    await expect(noTrade).toBeVisible();
    await expect(noTrade).toContainText(/G[1-5]/);

    // §6.2: the family breakdown renders even on refusal.
    await expect(page.getByTestId('family-grid')).toBeVisible();
    for (const key of FAMILY_KEYS) {
      await expect(page.getByTestId(`family-card-${key}`)).toBeVisible();
    }

    await expect(page.getByTestId('disclaimer')).toBeVisible();

    // No trade-ladder gauge on refusal: the levels-readout variant renders
    // instead, so the four stat tiles must be absent.
    for (const tile of STAT_TILES) {
      await expect(page.getByTestId(tile)).toHaveCount(0);
    }
  });

  test('unknown symbol shows an error banner', async ({ page }) => {
    await analyze(page, 'MOCKUNKNOWN');

    const banner = page.getByTestId('error-banner');
    await expect(banner).toBeVisible({ timeout: 30_000 });
    await expect(banner).toContainText(/unknown/i);

    await expect(page.getByTestId('direction-badge')).toHaveCount(0);
  });
});
