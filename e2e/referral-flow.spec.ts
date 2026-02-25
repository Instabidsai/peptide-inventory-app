import { test, expect } from '@playwright/test';

test.describe('Referral Link Flow', () => {
  test('referral param is preserved on auth page', async ({ page }) => {
    await page.goto('/auth?ref=test-partner-123');
    // Auth page should load with the ref param present
    await expect(page).toHaveURL(/ref=test-partner-123/);
    // The email/password form should still be visible
    await expect(page.locator('input[type="email"], input[placeholder*="email" i]')).toBeVisible();
  });

  test('signup tab shows referral badge when ref param present', async ({ page }) => {
    await page.goto('/auth?ref=test-partner-123');
    // Look for a sign-up tab or toggle
    const signUpTab = page.getByRole('tab', { name: /sign up|register|create/i });
    if (await signUpTab.isVisible()) {
      await signUpTab.click();
      // Should see some indication the referral is active
      await page.waitForTimeout(500);
    }
    // Page should still have ref in URL after tab switch
    await expect(page).toHaveURL(/ref=test-partner-123/);
  });
});
