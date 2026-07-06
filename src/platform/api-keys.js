import crypto from 'crypto';
import { DEFAULT_SCOPES, normalizeScopes } from './scopes.js';

const KEY_PREFIX_LIVE = 'otrust_live_';
const KEY_PREFIX_TEST = 'otrust_test_';
const KEY_RANDOM_BYTES = 24;

export function hashApiKey(rawKey) {
  return crypto.createHash('sha256').update(String(rawKey)).digest('hex');
}

export function isValidApiKeyFormat(rawKey) {
  if (typeof rawKey !== 'string') return false;
  if (rawKey.startsWith(KEY_PREFIX_LIVE) && rawKey.length >= KEY_PREFIX_LIVE.length + 16) {
    return /^otrust_live_[A-Za-z0-9_-]+$/.test(rawKey);
  }
  if (rawKey.startsWith(KEY_PREFIX_TEST) && rawKey.length >= KEY_PREFIX_TEST.length + 16) {
    return /^otrust_test_[A-Za-z0-9_-]+$/.test(rawKey);
  }
  return false;
}

function displayPrefix(rawKey) {
  return rawKey.slice(0, Math.min(rawKey.length, 18)) + '…';
}

export function generateApiKey(environment = 'live') {
  const env = environment === 'test' ? 'test' : 'live';
  const prefix = env === 'test' ? KEY_PREFIX_TEST : KEY_PREFIX_LIVE;
  const secret = crypto.randomBytes(KEY_RANDOM_BYTES).toString('base64url');
  const rawKey = `${prefix}${secret}`;
  return {
    rawKey,
    environment: env,
    prefix: displayPrefix(rawKey),
    key_id: `key_${crypto.randomBytes(10).toString('hex')}`
  };
}

export async function createApiKey(db, orgId, { label, scopes, environment } = {}) {
  const org = await db.collection('organizations').findOne({ id: orgId });
  if (!org) return { error: 'org_not_found' };

  const normalized = normalizeScopes(scopes);
  if (normalized.error) return normalized;

  const generated = generateApiKey(environment);
  const now = new Date();
  const doc = {
    key_id: generated.key_id,
    org_id: orgId,
    key_hash: hashApiKey(generated.rawKey),
    prefix: generated.prefix,
    environment: generated.environment,
    label: String(label || 'default').trim().slice(0, 80) || 'default',
    scopes: normalized,
    created_at: now,
    last_used_at: null,
    revoked_at: null
  };

  await db.collection('api_keys').insertOne(doc);

  return {
    api_key: {
      key_id: doc.key_id,
      org_id: orgId,
      prefix: doc.prefix,
      environment: doc.environment,
      label: doc.label,
      scopes: doc.scopes,
      created_at: doc.created_at
    },
    secret: generated.rawKey
  };
}

export async function resolveApiKey(db, rawKey) {
  if (!isValidApiKeyFormat(rawKey)) return null;

  const keyHash = hashApiKey(rawKey);
  const record = await db.collection('api_keys').findOne({
    key_hash: keyHash,
    revoked_at: null
  });

  if (!record) return null;

  await db.collection('api_keys').updateOne(
    { key_id: record.key_id },
    { $set: { last_used_at: new Date() } }
  ).catch(() => {});

  return {
    key_id: record.key_id,
    org_id: record.org_id,
    scopes: record.scopes || DEFAULT_SCOPES,
    prefix: record.prefix,
    environment: record.environment || 'live',
    label: record.label
  };
}

export async function listApiKeys(db, orgId) {
  const keys = await db.collection('api_keys')
    .find({ org_id: orgId, revoked_at: null })
    .sort({ created_at: -1 })
    .toArray();

  return keys.map((k) => ({
    key_id: k.key_id,
    org_id: k.org_id,
    prefix: k.prefix,
    environment: k.environment,
    label: k.label,
    scopes: k.scopes,
    created_at: k.created_at,
    last_used_at: k.last_used_at
  }));
}

export async function revokeApiKey(db, orgId, keyId) {
  const result = await db.collection('api_keys').updateOne(
    { key_id: keyId, org_id: orgId, revoked_at: null },
    { $set: { revoked_at: new Date() } }
  );
  return result.modifiedCount > 0;
}