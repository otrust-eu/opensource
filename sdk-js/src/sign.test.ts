import { describe, it, expect } from 'vitest';
import { sign } from './index';

describe('sign service', () => {
  describe('create validation', () => {
    it('should validate required title', async () => {
      const result = await sign.create('abc123def456', {
        title: '',
        creatorEmail: 'alice@example.com',
        parties: [{ email: 'bob@example.com', role: 'signer' }],
      });

      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.error.code).toBe('validation_error');
        expect(result.error.message).toContain('Title');
      }
    });

    it('should validate required creator email', async () => {
      const result = await sign.create('abc123def456', {
        title: 'Test Contract',
        creatorEmail: '',
        parties: [{ email: 'bob@example.com', role: 'signer' }],
      });

      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.error.code).toBe('validation_error');
        expect(result.error.message).toContain('email');
      }
    });

    it('should validate at least one party', async () => {
      const result = await sign.create('abc123def456', {
        title: 'Test Contract',
        creatorEmail: 'alice@example.com',
        parties: [],
      });

      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.error.code).toBe('validation_error');
        expect(result.error.message).toContain('party');
      }
    });
  });

  describe('Party types', () => {
    it('should accept valid party roles', () => {
      const party: sign.Party = {
        email: 'test@example.com',
        role: 'signer',
        name: 'Test User',
      };
      
      expect(party.role).toBe('signer');
    });

    it('should accept approver role', () => {
      const party: sign.Party = {
        email: 'test@example.com',
        role: 'approver',
      };
      
      expect(party.role).toBe('approver');
    });
  });
});
