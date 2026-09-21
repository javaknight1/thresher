import { test, expect } from '@playwright/test';

/** The hidden /internal cached-data inspector renders (keyless → reachable). */
test('internal cached-data page renders its sections', async ({ page }) => {
  await page.goto('/internal');
  await expect(page.getByTestId('internal-page')).toBeVisible({ timeout: 30_000 });
  await expect(page.getByRole('heading', { name: 'Cached data' })).toBeVisible();
  await expect(
    page.getByRole('heading', { name: /Point-in-time earnings observations/ }),
  ).toBeVisible();
  await expect(page.getByRole('heading', { name: /Cached bars/ })).toBeVisible();
});
