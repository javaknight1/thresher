import { test, expect } from '@playwright/test';

/**
 * /settings — preferences (display/convenience only). Runs keyless, so the
 * protected route is reachable and prefs persist to localStorage.
 */
test('settings: theme toggle flips data-theme and persists across reload', async ({ page }) => {
  await page.goto('/settings');
  await expect(page.getByTestId('settings-page')).toBeVisible({ timeout: 30_000 });

  const html = page.locator('html');

  await page.getByTestId('set-theme-light').click();
  await expect(html).toHaveAttribute('data-theme', 'light');

  await page.getByTestId('set-theme-dark').click();
  await expect(html).toHaveAttribute('data-theme', 'dark');

  // Persisted (localStorage) → applied before paint on reload.
  await page.reload();
  await expect(html).toHaveAttribute('data-theme', 'dark');
});

test('settings: default timeframe pref selects the pill on a fresh Analyze visit', async ({
  page,
}) => {
  await page.goto('/settings');
  await expect(page.getByTestId('settings-page')).toBeVisible({ timeout: 30_000 });

  // Choose Weekly (position) as the default timeframe.
  await page.getByTestId('set-timeframe-position').click();

  // A fresh /analyze (no ?timeframe=) should open on Weekly (position).
  await page.goto('/analyze');
  await expect(page.getByTestId('tf-position')).toBeVisible({ timeout: 30_000 });
  await expect(page.getByTestId('tf-position')).toHaveAttribute('aria-pressed', 'true');
});
