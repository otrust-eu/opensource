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

function isLocalHostname(hostname) {
  const value = String(hostname || '').replace(/^\[|\]$/g, '');
  if (
    value === 'localhost' ||
    value.endsWith('.localhost') ||
    value === 'host.docker.internal' ||
    value === '::1' ||
    value === '0.0.0.0' ||
    value.startsWith('127.')
  ) {
    return true;
  }

  const octets = value.split('.').map(Number);
  if (octets.length !== 4 || octets.some((part) => !Number.isInteger(part) || part < 0 || part > 255)) {
    return false;
  }

  return (
    octets[0] === 10 ||
    (octets[0] === 172 && octets[1] >= 16 && octets[1] <= 31) ||
    (octets[0] === 192 && octets[1] === 168)
  );
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
  const needsHttps = proto !== 'https' && !isLocalHostname(incomingHostname);
  const needsCanonicalHost = (
    OTRUST_PUBLIC_HOSTS.has(incomingHostname) &&
    OTRUST_PUBLIC_HOSTS.has(normalizedCanonicalHost) &&
    incomingHostname !== normalizedCanonicalHost
  );

  if (!needsHttps && !needsCanonicalHost) return null;

  const redirectHost = needsCanonicalHost ? normalizedCanonicalHost : host;
  return `https://${redirectHost}${originalUrl}`;
}
