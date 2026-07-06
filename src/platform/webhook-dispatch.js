import crypto from 'crypto';
import { buildWebhookEnvelope } from './webhook-events.js';
import { findEndpointsForEvent, isValidWebhookUrl } from './webhook-endpoints.js';

const RETRY_DELAYS_SEC = [60, 300, 1800, 7200, 86400];
const MAX_ATTEMPTS = RETRY_DELAYS_SEC.length + 1;

function baseUrl() {
  return process.env.BASE_URL || 'https://www.otrust.eu';
}

function signBody(secret, body) {
  const sig = crypto.createHmac('sha256', secret).update(body).digest('hex');
  return `sha256=${sig}`;
}

export async function storeWebhookNotification(db, claimId, webhookUrl, secret, createdAt = new Date()) {
  if (!db || !claimId || !isValidWebhookUrl(webhookUrl)) return false;
  const safeSecret = typeof secret === 'string' && secret.length > 0 && secret.length <= 256
    ? secret
    : null;
  await db.collection('webhook_notifications').insertOne({
    claim_id: claimId,
    url: webhookUrl,
    secret: safeSecret,
    created_at: createdAt
  });
  return true;
}

async function deliverOnce(url, secret, envelope) {
  const body = JSON.stringify(envelope);
  const headers = {
    'Content-Type': 'application/json',
    'User-Agent': 'OTRUST-Webhook/2.0',
    'X-OTRUST-Event': envelope.type,
    'X-OTRUST-Event-Id': envelope.id
  };
  if (secret) {
    headers['X-OTRUST-Signature'] = signBody(secret, body);
  }

  const res = await fetch(url, {
    method: 'POST',
    headers,
    body,
    signal: AbortSignal.timeout(10000)
  });

  return { ok: res.ok, status: res.status };
}

async function scheduleDelivery(db, { orgId, endpointId, url, secret = null, envelope }) {
  const deliveryId = `dlv_${crypto.randomBytes(10).toString('hex')}`;
  const now = new Date();

  await db.collection('webhook_deliveries').insertOne({
    delivery_id: deliveryId,
    event_id: envelope.id,
    event_type: envelope.type,
    org_id: orgId || null,
    endpoint_id: endpointId || null,
    url,
    secret: secret || null,
    status: 'pending',
    attempts: 0,
    response_code: null,
    next_retry_at: now,
    created_at: now,
    updated_at: now,
    envelope
  });

  return deliveryId;
}

export async function attemptDelivery(db, delivery) {
  const envelope = delivery.envelope;
  let secret = null;

  secret = delivery.secret || null;
  if (!secret && delivery.endpoint_id) {
    const endpoint = await db.collection('webhook_endpoints').findOne({ endpoint_id: delivery.endpoint_id });
    secret = endpoint?.secret || null;
  }

  if (!secret && delivery.claim_id) {
    const legacy = await db.collection('webhook_notifications').findOne({ claim_id: delivery.claim_id });
    secret = legacy?.secret || null;
  }

  try {
    const result = await deliverOnce(delivery.url, secret, envelope);
    const attempts = (delivery.attempts || 0) + 1;

    if (result.ok) {
      await db.collection('webhook_deliveries').updateOne(
        { delivery_id: delivery.delivery_id },
        {
          $set: {
            status: 'delivered',
            attempts,
            response_code: result.status,
            delivered_at: new Date(),
            updated_at: new Date()
          }
        }
      );
      if (delivery.claim_id) {
        await db.collection('webhook_notifications').deleteOne({ claim_id: delivery.claim_id });
      }
      return true;
    }

    return await markFailedAttempt(db, delivery, attempts, result.status);
  } catch (err) {
    const attempts = (delivery.attempts || 0) + 1;
    return markFailedAttempt(db, delivery, attempts, null, err.message);
  }
}

async function markFailedAttempt(db, delivery, attempts, responseCode = null, errorMessage = null) {
  const exhausted = attempts >= MAX_ATTEMPTS;
  const delaySec = RETRY_DELAYS_SEC[attempts - 1] || RETRY_DELAYS_SEC[RETRY_DELAYS_SEC.length - 1];
  const nextRetry = exhausted ? null : new Date(Date.now() + delaySec * 1000);

  await db.collection('webhook_deliveries').updateOne(
    { delivery_id: delivery.delivery_id },
    {
      $set: {
        status: exhausted ? 'failed' : 'retrying',
        attempts,
        response_code: responseCode,
        last_error: errorMessage,
        next_retry_at: nextRetry,
        updated_at: new Date()
      }
    }
  );

  if (exhausted && delivery.claim_id) {
    await db.collection('webhook_notifications').deleteOne({ claim_id: delivery.claim_id });
  }

  return false;
}

export async function emitWebhookEvent(db, { orgId, type, data, legacyClaimId, legacyUrl, legacySecret }) {
  if (!db || !type) return;

  const envelope = buildWebhookEnvelope(type, data);
  const targets = [];

  if (orgId) {
    const endpoints = await findEndpointsForEvent(db, orgId, type);
    for (const ep of endpoints) {
      targets.push({
        org_id: orgId,
        endpoint_id: ep.endpoint_id,
        url: ep.url,
        secret: ep.secret
      });
    }
  }

  if (legacyUrl && isValidWebhookUrl(legacyUrl)) {
    targets.push({
      org_id: orgId || null,
      endpoint_id: null,
      url: legacyUrl,
      secret: legacySecret,
      claim_id: legacyClaimId || null
    });
  } else if (legacyClaimId) {
    const legacy = await db.collection('webhook_notifications').findOne({ claim_id: legacyClaimId });
    if (legacy?.url) {
      targets.push({
        org_id: orgId || null,
        endpoint_id: null,
        url: legacy.url,
        secret: legacy.secret,
        claim_id: legacyClaimId
      });
    }
  }

  for (const target of targets) {
    const deliveryId = await scheduleDelivery(db, {
      orgId: target.org_id,
      endpointId: target.endpoint_id,
      url: target.url,
      secret: target.secret || null,
      envelope
    });

    const delivery = await db.collection('webhook_deliveries').findOne({ delivery_id: deliveryId });
    if (delivery) {
      delivery.claim_id = target.claim_id || null;
      await attemptDelivery(db, delivery);
    }
  }
}

export async function dispatchConfirmationWebhook(db, claim, blockHeight) {
  if (!db || !claim?.id) return;

  const data = {
    receipt_id: claim.id,
    hash: claim.hash,
    block_height: blockHeight,
    proof_url: `${baseUrl()}/proof/${claim.id}`,
    ots_url: `${baseUrl()}/proof/${claim.id}?format=ots`,
    confirmed_at: new Date().toISOString()
  };

  await emitWebhookEvent(db, {
    orgId: claim.org_id || null,
    type: 'timestamp.confirmed',
    data,
    legacyClaimId: claim.id
  });
}

export async function processWebhookRetries(db) {
  if (!db) return 0;

  const now = new Date();
  const pending = await db.collection('webhook_deliveries')
    .find({
      status: { $in: ['pending', 'retrying'] },
      next_retry_at: { $lte: now },
      attempts: { $lt: MAX_ATTEMPTS }
    })
    .limit(50)
    .toArray();

  let processed = 0;
  for (const delivery of pending) {
    await attemptDelivery(db, delivery);
    processed += 1;
  }
  return processed;
}

export async function listDeliveries(db, orgId, { limit = 50 } = {}) {
  const safeLimit = Math.min(Math.max(Number(limit) || 50, 1), 100);
  const rows = await db.collection('webhook_deliveries')
    .find({ org_id: orgId })
    .sort({ created_at: -1 })
    .limit(safeLimit)
    .toArray();

  return rows.map((r) => ({
    delivery_id: r.delivery_id,
    event_id: r.event_id,
    event_type: r.event_type,
    endpoint_id: r.endpoint_id,
    status: r.status,
    attempts: r.attempts,
    response_code: r.response_code,
    created_at: r.created_at,
    delivered_at: r.delivered_at,
    next_retry_at: r.next_retry_at
  }));
}