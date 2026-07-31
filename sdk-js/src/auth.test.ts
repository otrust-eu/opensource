import { afterEach, describe, it, expect, vi } from 'vitest';
import { auth, configure } from './index';

describe('auth service', () => {
  afterEach(() => {
    configure({ baseUrl: 'https://www.otrust.eu' });
    vi.restoreAllMocks();
  });

  describe('loginUrl compatibility method', () => {
    it('should validate required clientId', () => {
      const result = auth.loginUrl({
        clientId: '',
        redirectUri: 'https://myapp.com/callback',
      });

      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.error.code).toBe('validation_error');
      }
    });

    it('should validate required redirectUri', () => {
      const result = auth.loginUrl({
        clientId: 'my-app',
        redirectUri: '',
      });

      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.error.code).toBe('validation_error');
      }
    });

    it('requires a server-created challenge instead of inventing a URL', () => {
      const result = auth.loginUrl({
        clientId: 'my-app',
        redirectUri: 'https://myapp.com/callback',
        scope: ['identity', 'email'],
        state: 'test-state',
      });

      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.error.code).toBe('server_challenge_required');
      }
    });
  });

  describe('parseCallback', () => {
    it('should parse callback URL with token', () => {
      const result = auth.parseCallback(
        'https://myapp.com/callback?token=auth_token_123&state=state_456'
      );

      expect(result).not.toBeNull();
      expect(result?.token).toBe('auth_token_123');
      expect(result?.state).toBe('state_456');
    });

    it('should return undefined for empty token', () => {
      const result = auth.parseCallback(
        'https://myapp.com/callback?state=state_456'
      );
      
      expect(result?.token).toBeUndefined();
    });
  });

  describe('generateState', () => {
    it('should generate random state string', () => {
      const state1 = auth.generateState();
      const state2 = auth.generateState();

      expect(state1).toHaveLength(32); // Hex encoded 16 bytes
      expect(state1).not.toBe(state2);
    });
  });

  describe('createChallenge validation', () => {
    it('should validate required clientId', async () => {
      const result = await auth.createChallenge({
        clientId: '',
        redirectUri: 'https://myapp.com/callback',
      });

      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.error.code).toBe('validation_error');
      }
    });

    it('should validate required redirectUri', async () => {
      const result = await auth.createChallenge({
        clientId: 'my-app',
        redirectUri: '',
      });

      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.error.code).toBe('validation_error');
      }
    });

    it('uses the server-issued login URL and generates state when omitted', async () => {
      const fetchMock = vi.fn().mockResolvedValue(new Response(
        JSON.stringify({
          success: true,
          challengeId: 'ch_test',
          challenge: 'a'.repeat(64),
          loginUrl: 'https://www.otrust.eu/auth/login?challenge=ch_test',
          expiresIn: 300,
        }),
        { status: 200, headers: { 'Content-Type': 'application/json' } }
      ));
      configure({
        baseUrl: 'https://www.otrust.eu',
        fetch: fetchMock as typeof fetch,
        retries: 0,
      });

      const result = await auth.createChallenge({
        clientId: 'my-app',
        redirectUri: 'https://my-app.example/auth/callback',
      });

      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.value.loginUrl).toBe(
          'https://www.otrust.eu/auth/login?challenge=ch_test'
        );
      }
      const body = JSON.parse(String(fetchMock.mock.calls[0][1]?.body));
      expect(body.clientId).toBe('my-app');
      expect(body.redirectUri).toBe('https://my-app.example/auth/callback');
      expect(body.state).toMatch(/^[a-f0-9]{32}$/);
    });
  });
});
