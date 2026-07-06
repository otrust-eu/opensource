import { createOrganization, getOrganization, listOrganizations } from './orgs.js';
import { createApiKey, listApiKeys, revokeApiKey } from './api-keys.js';
import { ALL_SCOPES } from './scopes.js';
import { requireApiKey, requireScope } from './middleware.js';
import {
  createWebhookEndpoint,
  listWebhookEndpoints,
  deleteWebhookEndpoint
} from './webhook-endpoints.js';
import { emitWebhookEvent, listDeliveries } from './webhook-dispatch.js';
import { getOrgUsageSummary } from '../hosted/billing.js';

export function registerPlatformRoutes(app, { getDb, hasValidAdminKey, smallJson }) {
  // GET /api/v1/platform/me — identity for integrators
  app.get('/api/v1/platform/me', requireApiKey, (req, res) => {
    res.json({
      org_id: req.orgId,
      key_id: req.apiKeyId,
      key_prefix: req.apiKeyPrefix,
      environment: req.apiKeyEnvironment,
      scopes: req.apiKeyScopes || []
    });
  });

  // GET /api/v1/platform/scopes — public reference
  app.get('/api/v1/platform/scopes', (_req, res) => {
    res.json({ scopes: ALL_SCOPES });
  });

  const adminGuard = (req, res, next) => {
    if (!hasValidAdminKey(req)) {
      return res.status(401).json({ error: 'unauthorized', message: 'Valid X-Admin-Key required' });
    }
    return next();
  };

  // POST /api/v1/platform/organizations
  app.post('/api/v1/platform/organizations', smallJson, adminGuard, async (req, res) => {
    try {
      const result = await createOrganization(getDb(), { name: req.body?.name });
      if (result.error) {
        return res.status(400).json({ error: result.error });
      }
      res.status(201).json({
        organization: {
          id: result.organization.id,
          name: result.organization.name,
          plan: result.organization.plan,
          created_at: result.organization.created_at
        }
      });
    } catch (error) {
      console.error('[Platform] Create org failed:', error.message);
      res.status(500).json({ error: 'server_error' });
    }
  });

  // GET /api/v1/platform/organizations
  app.get('/api/v1/platform/organizations', adminGuard, async (req, res) => {
    try {
      const orgs = await listOrganizations(getDb(), { limit: req.query?.limit });
      res.json({
        organizations: orgs.map((o) => ({
          id: o.id,
          name: o.name,
          plan: o.plan || 'free',
          created_at: o.created_at
        }))
      });
    } catch (error) {
      console.error('[Platform] List orgs failed:', error.message);
      res.status(500).json({ error: 'server_error' });
    }
  });

  // GET /api/v1/platform/organizations/:orgId
  app.get('/api/v1/platform/organizations/:orgId', adminGuard, async (req, res) => {
    try {
      const org = await getOrganization(getDb(), req.params.orgId);
      if (!org) return res.status(404).json({ error: 'org_not_found' });
      res.json({
        organization: {
          id: org.id,
          name: org.name,
          created_at: org.created_at
        }
      });
    } catch (error) {
      console.error('[Platform] Get org failed:', error.message);
      res.status(500).json({ error: 'server_error' });
    }
  });

  // POST /api/v1/platform/organizations/:orgId/api-keys
  app.post('/api/v1/platform/organizations/:orgId/api-keys', smallJson, adminGuard, async (req, res) => {
    try {
      const result = await createApiKey(getDb(), req.params.orgId, {
        label: req.body?.label,
        scopes: req.body?.scopes,
        environment: req.body?.environment
      });

      if (result.error === 'org_not_found') {
        return res.status(404).json({ error: result.error });
      }
      if (result.error) {
        return res.status(400).json({ error: result.error, invalid: result.invalid });
      }

      res.status(201).json({
        api_key: result.api_key,
        secret: result.secret,
        warning: 'Store the secret now. It cannot be retrieved again.'
      });
    } catch (error) {
      console.error('[Platform] Create API key failed:', error.message);
      res.status(500).json({ error: 'server_error' });
    }
  });

  // GET /api/v1/platform/organizations/:orgId/api-keys
  app.get('/api/v1/platform/organizations/:orgId/api-keys', adminGuard, async (req, res) => {
    try {
      const org = await getOrganization(getDb(), req.params.orgId);
      if (!org) return res.status(404).json({ error: 'org_not_found' });

      const keys = await listApiKeys(getDb(), req.params.orgId);
      res.json({ api_keys: keys });
    } catch (error) {
      console.error('[Platform] List API keys failed:', error.message);
      res.status(500).json({ error: 'server_error' });
    }
  });

  // DELETE /api/v1/platform/organizations/:orgId/api-keys/:keyId
  app.delete('/api/v1/platform/organizations/:orgId/api-keys/:keyId', adminGuard, async (req, res) => {
    try {
      const revoked = await revokeApiKey(getDb(), req.params.orgId, req.params.keyId);
      if (!revoked) return res.status(404).json({ error: 'key_not_found' });
      res.json({ success: true, key_id: req.params.keyId });
    } catch (error) {
      console.error('[Platform] Revoke API key failed:', error.message);
      res.status(500).json({ error: 'server_error' });
    }
  });

  // GET /api/v1/platform/usage — org usage (API key)
  app.get('/api/v1/platform/usage', requireApiKey, async (req, res) => {
    try {
      const usage = await getOrgUsageSummary(getDb(), req.orgId);
      res.json(usage);
    } catch (error) {
      console.error('[Platform] Usage failed:', error.message);
      res.status(500).json({ error: 'server_error' });
    }
  });

  // POST /api/v1/platform/webhooks/endpoints
  app.post('/api/v1/platform/webhooks/endpoints', smallJson, requireApiKey, requireScope('webhook:manage'), async (req, res) => {
    try {
      const result = await createWebhookEndpoint(getDb(), req.orgId, {
        url: req.body?.url,
        secret: req.body?.secret,
        events: req.body?.events,
        label: req.body?.label
      });
      if (result.error) return res.status(400).json({ error: result.error });
      res.status(201).json({
        endpoint: result.endpoint,
        secret: result.secret,
        warning: 'Store webhook secret if you did not provide one.'
      });
    } catch (error) {
      console.error('[Platform] Create webhook endpoint failed:', error.message);
      res.status(500).json({ error: 'server_error' });
    }
  });

  // GET /api/v1/platform/webhooks/endpoints
  app.get('/api/v1/platform/webhooks/endpoints', requireApiKey, requireScope('webhook:manage'), async (req, res) => {
    try {
      const endpoints = await listWebhookEndpoints(getDb(), req.orgId);
      res.json({ endpoints });
    } catch (error) {
      console.error('[Platform] List webhook endpoints failed:', error.message);
      res.status(500).json({ error: 'server_error' });
    }
  });

  // DELETE /api/v1/platform/webhooks/endpoints/:endpointId
  app.delete('/api/v1/platform/webhooks/endpoints/:endpointId', requireApiKey, requireScope('webhook:manage'), async (req, res) => {
    try {
      const ok = await deleteWebhookEndpoint(getDb(), req.orgId, req.params.endpointId);
      if (!ok) return res.status(404).json({ error: 'endpoint_not_found' });
      res.json({ success: true, endpoint_id: req.params.endpointId });
    } catch (error) {
      console.error('[Platform] Delete webhook endpoint failed:', error.message);
      res.status(500).json({ error: 'server_error' });
    }
  });

  // GET /api/v1/platform/webhooks/deliveries
  app.get('/api/v1/platform/webhooks/deliveries', requireApiKey, requireScope('webhook:manage'), async (req, res) => {
    try {
      const deliveries = await listDeliveries(getDb(), req.orgId, { limit: req.query?.limit });
      res.json({ deliveries });
    } catch (error) {
      console.error('[Platform] List deliveries failed:', error.message);
      res.status(500).json({ error: 'server_error' });
    }
  });

  // POST /api/v1/platform/webhooks/test — synthetic event
  app.post('/api/v1/platform/webhooks/test', smallJson, requireApiKey, requireScope('webhook:manage'), async (req, res) => {
    try {
      const eventType = req.body?.event || 'timestamp.created';
      await emitWebhookEvent(getDb(), {
        orgId: req.orgId,
        type: eventType,
        data: {
          test: true,
          message: 'Synthetic webhook test from OTRUST developer portal',
          org_id: req.orgId
        }
      });
      res.json({ success: true, event: eventType });
    } catch (error) {
      console.error('[Platform] Webhook test failed:', error.message);
      res.status(500).json({ error: 'server_error' });
    }
  });
}