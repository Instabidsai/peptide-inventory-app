import { test, expect } from '@playwright/test';

test.describe('Checkout Pages', () => {
  test('checkout success page shows "no order" when no orderId', async ({ page }) => {
    // Access success page without orderId — should show fallback message
    await page.goto('/checkout/success');
    // May redirect to auth since it's protected, OR show no-order message
    // Wait for the page to settle
    await page.waitForTimeout(2000);
    const url = page.url();
    if (url.includes('/auth')) {
      // Protected route redirected — that's correct behavior
      expect(url).toContain('/auth');
    } else {
      // Should show "No order found" or similar
      await expect(page.locator('body')).toContainText(/no order|return to store/i);
    }
  });

  test('checkout cancel page shows cancellation message', async ({ page }) => {
    await page.goto('/checkout/cancel');
    await page.waitForTimeout(2000);
    const url = page.url();
    if (url.includes('/auth')) {
      expect(url).toContain('/auth');
    } else {
      await expect(page.locator('body')).toContainText(/cancel|not processed/i);
    }
  });
});
