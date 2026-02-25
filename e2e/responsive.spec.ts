import { test, expect, devices } from '@playwright/test';

test.describe('Mobile Responsive', () => {
  test.use({ ...devices['iPhone 13'] });

  test('auth page is usable on mobile', async ({ page }) => {
    await page.goto('/auth');
    // Inputs should be visible and tappable on mobile viewport
    const emailInput = page.locator('input[type="email"], input[placeholder*="email" i]');
    await expect(emailInput).toBeVisible();
    // Check it's not clipped off-screen
    const box = await emailInput.boundingBox();
    expect(box).not.toBeNull();
    if (box) {
      expect(box.x).toBeGreaterThanOrEqual(0);
      expect(box.width).toBeGreaterThan(100); // Should be reasonably wide
    }
  });

  test('landing page does not horizontally overflow on mobile', async ({ page }) => {
    await page.goto('/');
    await page.waitForTimeout(1000);
    const bodyWidth = await page.evaluate(() => document.body.scrollWidth);
    const viewportWidth = await page.evaluate(() => window.innerWidth);
    // Body should not exceed viewport by more than a tiny margin
    expect(bodyWidth).toBeLessThanOrEqual(viewportWidth + 5);
  });
});
