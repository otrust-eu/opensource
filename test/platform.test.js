/**
 * Platform API — organizations and API keys (PR1)
 */

import { jest } from '@jest/globals';
import { getDb, closeDb } from '../src/db.js';
import { hash } from '../src/crypto.js';

let server;
let baseUrl;

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

  return { status: response.status, body: json, text, headers: response.headers };
}

describe('Platform API', () => {
  jest.setTimeout(30000);

  let orgId;
  let apiKeySecret;
  const createdOrgIds = [];

  beforeAll(async () => {
    process.env.NODE_ENV = 'test';
    process.env.PORT = '0';
    process.env.ADMIN_KEY = 'test-admin-key-platform';

    const { startServer } = await import('../src/server.js');
    server = await startServer(0);
    const address = server.address();
    baseUrl = `http://localhost:${address.port}`;
  });

  afterAll(async () => {
    const db = getDb();
    if (createdOrgIds.length) {
      await db.collection('api_keys').deleteMany({ org_id: { $in: createdOrgIds } });
      await db.collection('webhook_endpoints').deleteMany({ org_id: { $in: createdOrgIds } });
      await db.collection('webhook_deliveries').deleteMany({ org_id: { $in: createdOrgIds } });
      await db.collection('organizations').deleteMany({ id: { $in: createdOrgIds } });
    }
    if (server) {
      await new Promise((resolve) => server.close(resolve));
    }
    await closeDb();
  });

  describe('Admin — organizations', () => {
    it('rejects org creation without admin key', async () => {
      const res = await request('/api/v1/platform/organizations', {
        method: 'POST',
        body: { name: 'Acme Corp' }
      });
      expect(res.status).toBe(401);
      expect(res.body.request_id).toBeDefined();
    });

    it('creates an organization and safely replays an idempotent request', async () => {
      const idempotencyKey = `platform-test-${Date.now()}`;
      const res = await request('/api/v1/platform/organizations', {
        method: 'POST',
        headers: {
          'X-Admin-Key': 'test-admin-key-platform',
          'Idempotency-Key': idempotencyKey
        },
        body: { name: 'Platform Test Org' }
      });
      expect(res.status).toBe(201);
      expect(res.body.organization.id).toMatch(/^org_/);
      expect(res.body.organization.name).toBe('Platform Test Org');
      expect(res.headers.get('idempotency-replayed')).toBe('false');
      orgId = res.body.organization.id;
      createdOrgIds.push(orgId);

      const replay = await request('/api/v1/platform/organizations', {
        method: 'POST',
        headers: {
          'X-Admin-Key': 'test-admin-key-platform',
          'Idempotency-Key': idempotencyKey
        },
        body: { name: 'Platform Test Org' }
      });
      expect(replay.status).toBe(201);
      expect(replay.body.organization.id).toBe(orgId);
      expect(replay.headers.get('idempotency-replayed')).toBe('true');

      const conflict = await request('/api/v1/platform/organizations', {
        method: 'POST',
        headers: {
          'X-Admin-Key': 'test-admin-key-platform',
          'Idempotency-Key': idempotencyKey
        },
        body: { name: 'Different Org' }
      });
      expect(conflict.status).toBe(409);
      expect(conflict.body.error).toBe('idempotency_conflict');
      expect(conflict.body.request_id).toBeDefined();
    });

    it('rejects malformed idempotency keys instead of silently ignoring them', async () => {
      const res = await request('/api/v1/platform/organizations', {
        method: 'POST',
        headers: {
          'X-Admin-Key': 'test-admin-key-platform',
          'Idempotency-Key': 'short'
        },
        body: { name: 'Should Not Exist' }
      });
      expect(res.status).toBe(400);
      expect(res.body.error).toBe('invalid_idempotency_key');
    });

    it('lists organizations', async () => {
      const res = await request('/api/v1/platform/organizations', {
        headers: { 'X-Admin-Key': 'test-admin-key-platform' }
      });
      expect(res.status).toBe(200);
      expect(res.body.organizations.some((o) => o.id === orgId)).toBe(true);
      expect(res.body).toHaveProperty('next_cursor');
    });

    it('paginates organizations with an opaque cursor', async () => {
      const created = await request('/api/v1/platform/organizations', {
        method: 'POST',
        headers: { 'X-Admin-Key': 'test-admin-key-platform' },
        body: { name: 'Pagination Org' }
      });
      createdOrgIds.push(created.body.organization.id);

      const first = await request('/api/v1/platform/organizations?limit=1', {
        headers: { 'X-Admin-Key': 'test-admin-key-platform' }
      });
      expect(first.status).toBe(200);
      expect(first.body.organizations).toHaveLength(1);
      expect(first.body.next_cursor).toBeTruthy();

      const second = await request(
        `/api/v1/platform/organizations?limit=1&cursor=${encodeURIComponent(first.body.next_cursor)}`,
        { headers: { 'X-Admin-Key': 'test-admin-key-platform' } }
      );
      expect(second.status).toBe(200);
      expect(second.body.organizations).toHaveLength(1);
      expect(second.body.organizations[0].id).not.toBe(first.body.organizations[0].id);

      const invalid = await request('/api/v1/platform/organizations?cursor=not-a-cursor', {
        headers: { 'X-Admin-Key': 'test-admin-key-platform' }
      });
      expect(invalid.status).toBe(400);
      expect(invalid.body.error).toBe('invalid_cursor');
    });
  });

  describe('Admin — API keys', () => {
    it('creates an API key and returns secret once', async () => {
      const res = await request(`/api/v1/platform/organizations/${orgId}/api-keys`, {
        method: 'POST',
        headers: { 'X-Admin-Key': 'test-admin-key-platform' },
        body: {
          label: 'ci-integration',
          scopes: ['timestamp:write', 'timestamp:read']
        }
      });
      expect(res.status).toBe(201);
      expect(res.body.secret).toMatch(/^otrust_live_/);
      expect(res.body.api_key.org_id).toBe(orgId);
      expect(res.body.api_key.scopes).toContain('timestamp:write');
      apiKeySecret = res.body.secret;
    });

    it('lists keys without exposing secrets', async () => {
      const res = await request(`/api/v1/platform/organizations/${orgId}/api-keys`, {
        headers: { 'X-Admin-Key': 'test-admin-key-platform' }
      });
      expect(res.status).toBe(200);
      expect(res.body.api_keys.length).toBeGreaterThanOrEqual(1);
      expect(res.body.api_keys[0].prefix).toBeDefined();
      expect(res.body.api_keys[0].secret).toBeUndefined();
    });
  });

  describe('API key authentication', () => {
    it('returns platform identity for valid key', async () => {
      const res = await request('/api/v1/platform/me', {
        headers: { Authorization: `Bearer ${apiKeySecret}` }
      });
      expect(res.status).toBe(200);
      expect(res.body.org_id).toBe(orgId);
      expect(res.body.scopes).toContain('timestamp:read');
      expect(res.body.key_prefix).toBeDefined();
    });

    it('rejects invalid key format', async () => {
      const res = await request('/api/v1/platform/me', {
        headers: { Authorization: 'Bearer not-a-real-key' }
      });
      expect(res.status).toBe(401);
      expect(res.body.error).toBe('invalid_api_key');
    });

    it('requires key for /platform/me', async () => {
      const res = await request('/api/v1/platform/me');
      expect(res.status).toBe(401);
      expect(res.body.error).toBe('api_key_required');
    });

    it('exposes public scope reference', async () => {
      const res = await request('/api/v1/platform/scopes');
      expect(res.status).toBe(200);
      expect(res.body.scopes).toContain('timestamp:write');
      expect(res.body.scopes).toContain('webhook:manage');
    });
  });

  describe('Revocation', () => {
    it('revokes a key and rejects subsequent use', async () => {
      const createRes = await request(`/api/v1/platform/organizations/${orgId}/api-keys`, {
        method: 'POST',
        headers: { 'X-Admin-Key': 'test-admin-key-platform' },
        body: { label: 'revoke-test' }
      });
      const keyId = createRes.body.api_key.key_id;
      const secret = createRes.body.secret;

      const meOk = await request('/api/v1/platform/me', {
        headers: { Authorization: `Bearer ${secret}` }
      });
      expect(meOk.status).toBe(200);

      const revokeRes = await request(`/api/v1/platform/organizations/${orgId}/api-keys/${keyId}`, {
        method: 'DELETE',
        headers: { 'X-Admin-Key': 'test-admin-key-platform' }
      });
      expect(revokeRes.status).toBe(200);

      const meFail = await request('/api/v1/platform/me', {
        headers: { Authorization: `Bearer ${secret}` }
      });
      expect(meFail.status).toBe(401);
    });
  });

  describe('Webhooks', () => {
    let hookKeySecret;

    beforeAll(async () => {
      const res = await request(`/api/v1/platform/organizations/${orgId}/api-keys`, {
        method: 'POST',
        headers: { 'X-Admin-Key': 'test-admin-key-platform' },
        body: {
          label: 'webhook-key',
          scopes: ['webhook:manage', 'timestamp:read']
        }
      });
      hookKeySecret = res.body.secret;
    });

    it('rejects webhook endpoint without scope', async () => {
      const res = await request('/api/v1/platform/webhooks/endpoints', {
        method: 'POST',
        headers: { Authorization: `Bearer ${apiKeySecret}` },
        body: { url: 'https://example.com/hook' }
      });
      expect(res.status).toBe(403);
    });

    it('creates webhook endpoint and lists deliveries after test', async () => {
      const createRes = await request('/api/v1/platform/webhooks/endpoints', {
        method: 'POST',
        headers: { Authorization: `Bearer ${hookKeySecret}` },
        body: {
          url: 'https://example.com/hooks/otrust-test',
          events: ['timestamp.created']
        }
      });
      expect(createRes.status).toBe(201);
      expect(createRes.body.endpoint.endpoint_id).toMatch(/^whe_/);

      const testRes = await request('/api/v1/platform/webhooks/test', {
        method: 'POST',
        headers: { Authorization: `Bearer ${hookKeySecret}` },
        body: { event: 'timestamp.created' }
      });
      expect(testRes.status).toBe(200);
      const secondTestRes = await request('/api/v1/platform/webhooks/test', {
        method: 'POST',
        headers: { Authorization: `Bearer ${hookKeySecret}` },
        body: { event: 'timestamp.created' }
      });
      expect(secondTestRes.status).toBe(200);

      const deliveriesRes = await request('/api/v1/platform/webhooks/deliveries?limit=1', {
        headers: { Authorization: `Bearer ${hookKeySecret}` }
      });
      expect(deliveriesRes.status).toBe(200);
      expect(deliveriesRes.body.deliveries).toHaveLength(1);
      expect(deliveriesRes.body.next_cursor).toBeTruthy();

      const nextDeliveries = await request(
        `/api/v1/platform/webhooks/deliveries?limit=1&cursor=${encodeURIComponent(deliveriesRes.body.next_cursor)}`,
        { headers: { Authorization: `Bearer ${hookKeySecret}` } }
      );
      expect(nextDeliveries.status).toBe(200);
      expect(nextDeliveries.body.deliveries).toHaveLength(1);
      expect(nextDeliveries.body.deliveries[0].delivery_id)
        .not.toBe(deliveriesRes.body.deliveries[0].delivery_id);
    });

    it('returns org usage summary', async () => {
      const res = await request('/api/v1/platform/usage', {
        headers: { Authorization: `Bearer ${apiKeySecret}` }
      });
      expect(res.status).toBe(200);
      expect(res.body.org_id).toBe(orgId);
      expect(res.body.plan).toBeDefined();
    });
  });

  describe('Backward compatibility', () => {
    it('allows anonymous health check without API key', async () => {
      const res = await request('/health');
      expect(res.status).toBe(200);
    });

    it('allows claim/simple without API key', async () => {
      const testHash = hash('platform anon ' + Date.now());
      const res = await request('/claim/simple', {
        method: 'POST',
        body: { hash: testHash, source: 'platform-test' }
      });
      expect([200, 201]).toContain(res.status);
      expect(res.body.receipt_id).toBeDefined();
    });
  });
});
