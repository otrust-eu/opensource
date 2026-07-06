import crypto from 'crypto';

const TTL_MS = 24 * 60 * 60 * 1000;

function cacheKey(req) {
  const scope = req.orgId ? `org:${req.orgId}` : `ip:${req.ip || 'unknown'}`;
  const idem = req.get('Idempotency-Key') || req.get('idempotency-key');
  if (!idem || typeof idem !== 'string') return null;
  const safe = idem.trim().slice(0, 128);
  if (!/^[a-zA-Z0-9._-]{8,128}$/.test(safe)) return null;
  return `${scope}:${req.method}:${req.path}:${safe}`;
}

export function createIdempotencyMiddleware({ getDb }) {
  return async (req, res, next) => {
    if (req.method !== 'POST' && req.method !== 'PUT') return next();

    const key = cacheKey(req);
    if (!key) return next();

    try {
      const db = getDb();
      const existing = await db.collection('idempotency_keys').findOne({ key });
      if (existing && existing.expires_at > new Date()) {
        res.status(existing.status_code || 200);
        if (existing.headers) {
          for (const [h, v] of Object.entries(existing.headers)) {
            res.setHeader(h, v);
          }
        }
        return res.json(existing.response_body);
      }

      const originalJson = res.json.bind(res);
      res.json = function (body) {
        const statusCode = res.statusCode || 200;
        if (statusCode >= 200 && statusCode < 500) {
          db.collection('idempotency_keys').updateOne(
            { key },
            {
              $set: {
                key,
                status_code: statusCode,
                response_body: body,
                headers: { 'Content-Type': 'application/json' },
                expires_at: new Date(Date.now() + TTL_MS),
                created_at: new Date()
              }
            },
            { upsert: true }
          ).catch(() => {});
        }
        return originalJson(body);
      };

      return next();
    } catch (error) {
      console.error('[Idempotency] Middleware error:', error.message);
      return next();
    }
  };
}