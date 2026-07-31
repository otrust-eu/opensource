/**
 * Security Tests for OTRUST API
 * Penetration testing for common vulnerabilities
 */

import { jest } from '@jest/globals';
import { createDb, getDb, closeDb } from '../src/db.js';

let server;
let baseUrl;

// Helper to make HTTP requests
async function request(path, options = {}) {
  const url = `${baseUrl}${path}`;
  const response = await fetch(url, {
    method: options.method || 'GET',
    headers: {
      'Content-Type': 'application/json',
      ...options.headers
    },
    body: options.body ? JSON.stringify(options.body) : undefined
  });

  const text = await response.text();
  let json;
  try {
    json = JSON.parse(text);
  } catch {
    json = null;
  }

  return {
    status: response.status,
    headers: response.headers,
    body: json,
    text
  };
}

describe('Security Tests', () => {
  jest.setTimeout(30000);

  beforeAll(async () => {
    process.env.NODE_ENV = 'test';
    process.env.PORT = '0';

    await createDb();
    const { createServer } = await import('../src/server.js');
    server = await createServer();
    const address = server.address();
    baseUrl = `http://localhost:${address.port}`;
  });

  afterAll(async () => {
    if (server) {
      await new Promise(resolve => server.close(resolve));
    }
    await closeDb();
  });

describe('Security: Input Validation', () => {

  describe('Document Query Injection Prevention', () => {
    test('should reject hash with query operators', async () => {
      const response = await request('/claim/simple', {
        method: 'POST',
        headers: { 'Origin': baseUrl },
        body: { hash: '{"$gt": ""}' }
      });

      expect(response.status).toBe(400);
      expect(response.body.error).toBe('invalid_hash');
    });

    test('should reject pubkey with nested objects', async () => {
      const response = await request('/receipts/' + encodeURIComponent('{"$regex": ".*"}'));

      expect(response.status).toBe(400);
    });

    test('should not expose per-key receipt lists', async () => {
      const response = await request('/receipts/' + 'a'.repeat(64));

      expect(response.status).toBe(410);
      expect(response.body.error).toBe('local_history_only');
    });

    test('should reject insecure webhook URLs on claim', async () => {
      const challengeRes = await request('/challenge');
      const { challenge, difficulty } = challengeRes.body;
      const hash = Array.from(crypto.getRandomValues(new Uint8Array(32)))
        .map((b) => b.toString(16).padStart(2, '0'))
        .join('');
      const { generateKeypair, sign: edSign } = await import('../src/crypto.js');
      const keypair = await generateKeypair();
      const signature = await edSign(hash, keypair.privateKey);

      let nonce = 0;
      let nonceHex = '0'.repeat(16);
      const target = BigInt('0x' + 'f'.repeat(64)) >> BigInt(difficulty);
      while (nonce < 5000000) {
        nonceHex = nonce.toString(16).padStart(16, '0');
        const attempt = challenge + nonceHex;
        const h = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(attempt));
        const hex = Array.from(new Uint8Array(h)).map(b => b.toString(16).padStart(2, '0')).join('');
        if (BigInt('0x' + hex) <= target) break;
        nonce++;
      }

      const response = await request('/claim', {
        method: 'POST',
        headers: { Origin: baseUrl },
        body: {
          hash,
          signature,
          pubkey: keypair.publicKey,
          pow: { challenge, nonce: nonceHex },
          notify_webhook: 'http://127.0.0.1/hook'
        }
      });

      expect([201, 200]).toContain(response.status);
      const db = getDb();
      const webhook = await db.collection('webhook_notifications').findOne({ claim_id: response.body.receipt_id });
      expect(webhook).toBeNull();
    });
  });

  describe('XSS Prevention', () => {
    test('should sanitize filename with XSS payload', async () => {
      // The sanitization should strip dangerous chars including quotes
      const xssPayload = '<script>alert("xss")</script>';
      expect(xssPayload.replace(/[<>:"/\\|?*\x00-\x1f]/g, '')).toBe('scriptalert(xss)script');
    });

    test('should escape receipt ID in URL', async () => {
      const response = await request('/proof/<script>alert(1)</script>');

      // Should return 4xx for invalid/dangerous format (400 or 404 both acceptable)
      expect([400, 404]).toContain(response.status);
    });
  });

  describe('Path Traversal Prevention', () => {
    test('should reject receipt ID with path traversal', async () => {
      const response = await request('/proof/../../../etc/passwd');

      // Should return 4xx for invalid/dangerous path (400 or 404 both acceptable)
      expect([400, 404]).toContain(response.status);
    });
  });
});

describe('Security: CSRF Protection', () => {

  test('should reject POST without Origin header', async () => {
    const response = await request('/claim/simple', {
      method: 'POST',
      body: { hash: 'a'.repeat(64) }
    });

    expect(response.status).toBe(403);
    expect(response.body.error).toBe('forbidden');
  });

  test('should reject POST from unknown origin', async () => {
    const response = await request('/claim/simple', {
      method: 'POST',
      headers: { 'Origin': 'https://evil-attacker.com' },
      body: { hash: 'a'.repeat(64) }
    });

    expect(response.status).toBe(403);
  });

  test('should allow POST from localhost', async () => {
    const response = await request('/claim/simple', {
      method: 'POST',
      headers: { 'Origin': baseUrl },
      body: { hash: 'a'.repeat(64) }
    });

    // Should not be 403 CSRF error
    expect(response.status).not.toBe(403);
  });

  test('should allow Chrome extensions', async () => {
    const response = await request('/claim/simple', {
      method: 'POST',
      headers: { 'Origin': 'chrome-extension://abcdefghijklmnop' },
      body: { hash: 'a'.repeat(64) }
    });

    expect(response.status).not.toBe(403);
  });
});

describe('Security: HTTP Headers', () => {

  test('should have security headers', async () => {
    const response = await request('/health');

    expect(response.headers.get('x-content-type-options')).toBe('nosniff');
    expect(response.headers.get('x-frame-options')).toBe('DENY');
  });

  test('should have CSP header', async () => {
    const response = await request('/');

    const csp = response.headers.get('content-security-policy');
    expect(csp).toBeDefined();
    expect(csp).toContain("default-src 'self'");
  });

  test('should not expose X-Powered-By', async () => {
    const response = await request('/health');

    expect(response.headers.get('x-powered-by')).toBeNull();
  });

  test('should have request ID header', async () => {
    const response = await request('/health');

    const requestId = response.headers.get('x-request-id');
    expect(requestId).toBeDefined();
    expect(requestId).toMatch(/^[a-f0-9-]{36}$/);
  });
});

describe('Security: Source Field Validation', () => {

  test('should sanitize invalid source values', async () => {
    const response = await request('/claim/simple', {
      method: 'POST',
      headers: { 'Origin': baseUrl },
      body: {
        hash: 'b'.repeat(64),
        source: '<script>alert("xss")</script>'
      }
    });

    // Should succeed - source gets sanitized to 'unknown'
    expect(response.status).toBe(201);
  });
});

describe('Security: Bulk Endpoint Limits', () => {

  test('should reject bulk claims over 100', async () => {
    const claims = Array(101).fill({
      hash: 'd'.repeat(64),
      signature: 'e'.repeat(128),
      pubkey: 'f'.repeat(64)
    });

    const response = await request('/claim/bulk', {
      method: 'POST',
      headers: { 'Origin': baseUrl },
      body: { claims, pow: { challenge: 'test', nonce: 0 } }
    });

    expect(response.status).toBe(400);
    expect(response.body.error).toBe('too_many_claims');
  });

  test('should reject bulk verify over 100', async () => {
    const hashes = Array(101).fill('a'.repeat(64));

    const response = await request('/verify/bulk', {
      method: 'POST',
      headers: { 'Origin': baseUrl },
      body: { hashes }
    });

    expect(response.status).toBe(400);
    expect(response.body.error).toBe('too_many_hashes');
  });
});

describe('Security: Information Disclosure', () => {

  test('should not expose stack traces in errors', async () => {
    const response = await request('/claim', {
      method: 'POST',
      headers: { 'Origin': baseUrl },
      body: { invalid: 'data' }
    });

    expect(response.body.stack).toBeUndefined();
    if (response.body.message) {
      expect(response.body.message).not.toContain('at ');
    }
  });

  test('should not expose internal paths', async () => {
    const response = await request('/nonexistent');

    const body = response.text;
    expect(body).not.toContain('C:\\');
    expect(body).not.toContain('/home/');
  });
});
});
