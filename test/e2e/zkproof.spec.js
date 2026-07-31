import { test, expect } from '@playwright/test';

test.describe('Browser ZK proof pipeline', () => {
  test('generates, submits, and verifies an age proof without sending private input', async ({
    page
  }) => {
    test.setTimeout(60000);
    let submittedBody;
    await page.route('**/api/proof/submit', async route => {
      submittedBody = route.request().postDataJSON();
      await route.continue();
    });
    await page.goto('/proof.html');
    await page.waitForFunction(
      () => window.ZKProof?.isLoaded() === true,
      undefined,
      { timeout: 30000 }
    );

    await expect(page.getByRole('heading', { name: 'Generate a private range proof.' })).toBeVisible();
    await page.locator('#zk-birth-date').fill('1990-05-15');
    await page.locator('#zk-min-age').fill('18');
    await page.getByRole('button', { name: 'Generate locally' }).click();
    await expect(page.locator('#zk-status')).toHaveText('Proof verified locally', {
      timeout: 30000
    });
    await expect(page.locator('#zk-result')).toContainText('self-attested');

    await page.getByRole('button', { name: 'Publish proof' }).click();
    const proofLink = page.locator('#zk-result a');
    await expect(proofLink).toBeVisible();
    const proofId = (await proofLink.textContent()).trim();

    const verification = await page.evaluate(async id => {
      const verifyResponse = await fetch(`/api/proof/${id}/verify`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: '{}'
      });
      return verifyResponse.json();
    }, proofId);

    expect(proofId).toMatch(/^prf_/);
    expect(verification.valid).toBe(true);
    expect(Object.keys(submittedBody).sort()).toEqual([
      'commitment',
      'proof',
      'proofType',
      'publicSignals',
      'version'
    ]);
    expect(JSON.stringify(submittedBody)).not.toContain('1990-05-15');
    expect(submittedBody.publicSignals).toHaveLength(6);
    expect(submittedBody.commitment).toBe(submittedBody.publicSignals[5]);
  });
});
