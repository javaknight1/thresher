import { test, expect } from '@playwright/test';

/**
 * The "analyze as of a past time" control (point-in-time replay). Runs on the
 * mock provider, whose deterministic series spans 2024, so 2024-10-01 is a valid
 * past instant with enough history.
 */
test('as-of: replay a past instant shows the historical banner, then back to live', async ({
  page,
}) => {
  await page.goto('/analyze?symbol=MOCKLONG&timeframe=swing');
  await expect(page.getByTestId('asof-open')).toBeVisible({ timeout: 30_000 });

  // Open the picker, choose a past date inside the mock window, apply.
  await page.getByTestId('asof-open').click();
  await page.getByTestId('asof-input').fill('2024-10-01T00:00');
  await page.getByTestId('asof-apply').click();

  // Historical banner + active as-of badge + URL param.
  await expect(
    page.locator('[data-testid="data-alert"][data-variant="historical"]'),
  ).toBeVisible({ timeout: 30_000 });
  await expect(page.getByTestId('asof-active')).toBeVisible();
  await expect(page).toHaveURL(/asOf=/);

  // "back to live" clears the replay.
  await page.getByTestId('asof-clear').click();
  await expect(
    page.locator('[data-testid="data-alert"][data-variant="historical"]'),
  ).toHaveCount(0, { timeout: 30_000 });
  await expect(page).not.toHaveURL(/asOf=/);
});
