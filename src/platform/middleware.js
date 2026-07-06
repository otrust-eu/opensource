import { resolveApiKey, isValidApiKeyFormat } from './api-keys.js';
import { hasScope } from './scopes.js';

function extractRawApiKey(req) {
  const header = req.get('Authorization');
  if (typeof header === 'string' && header.toLowerCase().startsWith('bearer ')) {
    return header.slice(7).trim();
  }
  const direct = req.get('X-OTRUST-Key');
  if (typeof direct === 'string' && direct.trim()) {
    return direct.trim();
  }
  return null;
}

export function createApiKeyMiddleware({ getDb }) {
  return async (req, res, next) => {
    const rawKey = extractRawApiKey(req);
    if (!rawKey) {
      return next();
    }

    if (!isValidApiKeyFormat(rawKey)) {
      return res.status(401).json({
        error: 'invalid_api_key',
        message: 'API key format is invalid'
      });
    }

    try {
      const record = await resolveApiKey(getDb(), rawKey);
      if (!record) {
        return res.status(401).json({
          error: 'invalid_api_key',
          message: 'API key is invalid or revoked'
        });
      }

      req.orgId = record.org_id;
      req.apiKeyId = record.key_id;
      req.apiKeyScopes = record.scopes;
      req.apiKeyPrefix = record.prefix;
      req.apiKeyEnvironment = record.environment;
      return next();
    } catch (error) {
      console.error('[Platform] API key resolution failed:', error.message);
      return res.status(500).json({ error: 'server_error' });
    }
  };
}

export function requireApiKey(req, res, next) {
  if (!req.orgId) {
    return res.status(401).json({
      error: 'api_key_required',
      message: 'Provide Authorization: Bearer otrust_live_... or X-OTRUST-Key'
    });
  }
  return next();
}

export function requireScope(scope) {
  return (req, res, next) => {
    if (!req.orgId) {
      return res.status(401).json({ error: 'api_key_required' });
    }
    if (!hasScope(req.apiKeyScopes, scope)) {
      return res.status(403).json({
        error: 'insufficient_scope',
        required: scope
      });
    }
    return next();
  };
}