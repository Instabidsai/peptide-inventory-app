import { test, expect } from '@playwright/test';

test.describe('Public Page Navigation', () => {
  test('landing page loads', async ({ page }) => {
    await page.goto('/');
    // App should load without crashing — check for any visible content
    await expect(page.locator('body')).not.toBeEmpty();
    // No uncaught errors in console
    const errors: string[] = [];
    page.on('pageerror', (err) => errors.push(err.message));
    await page.waitForTimeout(1000);
    expect(errors).toHaveLength(0);
  });

  test('update-password page loads', async ({ page }) => {
    await page.goto('/update-password');
    // Should show the password reset page (may show error if no token)
    await expect(page.locator('body')).not.toBeEmpty();
  });

  test('404 / unknown route does not crash', async ({ page }) => {
    await page.goto('/this-route-does-not-exist-12345');
    // App should handle gracefully — either redirect to auth or show 404
    await expect(page.locator('body')).not.toBeEmpty();
  });
});
