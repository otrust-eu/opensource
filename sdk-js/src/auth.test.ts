import { describe, it, expect } from 'vitest';
import { auth } from './index';

describe('auth service', () => {
  describe('loginUrl', () => {
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

    it('should generate valid login URL', () => {
      const result = auth.loginUrl({
        clientId: 'my-app',
        redirectUri: 'https://myapp.com/callback',
        scope: ['identity', 'email'],
        state: 'test-state',
      });

      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.value).toContain('client_id=my-app');
        expect(result.value).toContain('redirect_uri=');
        expect(result.value).toContain('scope=identity+email');
        expect(result.value).toContain('state=test-state');
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
  });
});
