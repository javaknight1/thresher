import { test, expect } from '@playwright/test';

/**
 * Follow flow (keyless e2e → identity is the request IP, MemoryFollowStore).
 * Follow MOCKLONG from the Analyze page, see it on the board's Following tab
 * and in the dashboard manager, then unfollow (also restores a clean state for
 * the rest of the run, since the in-memory store is shared per dev server).
 */
test('follow a symbol, see it under Following + dashboard, then unfollow', async ({ page }) => {
  await page.goto('/analyze?symbol=MOCKLONG&timeframe=swing');

  const btn = page.getByTestId('follow-MOCKLONG');
  await expect(btn).toBeVisible({ timeout: 30_000 });

  // Normalize to "not following" first (in case a prior case left state).
  if ((await btn.getAttribute('aria-pressed')) === 'true') {
    await btn.click();
    await expect(btn).toHaveAttribute('aria-pressed', 'false');
  }

  await btn.click();
  await expect(btn).toHaveAttribute('aria-pressed', 'true');

  // The Following board tab shows the followed setup.
  await page.goto('/app?tab=following');
  await expect(page.getByTestId('scan-tab-following')).toHaveAttribute('aria-pressed', 'true');
  await expect(page.getByTestId('scan-row-MOCKLONG')).toBeVisible({ timeout: 30_000 });

  // The dashboard manager lists it, and unfollow removes it.
  await page.goto('/dashboard');
  await expect(page.getByTestId('following-manager')).toBeVisible();
  await expect(page.getByTestId('following-MOCKLONG')).toBeVisible();
  await page.getByTestId('unfollow-MOCKLONG').click();
  await expect(page.getByTestId('following-MOCKLONG')).toHaveCount(0);
});
