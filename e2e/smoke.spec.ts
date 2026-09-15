import { expect, test } from '@playwright/test';

/**
 * End-to-end smoke tests.
 *
 * Scoped to what unit tests structurally cannot cover: that the app boots, that
 * an unauthenticated visitor lands on sign-in, and that the artifacts Google
 * Play checks for are actually served by the running server with the right
 * content type. The OTP flow itself is not exercised here — it needs a real SMS
 * gateway, and mocking it end-to-end would only test the mock.
 */

test.describe('installability', () => {
  test('serves a manifest that meets Play criteria', async ({ request }) => {
    const response = await request.get('/manifest.json');
    expect(response.status()).toBe(200);
    expect(response.headers()['content-type']).toContain('manifest+json');

    const manifest = await response.json();
    expect(manifest.display).toBe('standalone');
    expect(manifest.start_url).toBeTruthy();
    expect(manifest.icons.some((icon: { sizes: string }) => icon.sizes === '512x512')).toBe(true);
    expect(manifest.icons.some((icon: { purpose?: string }) => icon.purpose === 'maskable')).toBe(
      true,
    );
  });

  test('serves the service worker uncached', async ({ request }) => {
    const response = await request.get('/sw.js');

    expect(response.status()).toBe(200);
    expect(response.headers()['content-type']).toContain('javascript');
    // A cached service worker cannot ship its own replacement.
    expect(response.headers()['cache-control']).toContain('no-cache');
  });

  test('serves Digital Asset Links as JSON', async ({ request }) => {
    const response = await request.get('/.well-known/assetlinks.json');

    expect(response.status()).toBe(200);
    expect(response.headers()['content-type']).toContain('application/json');

    const statements = await response.json();
    expect(Array.isArray(statements)).toBe(true);
    expect(statements[0].target.namespace).toBe('android_app');
  });
});

test.describe('sign-in', () => {
  test('sends an anonymous visitor to the phone form', async ({ page }) => {
    await page.goto('/');
    await expect(page).toHaveURL(/\/login$/);
    await expect(page.getByRole('heading', { name: 'کایزن' })).toBeVisible();
  });

  test('renders right-to-left in Persian', async ({ page }) => {
    await page.goto('/login');

    const html = page.locator('html');
    await expect(html).toHaveAttribute('dir', 'rtl');
    await expect(html).toHaveAttribute('lang', 'fa');
  });

  test('refuses an invalid phone number before any request is made', async ({ page }) => {
    await page.goto('/login');

    await page.getByLabel('شمارهٔ موبایل').fill('0211234');
    await expect(page.getByRole('button', { name: /ارسال کد تأیید/ })).toBeDisabled();
  });

  test('accepts a Persian-digit phone number', async ({ page }) => {
    await page.goto('/login');

    await page.getByLabel('شمارهٔ موبایل').fill('۰۹۱۲۳۴۵۶۷۸۹');
    await expect(page.getByRole('button', { name: /ارسال کد تأیید/ })).toBeEnabled();
  });
});

test.describe('offline', () => {
  test('the offline fallback page is reachable', async ({ page }) => {
    await page.goto('/offline');
    await expect(page.getByRole('heading', { name: /آفلاین/ })).toBeVisible();
  });
});
