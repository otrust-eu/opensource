import { closeDb } from '../../src/db.js';

export default async function globalSetup() {
  if (process.env.TEST_URL) return undefined;

  process.env.NODE_ENV = 'test';
  process.env.PORT = process.env.PORT || '8080';
  process.env.ADMIN_KEY = process.env.ADMIN_KEY || 'test-admin-key';
  process.env.AUTH_CLIENTS_JSON = process.env.AUTH_CLIENTS_JSON || JSON.stringify({
    e2e_partner: {
      redirectUris: ['https://example.com/callback']
    }
  });

  const { startServer } = await import('../../src/server.js');
  const server = await startServer(Number(process.env.PORT));

  return async () => {
    await new Promise((resolve, reject) => {
      const timeout = setTimeout(() => reject(new Error('E2E server close timeout')), 5000);
      server.close(() => {
        clearTimeout(timeout);
        resolve();
      });
    });
    await closeDb();
  };
}
