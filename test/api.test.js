/**
 * Integration tests for API endpoints
 * Tests actual HTTP requests against the server
 */

import { jest } from '@jest/globals';
import { createDb, getDb, closeDb } from '../src/db.js';
import { generateKeypair, sign, hash, solvePow } from '../src/crypto.js';

// We'll test the actual server - need to import and start it
let server;
let baseUrl;

// Helper to make HTTP requests
async function request(path, options = {}) {
  const url = `${baseUrl}${path}`;
  const response = await fetch(url, {
    method: options.method || 'GET',
    headers: {
      'Content-Type': 'application/json',
      'Origin': baseUrl, // Required for CSRF protection
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
    body: json,
    text
  };
}

describe('API Integration Tests', () => {
  jest.setTimeout(30000); // 30 second timeout per test
  
  beforeAll(async () => {
    // Set test environment
    process.env.NODE_ENV = 'test';
    process.env.PORT = '0'; // Random port
    process.env.MONGODB_URL = process.env.TEST_MONGODB_URL || 'mongodb://localhost:27017';
    process.env.MONGODB_DB = 'otrust_test';
    
    // Start database
    await createDb();
    
    // Import and start server
    const { startServer } = await import('../src/server.js');
    server = await startServer();
    const address = server.address();
    baseUrl = `http://localhost:${address.port}`;
  }, 30000);

  afterAll(async () => {
    if (server) {
      try {
        await new Promise((resolve, reject) => {
          const timeout = setTimeout(() => reject(new Error('Server close timeout')), 5000);
          server.close(() => {
            clearTimeout(timeout);
            resolve();
          });
        });
      } catch (e) {
        console.error('Server close error:', e.message);
        if (server) server.destroy?.();
      }
    }
    
    // Clean up test database
    try {
      const db = getDb();
      await db.collection('claims').deleteMany({});
      await db.collection('pow_challenges').deleteMany({});
      await db.collection('email_notifications').deleteMany({});
    } catch (e) {
      console.error('Database cleanup error:', e.message);
    }
    
    try {
      await closeDb();
    } catch (e) {
      console.error('Database close error:', e.message);
    }
  }, 10000);

  describe('GET /health', () => {
    test('returns healthy status', async () => {
      const res = await request('/health');
      
      expect(res.status).toBe(200);
      expect(res.body.status).toBe('ok');
      expect(res.body.claims).toBeDefined();
    });
  });

  describe('GET /challenge', () => {
    test('returns a valid challenge', async () => {
      const res = await request('/challenge');
      
      expect(res.status).toBe(200);
      expect(res.body.challenge).toHaveLength(64);
      // In test mode difficulty is lower (4-8 bits), in production >= 16
      expect(res.body.difficulty).toBeGreaterThanOrEqual(4);
      expect(res.body.expires).toBeDefined();
    });

    test('returns unique challenges', async () => {
      const res1 = await request('/challenge');
      const res2 = await request('/challenge');
      
      expect(res1.body.challenge).not.toBe(res2.body.challenge);
    });
  });

  describe('POST /claim', () => {
    let keypair;
    let testHash;
    let challenge;

    beforeEach(async () => {
      keypair = generateKeypair('ed25519');
      testHash = hash('test content ' + Date.now());
      
      // Get a fresh challenge
      const res = await request('/challenge');
      challenge = res.body;
      // Ensure difficulty is defined - use low default for tests
      if (challenge.difficulty === undefined) {
        challenge.difficulty = 4;
      }
    });

    test('creates a new timestamp claim', async () => {
      const signature = await sign(testHash, keypair.privateKey);
      const nonce = solvePow(challenge.challenge, challenge.difficulty || 4);
      
      const res = await request('/claim', {
        method: 'POST',
        body: {
          hash: testHash,
          signature,
          pubkey: keypair.publicKey,
          pow: {
            challenge: challenge.challenge,
            nonce
          }
        }
      });
      
      expect(res.status).toBe(201);
      expect(res.body.receipt_id).toBeDefined();
      expect(res.body.timestamp).toBeDefined();
    });

    test('stores notify_email for Bitcoin confirmation alerts', async () => {
      const signature = await sign(testHash, keypair.privateKey);
      const nonce = solvePow(challenge.challenge, challenge.difficulty || 4);
      const email = `notify-${Date.now()}@example.com`;

      const res = await request('/claim', {
        method: 'POST',
        body: {
          hash: testHash,
          signature,
          pubkey: keypair.publicKey,
          notify_email: email,
          pow: {
            challenge: challenge.challenge,
            nonce
          }
        }
      });

      expect(res.status).toBe(201);
      const db = getDb();
      const notification = await db.collection('email_notifications').findOne({ claim_id: res.body.receipt_id });
      expect(notification?.email).toBe(email);
    });

    test('rejects invalid hash', async () => {
      const res = await request('/claim', {
        method: 'POST',
        body: {
          hash: 'invalid',
          signature: 'a'.repeat(128),
          pubkey: keypair.publicKey,
          pow: { challenge: challenge.challenge, nonce: '0' }
        }
      });
      
      expect(res.status).toBe(400);
      expect(res.body.error).toBe('invalid_hash');
    });

    test('rejects invalid signature format', async () => {
      const res = await request('/claim', {
        method: 'POST',
        body: {
          hash: testHash,
          signature: 'short',
          pubkey: keypair.publicKey,
          pow: { challenge: challenge.challenge, nonce: '0' }
        }
      });
      
      expect(res.status).toBe(400);
      expect(res.body.error).toBe('invalid_signature');
    });

    test('rejects invalid pubkey', async () => {
      const res = await request('/claim', {
        method: 'POST',
        body: {
          hash: testHash,
          signature: 'a'.repeat(128),
          pubkey: 'invalid',
          pow: { challenge: challenge.challenge, nonce: '0' }
        }
      });
      
      expect(res.status).toBe(400);
      expect(res.body.error).toBe('invalid_pubkey');
    });

    test('rejects missing PoW', async () => {
      const res = await request('/claim', {
        method: 'POST',
        body: {
          hash: testHash,
          signature: 'a'.repeat(128),
          pubkey: keypair.publicKey
        }
      });
      
      expect(res.status).toBe(400);
      expect(res.body.error).toBe('invalid_pow');
    });

    test('rejects invalid PoW nonce', async () => {
      const signature = await sign(testHash, keypair.privateKey);
      
      const res = await request('/claim', {
        method: 'POST',
        body: {
          hash: testHash,
          signature,
          pubkey: keypair.publicKey,
          pow: {
            challenge: challenge.challenge,
            nonce: 'invalid_nonce_xxx' // Invalid format
          }
        }
      });
      
      expect(res.status).toBe(400);
      expect(res.body.error).toBe('invalid_pow');
    });

    test('rejects wrong signature for hash', async () => {
      const differentHash = hash('different content');
      const signature = await sign(differentHash, keypair.privateKey);
      const nonce = solvePow(challenge.challenge, challenge.difficulty || 4);
      
      const res = await request('/claim', {
        method: 'POST',
        body: {
          hash: testHash, // Different from what was signed
          signature,
          pubkey: keypair.publicKey,
          pow: {
            challenge: challenge.challenge,
            nonce
          }
        }
      });
      
      expect(res.status).toBe(400);
      expect(res.body.error).toBe('invalid_signature');
    });

    test('returns existing claim on duplicate', async () => {
      const signature = await sign(testHash, keypair.privateKey);
      const nonce = solvePow(challenge.challenge, challenge.difficulty || 4);
      
      // First claim
      const res1 = await request('/claim', {
        method: 'POST',
        body: {
          hash: testHash,
          signature,
          pubkey: keypair.publicKey,
          pow: { challenge: challenge.challenge, nonce }
        }
      });
      
      expect(res1.status).toBe(201);
      const receiptId = res1.body.receipt_id;
      
      // Get new challenge for second attempt
      const challenge2Res = await request('/challenge');
      const challenge2 = challenge2Res.body;
      const nonce2 = solvePow(challenge2.challenge, challenge2.difficulty || 4);
      
      // Second claim (same hash + pubkey)
      const res2 = await request('/claim', {
        method: 'POST',
        body: {
          hash: testHash,
          signature,
          pubkey: keypair.publicKey,
          pow: { challenge: challenge2.challenge, nonce: nonce2 }
        }
      });
      
      expect(res2.status).toBe(200);
      expect(res2.body.status).toBe('already_registered');
      expect(res2.body.receipt_id).toBe(receiptId);
    });
  });

  describe('POST /claim/simple', () => {
    test('creates claim without PoW for trusted sources', async () => {
      const testHash = hash('simple claim test ' + Date.now());
      
      const res = await request('/claim/simple', {
        method: 'POST',
        body: {
          hash: testHash,
          source: 'google-workspace'
        }
      });
      
      expect(res.status).toBe(201);
      expect(res.body.receipt_id).toBeDefined();
    });

    test('rejects invalid hash', async () => {
      const res = await request('/claim/simple', {
        method: 'POST',
        body: {
          hash: 'invalid',
          source: 'test'
        }
      });
      
      expect(res.status).toBe(400);
      expect(res.body.error).toBe('invalid_hash');
    });

    test('stores notify_email for Bitcoin confirmation alerts', async () => {
      const testHash = hash('simple notify email ' + Date.now());
      const email = `notify-simple-${Date.now()}@example.com`;

      const res = await request('/claim/simple', {
        method: 'POST',
        body: {
          hash: testHash,
          source: 'email',
          notify_email: email
        }
      });

      expect(res.status).toBe(201);
      const db = getDb();
      const notification = await db.collection('email_notifications').findOne({ claim_id: res.body.receipt_id });
      expect(notification?.email).toBe(email);
    });
  });

  describe('POST /verify/bulk', () => {
    test('verifies multiple hashes', async () => {
      // Create a claim first
      const testHash = hash('bulk verify test ' + Date.now());
      await request('/claim/simple', {
        method: 'POST',
        body: { hash: testHash, source: 'test' }
      });
      
      const unknownHash = hash('unknown content');
      
      const res = await request('/verify/bulk', {
        method: 'POST',
        body: {
          hashes: [testHash, unknownHash]
        }
      });
      
      expect(res.status).toBe(200);
      expect(res.body.results).toHaveLength(2);
      expect(res.body.results[0].status).toBe('found');
      expect(res.body.results[1].status).toBe('not_found');
    });

    test('rejects more than 100 hashes', async () => {
      const res = await request('/verify/bulk', {
        method: 'POST',
        body: {
          hashes: Array(101).fill('a'.repeat(64))
        }
      });
      
      expect(res.status).toBe(400);
    });

    test('marks invalid hashes in results', async () => {
      const res = await request('/verify/bulk', {
        method: 'POST',
        body: {
          hashes: ['invalid', 'a'.repeat(64)]
        }
      });
      
      expect(res.status).toBe(200);
      expect(res.body.results[0].status).toBe('invalid_hash');
    });
  });

  describe('POST /verify', () => {
    test('returns claim info for existing hash', async () => {
      const testHash = hash('verify endpoint test ' + Date.now());
      
      // Create claim first
      await request('/claim/simple', {
        method: 'POST',
        body: { hash: testHash, source: 'test' }
      });
      
      const res = await request('/verify', {
        method: 'POST',
        body: { hash: testHash }
      });
      
      expect(res.status).toBe(200);
      expect(res.body.status).toBe('found');
      expect(res.body.hash).toBe(testHash);
    });

    test('returns not found for unknown hash', async () => {
      const unknownHash = hash('definitely unknown ' + Date.now());
      
      const res = await request('/verify', {
        method: 'POST',
        body: { hash: unknownHash }
      });
      
      expect(res.status).toBe(200);
      expect(res.body.status).toBe('not_found');
    });

    test('rejects invalid hash format', async () => {
      const res = await request('/verify', {
        method: 'POST',
        body: { hash: 'invalid-hash' }
      });
      
      expect(res.status).toBe(400);
      expect(res.body.error).toBe('invalid_hash');
    });
  });

  describe('API v1 compatibility aliases', () => {
    test('supports timestamp challenge, simple claim, verify, and proof aliases', async () => {
      const challengeRes = await request('/api/v1/timestamp/challenge');
      expect(challengeRes.status).toBe(200);
      expect(challengeRes.body.challenge).toHaveLength(64);

      const testHash = hash('api v1 alias test ' + Date.now());
      const claimRes = await request('/api/v1/timestamp/claim/simple', {
        method: 'POST',
        body: { hash: testHash, source: 'test' }
      });
      expect(claimRes.status).toBe(201);
      expect(claimRes.body.receipt_id).toBeDefined();

      const verifyRes = await request('/api/v1/timestamp/verify', {
        method: 'POST',
        body: { hash: testHash }
      });
      expect(verifyRes.status).toBe(200);
      expect(verifyRes.body.status).toBe('found');

      const proofRes = await request(`/api/v1/timestamp/proof/${claimRes.body.receipt_id}`);
      expect(proofRes.status).toBe(200);
      expect(proofRes.body.hash).toBe(testHash);
    });
  });

  describe('GET /proof/:id', () => {
    test('returns proof page when Accept header is text/html', async () => {
      const testHash = hash('proof test ' + Date.now());
      
      const claimRes = await request('/claim/simple', {
        method: 'POST',
        body: { hash: testHash, source: 'test' }
      });
      
      const receiptId = claimRes.body.receipt_id;
      const res = await request(`/proof/${receiptId}`, {
        headers: { 'Accept': 'text/html' }
      });
      
      expect(res.status).toBe(200);
      // Should return HTML when Accept: text/html
      expect(res.text).toContain('<!DOCTYPE html>');
    });

    test('returns JSON by default', async () => {
      const testHash = hash('proof json test ' + Date.now());
      
      const claimRes = await request('/claim/simple', {
        method: 'POST',
        body: { hash: testHash, source: 'test' }
      });
      
      const receiptId = claimRes.body.receipt_id;
      const res = await request(`/proof/${receiptId}`);
      
      expect(res.status).toBe(200);
      expect(res.body.hash).toBe(testHash);
      expect(res.body.receipt_id).toBe(receiptId);
    });

    test('returns JSON with format=json query param', async () => {
      const testHash = hash('proof format test ' + Date.now());
      
      const claimRes = await request('/claim/simple', {
        method: 'POST',
        body: { hash: testHash, source: 'test' }
      });
      
      const receiptId = claimRes.body.receipt_id;
      const res = await request(`/proof/${receiptId}?format=json`);
      
      expect(res.status).toBe(200);
      expect(res.body.hash).toBe(testHash);
    });

    test('returns 404 for unknown receipt', async () => {
      const res = await request('/proof/unknown_receipt_id');
      
      expect(res.status).toBe(404);
    });

    test('returns proof-view HTML for prf_* attribute proof share URLs', async () => {
      const ageRes = await request('/api/proof/age', {
        method: 'POST',
        body: { birthDate: '1990-06-15', minAge: 18 }
      });

      expect(ageRes.status).toBe(200);
      expect(ageRes.body.success).toBe(true);
      expect(ageRes.body.proofId).toMatch(/^prf_/);

      const viewRes = await request(`/proof/${ageRes.body.proofId}`, {
        headers: { Accept: 'text/html' }
      });

      expect(viewRes.status).toBe(200);
      expect(viewRes.text).toContain('<!DOCTYPE html>');
      expect(viewRes.text).toContain('OTRUST');
    });
  });
});
