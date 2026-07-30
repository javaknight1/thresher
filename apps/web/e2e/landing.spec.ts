import { test, expect } from '@playwright/test';

/**
 * Landing page smoke (M2). Runs keyless (no Clerk configured in e2e), so the
 * CTA opens the board directly rather than routing through sign-up.
 */
test('landing page shows and links into the board', async ({ page }) => {
  await page.goto('/');
  await expect(page.getByTestId('hero-cta')).toBeVisible({ timeout: 30_000 });

  await page.getByTestId('hero-cta').click();
  await expect(page).toHaveURL(/\/app/);
  await expect(page.getByTestId('scan-board')).toBeVisible({ timeout: 30_000 });
});
