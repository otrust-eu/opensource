/**
 * API key scopes for platform integrations.
 */

export const ALL_SCOPES = [
  'timestamp:write',
  'timestamp:read',
  'sign:write',
  'sign:read',
  'webhook:manage',
  'auth:challenge'
];

export const DEFAULT_SCOPES = [
  'timestamp:write',
  'timestamp:read',
  'sign:write',
  'sign:read'
];

export function normalizeScopes(scopes) {
  if (!Array.isArray(scopes) || scopes.length === 0) {
    return [...DEFAULT_SCOPES];
  }
  const unique = [...new Set(scopes.map((s) => String(s).trim()).filter(Boolean))];
  const invalid = unique.filter((s) => !ALL_SCOPES.includes(s));
  if (invalid.length) {
    return { error: 'invalid_scope', invalid };
  }
  return unique;
}

export function hasScope(granted, required) {
  if (!required) return true;
  if (!Array.isArray(granted) || granted.length === 0) return false;
  return granted.includes(required);
}