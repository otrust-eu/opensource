import crypto from 'crypto';

const TTL_MS = 24 * 60 * 60 * 1000;
const KEY_PATTERN = /^[a-zA-Z0-9._-]{8,128}$/;
const WRITE_METHODS = new Set(['POST', 'PUT', 'PATCH']);

function stableValue(value) {
  if (Array.isArray(value)) {
    return value.map(stableValue);
  }
  if (value && typeof value === 'object') {
    return Object.fromEntries(
      Object.keys(value).sort().map((key) => [key, stableValue(value[key])])
    );
  }
  return value;
}

function requestHash(req) {
  const payload = {
    method: req.method,
    path: req.path,
    query: stableValue(req.query || {}),
    body: stableValue(req.body ?? null)
  };
  return crypto.createHash('sha256').update(JSON.stringify(payload)).digest('hex');
}

function idempotencyKey(req) {
  const raw = req.get('Idempotency-Key');
  if (raw === undefined) return { present: false, value: null };
  if (typeof raw !== 'string') return { present: true, value: null };

  const value = raw.trim();
  return {
    present: true,
    value: KEY_PATTERN.test(value) ? value : null
  };
}

function cacheKey(req, key) {
  const scope = req.orgId ? `org:${req.orgId}` : `ip:${req.ip || 'unknown'}`;
  return `${scope}:${req.method}:${req.path}:${key}`;
}

function existingDocument(result) {
  return result?.value || result || null;
}

function replayResponse(res, record) {
  res.setHeader('Idempotency-Replayed', 'true');
  for (const [header, value] of Object.entries(record.headers || {})) {
    res.setHeader(header, value);
  }
  return res.status(record.status_code || 200).json(record.response_body);
}

async function reserveKey(collection, reservation) {
  try {
    await collection.insertOne(reservation);
    return { acquired: true, record: reservation };
  } catch (error) {
    if (error?.code !== 11000) throw error;
  }

  const now = new Date();
  let existing = await collection.findOne({ key: reservation.key });
  if (existing?.expires_at && existing.expires_at <= now) {
    const takeover = existingDocument(await collection.findOneAndUpdate(
      { key: reservation.key, expires_at: { $lte: now } },
      { $set: reservation },
      { returnDocument: 'after' }
    ));
    if (takeover?.owner === reservation.owner) {
      return { acquired: true, record: takeover };
    }
    existing = await collection.findOne({ key: reservation.key });
  }

  return { acquired: false, record: existing };
}

export function createIdempotencyMiddleware({ getDb }) {
  return async (req, res, next) => {
    if (!WRITE_METHODS.has(req.method)) return next();

    const suppliedKey = idempotencyKey(req);
    if (!suppliedKey.present) return next();
    if (!suppliedKey.value) {
      return res.status(400).json({
        error: 'invalid_idempotency_key',
        message: 'Idempotency-Key must be 8-128 characters using letters, numbers, dot, underscore, or hyphen'
      });
    }

    const key = cacheKey(req, suppliedKey.value);
    const fingerprint = requestHash(req);
    const owner = crypto.randomUUID();
    const reservation = {
      key,
      request_hash: fingerprint,
      state: 'processing',
      owner,
      created_at: new Date(),
      expires_at: new Date(Date.now() + TTL_MS)
    };

    try {
      const collection = getDb().collection('idempotency_keys');
      const { acquired, record } = await reserveKey(collection, reservation);
      if (!acquired) {
        if (!record) {
          return res.status(503).json({
            error: 'idempotency_unavailable',
            message: 'Unable to establish idempotency state'
          });
        }
        if (record.request_hash && record.request_hash !== fingerprint) {
          return res.status(409).json({
            error: 'idempotency_conflict',
            message: 'This Idempotency-Key was already used with a different request'
          });
        }
        if (record.state === 'completed' || record.response_body !== undefined) {
          return replayResponse(res, record);
        }

        res.setHeader('Retry-After', '1');
        return res.status(409).json({
          error: 'idempotency_in_progress',
          message: 'A request with this Idempotency-Key is still processing'
        });
      }

      res.setHeader('Idempotency-Replayed', 'false');
      let responseHandled = false;
      const originalJson = res.json.bind(res);

      res.json = function(body) {
        if (responseHandled) return res;
        responseHandled = true;

        const statusCode = res.statusCode || 200;
        const cacheable = statusCode >= 200 && statusCode < 500;
        const headers = {};
        for (const header of ['Location', 'ETag']) {
          const value = res.getHeader(header);
          if (value !== undefined) headers[header] = value;
        }

        const operation = cacheable
          ? collection.updateOne(
              { key, owner },
              {
                $set: {
                  state: 'completed',
                  status_code: statusCode,
                  response_body: body,
                  headers,
                  completed_at: new Date(),
                  expires_at: new Date(Date.now() + TTL_MS)
                }
              }
            )
          : collection.deleteOne({ key, owner });

        operation
          .then(() => originalJson(body))
          .catch(async (error) => {
            console.error('[Idempotency] Finalization failed:', error.message);
            await collection.deleteOne({ key, owner }).catch(() => {});
            originalJson(body);
          });
        return res;
      };

      res.once('finish', () => {
        if (!responseHandled) {
          collection.deleteOne({ key, owner }).catch(() => {});
        }
      });

      return next();
    } catch (error) {
      console.error('[Idempotency] Middleware error:', error.message);
      return res.status(503).json({
        error: 'idempotency_unavailable',
        message: 'Idempotent processing is temporarily unavailable'
      });
    }
  };
}
