/**
 * E2E — feature pack (badges, status, docs pages)
 */
import { test, expect } from '@playwright/test';

test.describe('Feature pack APIs', () => {
  test('stats badges endpoint', async ({ request }) => {
    const res = await request.get('/stats/badges.json');
    expect(res.ok()).toBeTruthy();
    const data = await res.json();
    expect(data.service).toBe('OTRUST');
    expect(typeof data.anchored_records).toBe('number');
  });

  test('status.json endpoint', async ({ request }) => {
    const res = await request.get('/status.json');
    expect(res.ok()).toBeTruthy();
    const data = await res.json();
    expect(['operational', 'degraded']).toContain(data.status);
    expect(data.services?.api).toBeDefined();
  });

  test('receipts by pubkey returns 410', async ({ request }) => {
    const res = await request.get('/receipts/' + 'a'.repeat(64));
    expect(res.status()).toBe(410);
    const data = await res.json();
    expect(data.error).toBe('local_history_only');
  });
});

test.describe('Feature pack pages', () => {
  test('status page loads', async ({ page }) => {
    await page.goto('/status');
    await expect(page.getByRole('heading', { name: /OTRUST Status/i })).toBeVisible();
  });

  test('embed page loads', async ({ page }) => {
    await page.goto('/embed');
    await expect(page.getByRole('heading', { name: /Embeddable trust badge/i })).toBeVisible();
  });

  test('bookmarklet page loads', async ({ page }) => {
    await page.goto('/bookmarklet');
    await expect(page.getByRole('heading', { name: /Verify this page/i })).toBeVisible();
  });

  test('webhook test page loads', async ({ page }) => {
    await page.goto('/webhook-test');
    await expect(page.getByRole('heading', { name: /Webhook signature tester/i })).toBeVisible();
  });

  test('stats wall loads', async ({ page }) => {
    await page.goto('/stats.html');
    await expect(page.getByRole('heading', { name: /OTRUST Live Stats/i })).toBeVisible();
  });

  test('merkle viewer loads', async ({ page }) => {
    await page.goto('/merkle.html');
    await expect(page.getByRole('heading', { name: /Merkle path viewer/i })).toBeVisible();
  });

  test('partner builder loads', async ({ page }) => {
    await page.goto('/partner-builder.html');
    await expect(page.getByRole('heading', { name: /Partner theme builder/i })).toBeVisible();
  });

  test('published changelog includes the SQLite release', async ({ page }) => {
    await page.goto('/changelog');
    await expect(page.getByRole('heading', { name: /Persistent SQLite storage/i })).toBeVisible();
    await expect(page.getByText(/1,425 records across 19 collections/i)).toBeVisible();
  });

  test('self-host docs include storage and migration guidance', async ({ page }) => {
    await page.goto('/docs#selfhost');
    await expect(page.getByRole('heading', { name: /Persistent Storage/i })).toBeVisible();
    await expect(page.getByText('OTRUST_DB_PATH', { exact: true }).first()).toBeVisible();
    await expect(page.getByRole('heading', { name: /Migrate from MongoDB/i })).toBeVisible();
  });
});
