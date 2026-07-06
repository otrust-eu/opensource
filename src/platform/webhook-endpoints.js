import crypto from 'crypto';
import { isValidWebhookEvent, WEBHOOK_EVENTS } from './webhook-events.js';

export function isValidWebhookUrl(url) {
  if (typeof url !== 'string' || url.length > 2048) return false;
  try {
    const parsed = new URL(url);
    if (parsed.protocol !== 'https:') return false;
    const host = parsed.hostname.toLowerCase();
    if (host === 'localhost' || host.endsWith('.local') || host.endsWith('.internal')) return false;
    if (host === '0.0.0.0' || host === '::1' || host === '[::1]') return false;
    if (/^127\./.test(host) || /^10\./.test(host) || /^192\.168\./.test(host)) return false;
    if (/^172\.(1[6-9]|2\d|3[0-1])\./.test(host)) return false;
    if (host.endsWith('.localhost')) return false;
    return true;
  } catch {
    return false;
  }
}

export function generateEndpointId() {
  return `whe_${crypto.randomBytes(10).toString('hex')}`;
}

export async function createWebhookEndpoint(db, orgId, { url, secret, events, label }) {
  if (!isValidWebhookUrl(url)) return { error: 'invalid_url' };

  const eventList = Array.isArray(events) && events.length
    ? [...new Set(events.filter((e) => isValidWebhookEvent(e)))]
    : [...WEBHOOK_EVENTS];

  if (!eventList.length) return { error: 'invalid_events' };

  const safeSecret = typeof secret === 'string' && secret.length > 0 && secret.length <= 256
    ? secret
    : crypto.randomBytes(24).toString('hex');

  const doc = {
    endpoint_id: generateEndpointId(),
    org_id: orgId,
    url,
    secret: safeSecret,
    events: eventList,
    label: String(label || 'default').trim().slice(0, 80) || 'default',
    enabled: true,
    created_at: new Date(),
    updated_at: new Date()
  };

  await db.collection('webhook_endpoints').insertOne(doc);

  return {
    endpoint: {
      endpoint_id: doc.endpoint_id,
      org_id: orgId,
      url: doc.url,
      events: doc.events,
      label: doc.label,
      enabled: doc.enabled,
      created_at: doc.created_at
    },
    secret: safeSecret
  };
}

export async function listWebhookEndpoints(db, orgId) {
  const rows = await db.collection('webhook_endpoints')
    .find({ org_id: orgId, enabled: { $ne: false } })
    .sort({ created_at: -1 })
    .toArray();

  return rows.map((r) => ({
    endpoint_id: r.endpoint_id,
    org_id: r.org_id,
    url: r.url,
    events: r.events,
    label: r.label,
    enabled: r.enabled !== false,
    created_at: r.created_at,
    updated_at: r.updated_at
  }));
}

export async function deleteWebhookEndpoint(db, orgId, endpointId) {
  const result = await db.collection('webhook_endpoints').updateOne(
    { endpoint_id: endpointId, org_id: orgId },
    { $set: { enabled: false, updated_at: new Date() } }
  );
  return result.modifiedCount > 0;
}

export async function findEndpointsForEvent(db, orgId, eventType) {
  if (!orgId) return [];
  const rows = await db.collection('webhook_endpoints')
    .find({ org_id: orgId, enabled: { $ne: false } })
    .toArray();
  return rows.filter((row) => Array.isArray(row.events) && row.events.includes(eventType));
}