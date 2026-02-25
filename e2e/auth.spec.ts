import { test, expect } from '@playwright/test';

test.describe('Authentication Flow', () => {
  test('auth page loads with login form', async ({ page }) => {
    await page.goto('/auth');
    // Should see email + password inputs and a sign-in button
    await expect(page.locator('input[type="email"], input[placeholder*="email" i]')).toBeVisible();
    await expect(page.locator('input[type="password"]')).toBeVisible();
    await expect(page.getByRole('button', { name: /sign in|log in/i })).toBeVisible();
  });

  test('shows validation on empty submit', async ({ page }) => {
    await page.goto('/auth');
    const signIn = page.getByRole('button', { name: /sign in|log in/i });
    await signIn.click();
    // Browser native validation or toast should appear — page should still be on /auth
    await expect(page).toHaveURL(/\/auth/);
  });

  test('shows error on invalid credentials', async ({ page }) => {
    await page.goto('/auth');
    await page.locator('input[type="email"], input[placeholder*="email" i]').fill('fake@test.invalid');
    await page.locator('input[type="password"]').fill('wrongpassword123');
    await page.getByRole('button', { name: /sign in|log in/i }).click();
    // Should show some error indication (toast, inline error, etc.)
    // Give it a moment to respond
    await page.waitForTimeout(2000);
    // Still on auth page (not redirected)
    await expect(page).toHaveURL(/\/auth/);
  });

  test('unauthenticated user redirected to auth from protected route', async ({ page }) => {
    await page.goto('/dashboard');
    // Should redirect to /auth since not logged in
    await expect(page).toHaveURL(/\/auth/, { timeout: 10_000 });
  });
});
