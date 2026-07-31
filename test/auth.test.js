/**
 * Auth Service Tests - "Login with OTRUST"
 */

import { jest } from '@jest/globals';
import crypto from 'crypto';
import { getDb, closeDb } from '../src/db.js';

let server;
let baseUrl;

// Helper to make HTTP requests
async function request(path, options = {}) {
  const url = `${baseUrl}${path}`;
  const response = await fetch(url, {
    method: options.method || 'GET',
    headers: {
      'Content-Type': 'application/json',
      'Origin': baseUrl,
      ...options.headers
    },
    body: options.body ? JSON.stringify(options.body) : undefined
  });

  const text = await response.text();
  let json;
  try {
    json = JSON.parse(text);
  } catch {
    json = null;
  }

  return {
    status: response.status,
    body: json,
    text
  };
}

describe('Auth Service - Login with OTRUST', () => {
  jest.setTimeout(30000);

  let testProofId;
  let testSecret;
  let testCommitment;

  beforeAll(async () => {
    process.env.NODE_ENV = 'test';
    process.env.PORT = '0';
    process.env.AUTH_SECRET = 'test-auth-secret-for-testing-only';
    process.env.ADMIN_KEY = 'test-admin-key';
    process.env.AUTH_CLIENTS_JSON = JSON.stringify({
      'test-app': {
        redirectUris: ['https://example.com/callback']
      },
      hemsted_prod: {
        redirectUris: [
          'https://hemsted.se/callback',
          'https://hemsted.se/auth/callback'
        ]
      }
    });

    const { startServer } = await import('../src/server.js');
    server = await startServer(0);
    const address = server.address();
    baseUrl = `http://localhost:${address.port}`;

    testProofId = `id_test_${Date.now()}`;
    testSecret = crypto.randomBytes(32).toString('hex');
    testCommitment = crypto.createHash('sha256')
      .update(`${testProofId}:${testSecret}`)
      .digest('hex');
    await getDb().collection('proofs').insertOne({
      id: testProofId,
      type: 'identity',
      credential_binding: 'trusted_issuer',
      issuer: { id: 'test-issuer', name: 'Test issuer' },
      commitment: testCommitment,
      statement: 'Trusted issuer-bound test identity',
      verification: { documentVerified: true },
      createdAt: new Date(),
      expiresAt: new Date(Date.now() + 60 * 60 * 1000)
    });
  });

  describe('POST /api/proof/identity', () => {
    it('retires self-attested identity registration', async () => {
      const response = await request('/api/proof/identity', {
        method: 'POST',
        body: {
          personnummer: '19850515-9999',
          birthDate: '1985-05-15',
          pin: '123456'
        }
      });

      expect(response.status).toBe(410);
      expect(response.body.error).toBe('trusted_identity_credential_required');

      const previousNodeEnv = process.env.NODE_ENV;
      const previousLegacyFlag = process.env.ENABLE_LEGACY_SELF_ATTESTED_IDENTITY;
      process.env.NODE_ENV = 'production';
      process.env.ENABLE_LEGACY_SELF_ATTESTED_IDENTITY = 'true';

      try {
        const productionResponse = await request('/api/proof/identity', {
          method: 'POST',
          body: {
            personnummer: '19850515-9999',
            birthDate: '1985-05-15',
            pin: '123456'
          }
        });
        expect(productionResponse.status).toBe(410);
        expect(productionResponse.body.error).toBe('trusted_identity_credential_required');
      } finally {
        process.env.NODE_ENV = previousNodeEnv;
        if (previousLegacyFlag === undefined) {
          delete process.env.ENABLE_LEGACY_SELF_ATTESTED_IDENTITY;
        } else {
          process.env.ENABLE_LEGACY_SELF_ATTESTED_IDENTITY = previousLegacyFlag;
        }
      }
    });
  });

  afterAll(async () => {
    const db = getDb();
    if (testProofId) {
      await db.collection('proofs').deleteOne({ id: testProofId });
      await db.collection('identity_proofs').deleteOne({ proofId: testProofId });
    }
    await db.collection('auth_branding').deleteMany({});
    await db.collection('audit_log').deleteMany({ event_type: 'auth_branding_changed' });
    if (server) {
      await new Promise((resolve, reject) => {
        const timeout = setTimeout(() => reject(new Error('Server close timeout')), 5000);
        server.close(() => {
          clearTimeout(timeout);
          resolve();
        });
      });
    }
    await closeDb();
  });

  describe('POST /api/v1/auth/challenge', () => {
    it('fails closed in production without a trusted issuer', async () => {
      const previousNodeEnv = process.env.NODE_ENV;
      const previousIssuerFlag = process.env.TRUSTED_IDENTITY_ISSUER_ENABLED;
      process.env.NODE_ENV = 'production';
      delete process.env.TRUSTED_IDENTITY_ISSUER_ENABLED;

      try {
        const response = await request('/api/v1/auth/challenge', {
          method: 'POST',
          body: {
            clientId: 'test-app',
            redirectUri: 'https://example.com/callback'
          }
        });

        expect(response.status).toBe(503);
        expect(response.body.error).toBe('auth_capability_unavailable');

        const proveResponse = await request('/api/v1/auth/prove', {
          method: 'POST',
          body: { challengeId: 'ch_disabled', proofId: 'id_disabled', secret: 'disabled' }
        });
        expect(proveResponse.status).toBe(503);
        expect(proveResponse.body.error).toBe('auth_capability_unavailable');

        const verifyResponse = await request('/api/v1/auth/verify', {
          method: 'POST',
          body: { token: 'disabled.disabled' }
        });
        expect(verifyResponse.status).toBe(503);
        expect(verifyResponse.body.error).toBe('auth_capability_unavailable');

        const userinfoResponse = await request('/api/v1/auth/userinfo', {
          headers: { Authorization: 'Bearer disabled.disabled' }
        });
        expect(userinfoResponse.status).toBe(503);
        expect(userinfoResponse.body.error).toBe('auth_capability_unavailable');
      } finally {
        process.env.NODE_ENV = previousNodeEnv;
        if (previousIssuerFlag === undefined) {
          delete process.env.TRUSTED_IDENTITY_ISSUER_ENABLED;
        } else {
          process.env.TRUSTED_IDENTITY_ISSUER_ENABLED = previousIssuerFlag;
        }
      }
    });

    it('should create a valid challenge', async () => {
      const response = await request('/api/v1/auth/challenge', {
        method: 'POST',
        body: {
          clientId: 'test-app',
          redirectUri: 'https://example.com/callback',
          scope: ['identity'],
          state: 'random-state-123'
        }
      });

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
      expect(response.body.challengeId).toMatch(/^ch_/);
      expect(response.body.challenge).toHaveLength(64);
      expect(response.body.loginUrl).toContain('/auth/login?challenge=');
      expect(response.body.loginUrl).not.toContain('theme_id=');
      expect(response.body.themeId).toBe('default');
      expect(response.body.expiresIn).toBe(300);
    });

    it('should reject missing clientId', async () => {
      const response = await request('/api/v1/auth/challenge', {
        method: 'POST',
        body: { redirectUri: 'https://example.com/callback' }
      });

      expect(response.status).toBe(400);
      expect(response.body.error).toBe('invalid_request');
    });

    it('should reject invalid redirectUri', async () => {
      const response = await request('/api/v1/auth/challenge', {
        method: 'POST',
        body: {
          clientId: 'test-app',
          redirectUri: 'not-a-valid-url'
        }
      });

      expect(response.status).toBe(400);
      expect(response.body.error).toBe('invalid_redirect_uri');
    });

    it('rejects unregistered clients and redirect URIs', async () => {
      const unregisteredClient = await request('/api/v1/auth/challenge', {
        method: 'POST',
        body: {
          clientId: 'unknown-app',
          redirectUri: 'https://example.com/callback',
          state: 'state-unknown'
        }
      });
      const mismatchedRedirect = await request('/api/v1/auth/challenge', {
        method: 'POST',
        body: {
          clientId: 'test-app',
          redirectUri: 'https://attacker.example/callback',
          state: 'state-mismatch'
        }
      });

      expect(unregisteredClient.status).toBe(400);
      expect(unregisteredClient.body.error).toBe('unauthorized_client');
      expect(mismatchedRedirect.status).toBe(400);
      expect(mismatchedRedirect.body.error).toBe('unauthorized_client');
    });
  });

  describe('Partner branding', () => {
    it('should save client branding and expose safe challenge metadata', async () => {
      const brandingRes = await request('/admin/auth-branding/hemsted_prod', {
        method: 'PUT',
        headers: {
          'X-Admin-Key': 'test-admin-key',
          'X-Admin-User': 'kris@hemsted.se'
        },
        body: {
          logoUrl: 'https://hemsted.se/assets/branding/logo.svg',
          backgroundColor: '#FAFAF7',
          primaryColor: '#0F1B2D',
          textColor: '#0F1B2D',
          fontFamily: 'Inter',
          borderRadius: 8,
          spacingScale: 'default',
          headline: 'Logga in pa Hemsted',
          subhead: 'Saker inloggning med OTRUST',
          footerText: 'Hemsted AB with OTRUST as identity provider',
          infoBlurb: 'Partner-branded hosted login for Hemsted users.',
          allowedIdentityMethods: ['proof'],
          autoRedirectSeconds: 3
        }
      });

      expect(brandingRes.status).toBe(200);
      expect(brandingRes.body.success).toBe(true);
      expect(brandingRes.body.themeId).toBe('default');
      expect(brandingRes.body.branding.logoUrl).toBe('https://hemsted.se/assets/branding/logo.svg');
      expect(brandingRes.body.branding.primaryColor).toBe('#0F1B2D');
      expect(brandingRes.body.branding.headline).toBe('Logga in pa Hemsted');

      const challengeRes = await request('/api/v1/auth/challenge', {
        method: 'POST',
        body: {
          clientId: 'hemsted_prod',
          redirectUri: 'https://hemsted.se/callback',
          scope: ['identity', 'profile'],
          theme_id: 'default',
          state: 'hemsted-state'
        }
      });

      const metadataRes = await request(`/api/v1/auth/challenge/${challengeRes.body.challengeId}`);

      expect(metadataRes.status).toBe(200);
      expect(metadataRes.body.success).toBe(true);
      expect(metadataRes.body.clientId).toBe('hemsted_prod');
      expect(metadataRes.body.themeId).toBe('default');
      expect(metadataRes.body.scope).toEqual(['identity', 'profile']);
      expect(metadataRes.body.branding.headline).toBe('Logga in pa Hemsted');
      expect(metadataRes.body.branding.logoUrl).toBe('https://hemsted.se/assets/branding/logo.svg');
      expect(metadataRes.body.redirectUri).toBeUndefined();
      expect(metadataRes.body.challenge).toBeUndefined();

      const db = getDb();
      const auditEvents = await db.collection('audit_log')
        .find({ event_type: 'auth_branding_changed' })
        .toArray();
      expect(auditEvents.some(event => event.details.client_id === 'hemsted_prod')).toBe(true);
      expect(auditEvents.some(event => event.details.theme_id === 'default')).toBe(true);
    });

    it('should expose built-in Hemsted dark theme by theme_id without URL overrides', async () => {
      const challengeRes = await request('/api/v1/auth/challenge', {
        method: 'POST',
        body: {
          clientId: 'hemsted_prod',
          redirectUri: 'https://hemsted.se/auth/callback',
          scope: ['identity'],
          state: 'hemsted-state'
        }
      });

      expect(challengeRes.body.themeId).toBe('hemsted_dark');
      expect(challengeRes.body.loginUrl).toContain('theme_id=hemsted_dark');

      const metadataRes = await request(`/api/v1/auth/challenge/${challengeRes.body.challengeId}`);

      expect(metadataRes.status).toBe(200);
      expect(metadataRes.body.success).toBe(true);
      expect(metadataRes.body.clientId).toBe('hemsted_prod');
      expect(metadataRes.body.themeId).toBe('hemsted_dark');
      expect(metadataRes.body.branding.themeId).toBe('hemsted_dark');
      expect(metadataRes.body.branding.headline).toBe('Logga in p\u00e5 Hemsted');
      expect(metadataRes.body.branding.subhead).toBe('Kr\u00e4ver en utf\u00e4rdarbunden OTRUST-legitimation');
      expect(metadataRes.body.branding.backgroundColor).toBe('#FAFAF7');
      expect(metadataRes.body.branding.primaryColor).toBe('#0F1B2D');
      expect(metadataRes.body.branding.allowedIdentityMethods).toEqual(['proof']);
      expect(metadataRes.body.branding.logoUrl).toBe('https://hemsted.se/assets/branding/logo.svg');
    });

    it('should support staging theme_id and reject unsafe theme_id values', async () => {
      const challengeRes = await request('/api/v1/auth/challenge', {
        method: 'POST',
        body: {
          clientId: 'hemsted_prod',
          redirectUri: 'https://hemsted.se/auth/callback',
          theme_id: 'hemsted_dark_staging'
        }
      });

      expect(challengeRes.body.themeId).toBe('hemsted_dark_staging');
      expect(challengeRes.body.loginUrl).toContain('theme_id=hemsted_dark_staging');

      const stagingRes = await request(`/api/v1/auth/challenge/${challengeRes.body.challengeId}`);
      expect(stagingRes.status).toBe(200);
      expect(stagingRes.body.themeId).toBe('hemsted_dark_staging');
      expect(stagingRes.body.branding.themeId).toBe('hemsted_dark_staging');

      const unsafeRes = await request(`/api/v1/auth/challenge/${challengeRes.body.challengeId}?theme_id=<script>`);
      expect(unsafeRes.status).toBe(400);
      expect(unsafeRes.body.error).toBe('invalid_theme_id');

      const unsafeChallengeRes = await request('/api/v1/auth/challenge', {
        method: 'POST',
        body: {
          clientId: 'hemsted_prod',
          redirectUri: 'https://hemsted.se/auth/callback',
          theme_id: '<script>'
        }
      });
      expect(unsafeChallengeRes.status).toBe(400);
      expect(unsafeChallengeRes.body.error).toBe('invalid_theme_id');
    });

    it('should save and audit a named branding theme', async () => {
      const brandingRes = await request('/admin/auth-branding/hemsted_prod/hemsted_dark', {
        method: 'PUT',
        headers: {
          'X-Admin-Key': 'test-admin-key',
          'X-Admin-User': 'kris@hemsted.se'
        },
        body: {
          logoUrl: 'https://hemsted.se/assets/branding/logo.svg',
          backgroundColor: '#FAFAF7',
          primaryColor: '#0F1B2D',
          textColor: '#0F1B2D',
          fontFamily: 'Inter',
          borderRadius: 8,
          spacingScale: 'default',
          headline: 'Logga in pa Hemsted staging',
          subhead: 'Saker inloggning med OTRUST Proof',
          footerText: 'Identity-flode sakrat av OTRUST',
          allowedIdentityMethods: ['proof'],
          autoRedirectSeconds: 3
        }
      });

      expect(brandingRes.status).toBe(200);
      expect(brandingRes.body.themeId).toBe('hemsted_dark');
      expect(brandingRes.body.branding.allowedIdentityMethods).toEqual(['proof']);

      const db = getDb();
      const auditEvents = await db.collection('audit_log')
        .find({ event_type: 'auth_branding_changed' })
        .toArray();
      expect(auditEvents.some(event => event.details.client_id === 'hemsted_prod' && event.details.theme_id === 'hemsted_dark')).toBe(true);
    });

    it('should reject unsafe branding values', async () => {
      const response = await request('/admin/auth-branding/unsafe_client', {
        method: 'PUT',
        headers: { 'X-Admin-Key': 'test-admin-key' },
        body: {
          logoUrl: 'javascript:alert(1)',
          primaryColor: 'not-a-color'
        }
      });

      expect(response.status).toBe(400);
      expect(response.body.error).toBe('invalid_branding');
    });

    it('should require an admin key for branding updates', async () => {
      const response = await request('/admin/auth-branding/hemsted_prod', {
        method: 'PUT',
        body: { headline: 'Unauthorized update' }
      });

      expect(response.status).toBe(403);
      expect(response.body.error).toBe('forbidden');
    });
  });

  describe('POST /api/v1/auth/prove', () => {
    it('should verify valid proof and return token', async () => {
      if (!testProofId) {
        console.log('Skipping: No test proof available');
        return;
      }

      const challengeRes = await request('/api/v1/auth/challenge', {
        method: 'POST',
        body: {
          clientId: 'test-app',
          redirectUri: 'https://example.com/callback',
          state: 'test-state'
        }
      });

      const { challengeId } = challengeRes.body;

      const proveRes = await request('/api/v1/auth/prove', {
        method: 'POST',
        body: {
          challengeId,
          proofId: testProofId,
          secret: testSecret
        }
      });

      expect(proveRes.status).toBe(200);
      expect(proveRes.body.success).toBe(true);
      expect(proveRes.body.token).toBeDefined();
      expect(proveRes.body.redirectUrl).toContain('https://example.com/callback');
      expect(proveRes.body.redirectUrl).toContain('token=');
      expect(proveRes.body.redirectUrl).toContain('state=test-state');
      expect(proveRes.body.expiresIn).toBe(3600);
    });

    it('should reject invalid challenge', async () => {
      const response = await request('/api/v1/auth/prove', {
        method: 'POST',
        body: {
          challengeId: 'ch_invalid',
          proofId: testProofId || 'id_test',
          secret: testSecret || 'test'
        }
      });

      expect(response.status).toBe(400);
      expect(response.body.error).toBe('invalid_challenge');
    });

    it('should reject invalid secret', async () => {
      if (!testProofId) return;

      const challengeRes = await request('/api/v1/auth/challenge', {
        method: 'POST',
        body: {
          clientId: 'test-app',
          redirectUri: 'https://example.com/callback'
        }
      });

      const proveRes = await request('/api/v1/auth/prove', {
        method: 'POST',
        body: {
          challengeId: challengeRes.body.challengeId,
          proofId: testProofId,
          secret: 'wrong-secret-value'
        }
      });

      expect(proveRes.status).toBe(401);
      expect(proveRes.body.error).toBe('invalid_secret');
    });

    it('should reject a legacy self-attested identity record', async () => {
      const legacyProofId = `id_legacy_${Date.now()}`;
      const legacySecret = 'legacy-secret';
      await getDb().collection('proofs').insertOne({
        id: legacyProofId,
        type: 'identity',
        credential_binding: 'none',
        commitment: crypto.createHash('sha256')
          .update(`${legacyProofId}:${legacySecret}`)
          .digest('hex'),
        createdAt: new Date()
      });

      const challengeRes = await request('/api/v1/auth/challenge', {
        method: 'POST',
        body: {
          clientId: 'test-app',
          redirectUri: 'https://example.com/callback'
        }
      });
      const proveRes = await request('/api/v1/auth/prove', {
        method: 'POST',
        body: {
          challengeId: challengeRes.body.challengeId,
          proofId: legacyProofId,
          secret: legacySecret
        }
      });

      expect(proveRes.status).toBe(403);
      expect(proveRes.body.error).toBe('trusted_identity_credential_required');
      await getDb().collection('proofs').deleteOne({ id: legacyProofId });
    });

    it('should reject non-existent proof', async () => {
      const challengeRes = await request('/api/v1/auth/challenge', {
        method: 'POST',
        body: {
          clientId: 'test-app',
          redirectUri: 'https://example.com/callback'
        }
      });

      const proveRes = await request('/api/v1/auth/prove', {
        method: 'POST',
        body: {
          challengeId: challengeRes.body.challengeId,
          proofId: 'id_nonexistent',
          secret: 'some-secret'
        }
      });

      expect(proveRes.status).toBe(400);
      expect(proveRes.body.error).toBe('proof_not_found');
    });
  });

  describe('POST /api/v1/auth/verify', () => {
    it('should verify valid token', async () => {
      if (!testProofId) return;

      const challengeRes = await request('/api/v1/auth/challenge', {
        method: 'POST',
        body: {
          clientId: 'test-app',
          redirectUri: 'https://example.com/callback'
        }
      });

      const proveRes = await request('/api/v1/auth/prove', {
        method: 'POST',
        body: {
          challengeId: challengeRes.body.challengeId,
          proofId: testProofId,
          secret: testSecret
        }
      });

      const verifyRes = await request('/api/v1/auth/verify', {
        method: 'POST',
        body: { token: proveRes.body.token }
      });

      expect(verifyRes.status).toBe(200);
      expect(verifyRes.body.valid).toBe(true);
      expect(verifyRes.body.proofId).toBe(testProofId);
      expect(verifyRes.body.clientId).toBe('test-app');
      expect(verifyRes.body.identity).toBeDefined();
      expect(verifyRes.body.identity.verified).toBe(true);
    });

    it('should reject invalid token', async () => {
      const response = await request('/api/v1/auth/verify', {
        method: 'POST',
        body: { token: 'invalid.token' }
      });

      expect(response.status).toBe(401);
      expect(response.body.error).toBe('invalid_signature');
    });

    it('should reject malformed token', async () => {
      const response = await request('/api/v1/auth/verify', {
        method: 'POST',
        body: { token: 'no-dot-in-token' }
      });

      expect(response.status).toBe(400);
      expect(response.body.error).toBe('invalid_token');
    });
  });

  describe('GET /api/v1/auth/userinfo', () => {
    it('should return user info with valid Bearer token', async () => {
      if (!testProofId) return;

      const challengeRes = await request('/api/v1/auth/challenge', {
        method: 'POST',
        body: {
          clientId: 'test-app',
          redirectUri: 'https://example.com/callback'
        }
      });

      const proveRes = await request('/api/v1/auth/prove', {
        method: 'POST',
        body: {
          challengeId: challengeRes.body.challengeId,
          proofId: testProofId,
          secret: testSecret
        }
      });

      const userinfoRes = await request('/api/v1/auth/userinfo', {
        headers: { 'Authorization': `Bearer ${proveRes.body.token}` }
      });

      expect(userinfoRes.status).toBe(200);
      expect(userinfoRes.body.proofId).toBe(testProofId);
      expect(userinfoRes.body.verified).toBe(true);
    });

    it('should reject missing Authorization header', async () => {
      const response = await request('/api/v1/auth/userinfo');

      expect(response.status).toBe(401);
      expect(response.body.error).toBe('unauthorized');
    });
  });

  describe('GET /auth/login', () => {
    it('should serve the login page', async () => {
      const response = await request('/auth/login?challenge=ch_test123');

      expect(response.status).toBe(200);
      expect(response.text).toContain('OTRUST Auth');
      expect(response.text).toContain('issuer-bound credential');
    });
  });

  describe('API v1 info', () => {
    it('should list auth service in /api/v1', async () => {
      const response = await request('/api/v1');

      expect(response.status).toBe(200);
      expect(response.body.services.auth).toBeDefined();
      expect(response.body.services.auth.description).toContain('Issuer-bound identity authentication');
      expect(response.body.services.auth.endpoints).toContain('POST /api/v1/auth/challenge');
      expect(response.body.services.auth.endpoints).toContain('GET /api/v1/auth/challenge/:id');
    });
  });
});
