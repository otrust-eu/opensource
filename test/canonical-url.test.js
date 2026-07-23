import { getProductionRedirectUrl } from '../src/canonical-url.js';

describe('Production URL redirects', () => {
  test('redirects HTTP apex requests directly to the canonical HTTPS host', () => {
    expect(getProductionRedirectUrl({
      host: 'otrust.eu',
      forwardedProto: 'http',
      originalUrl: '/proof?id=123',
      isProduction: true
    })).toBe('https://www.otrust.eu/proof?id=123');
  });

  test('redirects HTTPS apex requests to the canonical host', () => {
    expect(getProductionRedirectUrl({
      host: 'otrust.eu',
      forwardedProto: 'https',
      originalUrl: '/',
      isProduction: true
    })).toBe('https://www.otrust.eu/');
  });

  test('does not redirect an HTTPS canonical request', () => {
    expect(getProductionRedirectUrl({
      host: 'www.otrust.eu',
      forwardedProto: 'https',
      originalUrl: '/',
      isProduction: true
    })).toBeNull();
  });

  test('keeps a self-hosted domain while upgrading it to HTTPS', () => {
    expect(getProductionRedirectUrl({
      host: 'trust.example.com',
      forwardedProto: 'http',
      originalUrl: '/timestamp',
      isProduction: true
    })).toBe('https://trust.example.com/timestamp');
  });

  test.each([
    'localhost:3000',
    '127.0.0.1:3000',
    '192.168.1.20:3000',
    '10.0.0.20:3000',
    '[::1]:3000'
  ])('keeps local self-hosting on HTTP for %s', (host) => {
    expect(getProductionRedirectUrl({
      host,
      forwardedProto: 'http',
      originalUrl: '/timestamp',
      isProduction: true
    })).toBeNull();
  });

  test('does not redirect outside production', () => {
    expect(getProductionRedirectUrl({
      host: 'otrust.eu',
      forwardedProto: 'http',
      originalUrl: '/',
      isProduction: false
    })).toBeNull();
  });
});
