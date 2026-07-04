/**
 * API integration tests for public proof routes.
 */

import { jest } from '@jest/globals';
import { createDb, closeDb } from '../src/db.js';

let server;
let baseUrl;

async function request(path, options = {}) {
  const url = `${baseUrl}${path}`;
  const response = await fetch(url, {
    method: options.method || 'GET',
    headers: {
      'Content-Type': 'application/json',
      Origin: baseUrl,
      ...options.headers
    },
    body: options.body ? JSON.stringify(options.body) : undefined
  });

  const text = await response.text();
  let body = null;
  try {
    body = text ? JSON.parse(text) : null;
  } catch {
    body = null;
  }

  return { status: response.status, body, text };
}

describe('Proof share routes', () => {
  jest.setTimeout(30000);

  beforeAll(async () => {
    process.env.NODE_ENV = 'test';
    process.env.PORT = '0';
    process.env.MONGODB_URI = 'mongodb://localhost:27017';
    process.env.MONGODB_DB = 'otrust_test';

    await createDb();

    const { startServer } = await import('../src/server.js');
    server = await startServer(0);
    baseUrl = `http://127.0.0.1:${server.address().port}`;
  });

  afterAll(async () => {
    if (server) {
      await new Promise((resolve, reject) => {
        const timeout = setTimeout(() => reject(new Error('Server close timeout')), 5000);
        server.close(() => {
          clearTimeout(timeout);
          resolve();
        });
      });
    }
    await closeDb();
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

  test('returns proof-view HTML for id_* identity proof share URLs', async () => {
    const suffix = String(Math.floor(1000 + Math.random() * 8999));
    const identityRes = await request('/api/proof/identity', {
      method: 'POST',
      body: {
        personnummer: `19900615-${suffix}`,
        birthDate: '1990-06-15',
        pin: '847291',
        faceMatch: true,
        livenessVerified: true
      }
    });

    expect(identityRes.status).toBe(200);
    expect(identityRes.body.success).toBe(true);
    expect(identityRes.body.proofId).toMatch(/^id_/);

    const viewRes = await request(`/proof/${identityRes.body.proofId}`, {
      headers: { Accept: 'text/html' }
    });

    expect(viewRes.status).toBe(200);
    expect(viewRes.text).toContain('<!DOCTYPE html>');
    expect(viewRes.text).toContain('OTRUST');
  });
});