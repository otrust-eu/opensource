/**
 * OTRUST E2E Tests - Homepage
 */
import { test, expect } from '@playwright/test';

test.describe('Homepage', () => {
  test('loads successfully', async ({ page }) => {
    await page.goto('/');

    // Check title
    await expect(page).toHaveTitle(/OTRUST/);

    // Check main elements are visible
    await expect(page.locator('h1')).toBeVisible();
    await expect(page.getByText(/timestamp/i).first()).toBeVisible();
  });

  test('has working navigation', async ({ page }) => {
    await page.goto('/');

    // Check nav links - now includes ID to match 4 core workflows
    const links = ['Timestamp', 'ID', 'Sign', 'Auth'];
    const nav = page.locator('.dashboard-site-nav').first();
    for (const link of links) {
      await expect(nav.getByRole('link', { name: new RegExp(link, 'i') }).first()).toBeVisible();
    }
  });

  test('function menu links to the core workflows', async ({ page }) => {
    await page.goto('/');

    const entries = [
      { label: 'Timestamp', href: '/timestamp' },
      { label: 'ID', href: '/proof' },
      { label: 'Sign', href: '/sign' },
      { label: 'Auth', href: '/sign-in' }
    ];

    await expect(page.locator('.bento-function-card')).toHaveCount(entries.length);
    for (const entry of entries) {
      const card = page.locator(`.bento-function-card[href="${entry.href}"]`);
      await expect(card).toBeVisible();
      await expect(card.getByRole('heading', { name: entry.label, exact: true })).toBeVisible();
    }
  });

  test('timestamp page keeps the drop zone', async ({ page }) => {
    await page.goto('/timestamp');

    // Look for the file drop zone
    const dropZone = page.locator('.dashboard-tool-slot .dropzone:visible, .dashboard-tool-slot .drop-zone:visible, .dashboard-tool-slot .upload-zone:visible').first();
    await expect(dropZone).toBeVisible();
  });

  test('bento index keeps the reference grid composition', async ({ page }) => {
    await page.setViewportSize({ width: 2048, height: 1152 });
    await page.goto('/');

    const grid = page.locator('.bento-grid');
    await expect(grid).toBeVisible();
    await expect(page.getByRole('heading', { name: /Trust,\s*without permission\./i })).toBeVisible();
    await expect(page.locator('.bento-function-card').getByRole('heading', { name: 'Timestamp', exact: true })).toBeVisible();
    await expect(page.locator('.bento-function-card').getByRole('heading', { name: 'ID', exact: true })).toBeVisible();
    await expect(page.locator('.bento-function-card').getByRole('heading', { name: 'Sign', exact: true })).toBeVisible();
    await expect(page.locator('.bento-function-card').getByRole('heading', { name: 'Auth', exact: true })).toBeVisible();

    const layout = await page.evaluate(() => {
      const grid = document.querySelector('.bento-grid');
      const shell = document.querySelector('.otrust-bento').getBoundingClientRect();
      const hero = document.querySelector('.bento-hero').getBoundingClientRect();
      const c01 = document.querySelector('.bento-c01').getBoundingClientRect();
      const c02 = document.querySelector('.bento-c02').getBoundingClientRect();
      const c03 = document.querySelector('.bento-c03').getBoundingClientRect();
      const c04 = document.querySelector('.bento-c04').getBoundingClientRect();
      const c05 = document.querySelector('.bento-c05').getBoundingClientRect();
      const c06 = document.querySelector('.bento-c06').getBoundingClientRect();
      const c07 = document.querySelector('.bento-c07').getBoundingClientRect();
      const stylesheetHref = document.querySelector('link[href*="otrust-redesign.css"]')?.href || '';
      const functionCardDecoration = getComputedStyle(document.querySelector('.bento-function-card')).textDecorationLine;
      return {
        display: getComputedStyle(grid).display,
        shellWidth: shell.width,
        viewportWidth: window.innerWidth,
        stylesheetHref,
        functionCardDecoration,
        heroWiderThanTimestamp: hero.width > c01.width * 2,
        heroTallerThanTimestamp: hero.height > c01.height,
        topCardsAligned: Math.abs(c01.top - c03.top),
        secondRowCardsAligned: Math.abs(c02.top - c04.top),
        bottomCardsAligned: Math.max(Math.abs(c05.top - c06.top), Math.abs(c06.top - c07.top))
      };
    });

    expect(layout.display).toBe('grid');
    expect(layout.shellWidth).toBeGreaterThan(layout.viewportWidth - 20);
    expect(layout.stylesheetHref).toMatch(/otrust-redesign\.css\?v=\d+/);
    expect(layout.stylesheetHref).not.toContain('mono');
    expect(layout.functionCardDecoration).toBe('none');
    expect(layout.heroWiderThanTimestamp).toBe(true);
    expect(layout.heroTallerThanTimestamp).toBe(true);
    expect(layout.topCardsAligned).toBeLessThanOrEqual(1);
    expect(layout.secondRowCardsAligned).toBeLessThanOrEqual(1);
    expect(layout.bottomCardsAligned).toBeLessThanOrEqual(1);
  });
});

test.describe('Public navigation', () => {
  test('keeps the top nav consistent across public pages', async ({ page }) => {
    const routes = ['/', '/sign', '/proof', '/sign-in', '/partners/hemsted', '/docs.html', '/api-docs.html', '/playground/', '/about'];
    const expectedTopNav = ['OTRUST', 'Timestamp', 'ID', 'Sign', 'Auth'];
    const expectedFooterStart = ['Docs', 'API', 'GitHub', 'Privacy', 'Terms'];

    for (const route of routes) {
      await page.goto(route);
      const nav = page.locator('.dashboard-site-nav:visible').first();
      await expect(nav).toBeVisible();
      await expect(nav.getByRole('link', { name: 'Timestamp' })).toBeVisible();
      await expect(nav.getByRole('link', { name: 'ID' })).toBeVisible();
      await expect(nav.getByRole('link', { name: 'Sign' })).toBeVisible();
      await expect(nav.getByRole('link', { name: 'Auth' })).toBeVisible();
      const navLinks = await nav.getByRole('link').evaluateAll((links) =>
        links.map((link) => ({
          label: link.textContent?.replace(/\s+/g, ' ').trim(),
          href: link.getAttribute('href')
        }))
      );
      const labels = navLinks.map((link) => link.label);
      expect(labels).toContain('OTRUST');
      expect(labels).toContain('Timestamp');
      expect(labels).toContain('ID');
      expect(labels).toContain('Sign');
      expect(labels).toContain('Auth');
      const navHrefByLabel = Object.fromEntries(navLinks.map((link) => [link.label, link.href]));
      expect(navHrefByLabel.ID).toMatch(/\/proof$/);
      expect(navHrefByLabel.Auth).toMatch(/\/sign-in$/);

      if (route !== '/playground/') {
        const footer = page.locator('footer').first();
        const footerLabels = await footer.getByRole('link').evaluateAll((links) =>
          links
            .map((link) => link.textContent?.replace(/\s+/g, ' ').trim())
            .filter(Boolean)
        );
        const normalizedFooterLabels = footerLabels[0] === 'OTRUST' ? footerLabels.slice(1) : footerLabels;
        for (const label of expectedFooterStart) {
          expect(normalizedFooterLabels).toContain(label);
        }
      }
    }
  });

  test('auth page explains the auth flow', async ({ page }) => {
    await page.goto('/sign-in');
    await expect(page).toHaveTitle(/OTRUST Auth/);
    await expect(page.getByRole('heading', { name: /Hosted Auth for partners/i })).toBeVisible();
    await expect(page.getByRole('heading', { name: /Create a partner Auth challenge/i })).toBeVisible();
    await expect(page.getByText('/auth/login')).toBeVisible();
    await expect(page.getByRole('link', { name: /Read Auth Docs/i })).toHaveAttribute('href', '/docs#proofauth');
  });

  test('hemsted partner preview explains branded auth flow', async ({ page }) => {
    await page.goto('/partners/hemsted');
    await expect(page).toHaveTitle(/Hemsted OTRUST Auth Flow/);
    await expect(page.getByRole('heading', { name: /Branded Auth handoff/i })).toBeVisible();
    await expect(page.getByRole('heading', { name: /Verify access to Hemsted/i })).toBeVisible();
    await expect(page.getByText('Identity flow secured by OTRUST')).toBeVisible();
    await expect(page.getByText('/proof?auth_challenge=...')).toBeVisible();
  });
});

test.describe('Health Check', () => {
  test('API health endpoint returns OK', async ({ request }) => {
    const response = await request.get('/health');
    expect(response.ok()).toBeTruthy();

    const data = await response.json();
    expect(data.status).toBe('ok');
    expect(data.claims).toBeGreaterThanOrEqual(0);
  });
});

test.describe('Challenge API', () => {
  test('returns valid challenge', async ({ request }) => {
    const response = await request.get('/challenge');
    expect(response.ok()).toBeTruthy();

    const data = await response.json();
    expect(data.challenge).toHaveLength(64);
    expect(data.difficulty).toBeGreaterThanOrEqual(4);
    expect(data.expires).toBeDefined();
  });
});

test.describe('Public response headers', () => {
  test('caches versioned assets without caching HTML', async ({ request }) => {
    const html = await request.get('/');
    expect(html.headers()['cache-control']).toContain('no-store');

    const asset = await request.get('/otrust-redesign.css?v=20260723-03');
    expect(asset.headers()['cache-control']).toBe('public, max-age=31536000, immutable');
  });

  test('only emits CORS origin headers for allowed browser origins', async ({ request }) => {
    const serverClient = await request.get('/api');
    expect(serverClient.headers()['access-control-allow-origin']).toBeUndefined();

    const browserClient = await request.get('/api', {
      headers: { Origin: 'https://www.otrust.eu' }
    });
    expect(browserClient.headers()['access-control-allow-origin']).toBe('https://www.otrust.eu');
    expect(browserClient.headers().vary).toContain('Origin');
  });
});

test.describe('Auth Partner Branding', () => {
  test('renders branded hosted login on mobile without horizontal overflow', async ({ page, request }) => {
    const branding = await request.put('/admin/auth-branding/e2e_partner', {
      headers: { 'X-Admin-Key': 'test-admin-key' },
      data: {
        backgroundColor: '#FAFAF7',
        primaryColor: '#0F1B2D',
        textColor: '#0F1B2D',
        fontFamily: 'Inter',
        borderRadius: 8,
        spacingScale: 'default',
        headline: 'Logga in pa E2E Partner',
        subhead: 'Secure hosted login with OTRUST',
        footerText: 'E2E Partner with OTRUST as identity provider',
        infoBlurb: 'Partner theme is applied from the saved client configuration.',
        autoRedirectSeconds: 3
      }
    });
    expect(branding.ok()).toBeTruthy();

    const challenge = await request.post('/api/v1/auth/challenge', {
      data: {
        clientId: 'e2e_partner',
        redirectUri: 'https://example.com/callback',
        scope: ['identity', 'profile'],
        state: 'e2e-state'
      }
    });
    expect(challenge.ok()).toBeTruthy();
    const challengeBody = await challenge.json();

    await page.setViewportSize({ width: 360, height: 740 });
    await page.goto(`/auth/login?challenge=${challengeBody.challengeId}`);

    await expect(page.getByRole('heading', { name: /Hosted Auth/i })).toBeVisible();
    await expect(page.getByText('e2e_partner')).toBeVisible();
    await expect(page.getByText('dpo@otrust.eu')).toBeVisible();
    await expect(page.getByText('Identity verification')).toBeVisible();
    await expect(page.getByText('Profile access')).toBeVisible();
    await expect(page.locator('#createProofLink')).toHaveAttribute('href', `/proof?auth_challenge=${challengeBody.challengeId}`);

    let overflow = await page.evaluate(() =>
      Math.max(document.documentElement.scrollWidth, document.body.scrollWidth) - document.documentElement.clientWidth
    );
    expect(overflow).toBeLessThanOrEqual(2);

    await page.goto(`/proof?auth_challenge=${challengeBody.challengeId}`);

    await expect(page.getByRole('heading', { name: /Create your ID for e2e_partner/i })).toBeVisible();
    await expect(page.getByText('Secure identity setup via OTRUST')).toBeVisible();
    await expect(page.getByText('dpo@otrust.eu')).toBeVisible();
    await expect(page.getByText(/Create a privacy-preserving ID package/i)).toBeVisible();
    await expect(page.locator('#tab-button-create')).toContainText('Create ID');

    overflow = await page.evaluate(() =>
      Math.max(document.documentElement.scrollWidth, document.body.scrollWidth) - document.documentElement.clientWidth
    );
    expect(overflow).toBeLessThanOrEqual(2);

    await page.goto(`/auth/login?challenge=${challengeBody.challengeId}&proof_id=id_prefilled123`);
    await expect(page.locator('#proofId')).toHaveValue('id_prefilled123');
  });
});

test.describe('Verify Page', () => {
  test('verify page loads', async ({ page }) => {
    await page.goto('/');

    // Navigate to ID verification
    await page.getByRole('link', { name: 'ID' }).first().click();

    // Should show verify section or input
    await expect(page.getByText(/verify/i).first()).toBeVisible();
  });
});

test.describe('Mobile Responsive', () => {
  test('uses an accessible mobile menu for the core workflows', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto('/timestamp');

    const menu = page.getByRole('button', { name: 'Open navigation menu' });
    await expect(menu).toBeVisible();
    await expect(menu).toHaveCSS('width', '44px');
    await expect(menu).toHaveCSS('height', '44px');

    await menu.click();
    const mobilePanel = page.locator('.dashboard-mobile-panel:visible');
    await expect(mobilePanel).toBeVisible();
    await expect(mobilePanel.getByRole('link', { name: 'Timestamp' })).toBeVisible();
    await expect(mobilePanel.getByRole('link', { name: 'ID' })).toBeVisible();
    await expect(mobilePanel.getByRole('link', { name: 'Sign' })).toBeVisible();
    await expect(mobilePanel.getByRole('link', { name: 'Auth' })).toBeVisible();

    const panelBox = await mobilePanel.boundingBox();
    expect(panelBox).not.toBeNull();
    expect(panelBox.y).toBeGreaterThanOrEqual(0);
    expect(panelBox.y + panelBox.height).toBeLessThanOrEqual(844);
    expect(panelBox.x + panelBox.width).toBeLessThanOrEqual(390);

    const linkHeights = await mobilePanel.getByRole('link').evaluateAll((links) =>
      links.map((link) => link.getBoundingClientRect().height)
    );
    expect(linkHeights.every((height) => height >= 44)).toBe(true);
  });

  test('public pages fit narrow mobile viewports', async ({ page }) => {
    const routes = ['/', '/sign', '/proof', '/sign-in', '/partners/hemsted', '/docs', '/api-docs', '/about', '/privacy-policy', '/terms', '/playground/'];

    for (const viewport of [{ width: 360, height: 740 }, { width: 390, height: 844 }]) {
      await page.setViewportSize(viewport);

      for (const route of routes) {
        await page.goto(route);

        await expect(page.locator('main, .app-main, #main-content, #root').first()).toBeVisible();
        const overflow = await page.evaluate(() =>
          Math.max(document.documentElement.scrollWidth, document.body.scrollWidth) - document.documentElement.clientWidth
        );
        expect(overflow, `${route} should not create horizontal page scroll at ${viewport.width}px`).toBeLessThanOrEqual(2);
      }
    }
  });
});
