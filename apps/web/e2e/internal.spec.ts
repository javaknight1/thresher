import { test, expect } from '@playwright/test';

/** The hidden /internal ops console: sectioned nav + each section renders (keyless → reachable). */
test('internal console: side nav moves between sections', async ({ page }) => {
  await page.goto('/internal');
  await expect(page.getByTestId('internal-page')).toBeVisible({ timeout: 30_000 });
  await expect(page.getByRole('heading', { name: 'Overview' })).toBeVisible();
  await expect(page.getByTestId('internal-status')).toBeVisible();

  await page.getByTestId('internal-nav-data').click();
  await expect(page.getByRole('heading', { name: 'Data browser' })).toBeVisible();

  await page.getByTestId('internal-nav-integrity').click();
  await expect(page.getByRole('heading', { name: 'Integrity' })).toBeVisible();

  await page.getByTestId('internal-nav-maintenance').click();
  await expect(page.getByRole('heading', { name: 'Maintenance' })).toBeVisible();
  await expect(page.getByTestId('action-scan')).toBeVisible();
});
