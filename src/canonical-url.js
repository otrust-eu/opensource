const OTRUST_PUBLIC_HOSTS = new Set(['otrust.eu', 'www.otrust.eu']);

function normalizeHostname(value) {
  if (typeof value !== 'string' || !value.trim()) return '';

  try {
    const url = new URL(value.includes('://') ? value : `https://${value}`);
    return url.hostname.toLowerCase().replace(/\.$/, '');
  } catch {
    return '';
  }
}

export function getProductionRedirectUrl({
  host,
  forwardedProto,
  originalUrl = '/',
  isProduction = false,
  canonicalHost = 'www.otrust.eu'
}) {
  if (!isProduction || !host) return null;

  const incomingHostname = normalizeHostname(host);
  const normalizedCanonicalHost = normalizeHostname(canonicalHost);
  const proto = String(forwardedProto || '').split(',')[0].trim().toLowerCase();
  const needsHttps = proto !== 'https';
  const needsCanonicalHost = (
    OTRUST_PUBLIC_HOSTS.has(incomingHostname) &&
    OTRUST_PUBLIC_HOSTS.has(normalizedCanonicalHost) &&
    incomingHostname !== normalizedCanonicalHost
  );

  if (!needsHttps && !needsCanonicalHost) return null;

  const redirectHost = needsCanonicalHost ? normalizedCanonicalHost : host;
  return `https://${redirectHost}${originalUrl}`;
}
