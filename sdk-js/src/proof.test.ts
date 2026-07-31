import { afterEach, describe, expect, it, vi } from 'vitest';
import { configure, proof } from './index.js';
import {
  age as directAge,
  emailBackup as directEmailBackup,
  identity as directIdentity,
  income as directIncome,
  membership as directMembership,
  revoke as directRevoke,
} from './proof.js';

describe('proof service', () => {
  afterEach(() => {
    configure({ baseUrl: 'https://www.otrust.eu' });
    vi.restoreAllMocks();
  });

  it('retires self-attested identity issuance before processing documents or faces', async () => {
    const result = await proof.identity({
      personnummer: '19900101-1234',
      birthDate: '1990-01-01',
      pin: '123456',
    });

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.code).toBe('trusted_identity_issuer_required');
    }
  });

  it('requires local browser generation for age and income proofs', async () => {
    const [ageResult, incomeResult] = await Promise.all([
      proof.age({ birthDate: '1990-01-01', minAge: 18 }),
      proof.income({ income: 50000, minIncome: 30000, maxIncome: 100000 }),
    ]);

    expect(ageResult.ok).toBe(false);
    expect(incomeResult.ok).toBe(false);
    if (!ageResult.ok) expect(ageResult.error.code).toBe('browser_proof_required');
    if (!incomeResult.ok) expect(incomeResult.error.code).toBe('browser_proof_required');
  });

  it('does not expose unsupported membership proof generation', async () => {
    const result = await proof.membership({
      memberId: 'mem123',
      organizationId: 'org123',
    });

    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.code).toBe('feature_unavailable');
  });

  it('submits only the public Groth16 contract fields', async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response(
      JSON.stringify({
        success: true,
        proofId: 'prf_test',
        shareUrl: 'https://www.otrust.eu/proof/prf_test',
        verifyUrl: 'https://www.otrust.eu/api/proof/prf_test/verify',
      }),
      { status: 200, headers: { 'Content-Type': 'application/json' } }
    ));
    configure({
      baseUrl: 'https://www.otrust.eu',
      fetch: fetchMock as typeof fetch,
      retries: 0,
    });

    const result = await proof.submitBrowserProof({
      proofType: 'age',
      version: 'groth16-v3',
      proof: { pi_a: ['1', '2', '1'] },
      publicSignals: ['1', '2026', '7', '23', '18', '42'],
      commitment: '42',
    });

    expect(result.ok).toBe(true);
    const requestBody = JSON.parse(String(fetchMock.mock.calls[0][1]?.body));
    expect(requestBody).toEqual({
      proofType: 'age',
      version: 'groth16-v3',
      proof: { pi_a: ['1', '2', '1'] },
      publicSignals: ['1', '2026', '7', '23', '18', '42'],
      commitment: '42',
    });
  });

  it('retires unauthenticated revocation and client-supplied backup email', async () => {
    const [revokeResult, backupResult] = await Promise.all([
      proof.revoke('id_test'),
      proof.emailBackup({
        email: 'me@example.com',
        proofId: 'id_test',
        secret: 'secret',
        commitment: 'commitment',
      }),
    ]);

    expect(revokeResult.ok).toBe(false);
    expect(backupResult.ok).toBe(false);
    if (!revokeResult.ok) {
      expect(revokeResult.error.code).toBe('trusted_identity_issuer_required');
    }
    if (!backupResult.ok) {
      expect(backupResult.error.code).toBe('legacy_feature_retired');
    }
  });

  it('also retires direct subpath imports before making a request', async () => {
    const fetchMock = vi.fn();
    configure({
      baseUrl: 'https://www.otrust.eu',
      fetch: fetchMock as typeof fetch,
      retries: 0,
    });

    const results = await Promise.all([
      directIdentity({ personnummer: '19900101-1234', birthDate: '1990-01-01' }),
      directAge({ birthDate: '1990-01-01', minAge: 18 }),
      directIncome({ income: 50000, minIncome: 30000 }),
      directMembership({ memberId: 'member', organizationId: 'org' }),
      directRevoke('id_test'),
      directEmailBackup({
        email: 'me@example.com',
        proofId: 'id_test',
        secret: 'secret',
        commitment: 'commitment',
      }),
    ]);

    expect(results.every(result => !result.ok)).toBe(true);
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
