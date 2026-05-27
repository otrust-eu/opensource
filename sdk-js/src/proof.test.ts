import { describe, it, expect } from 'vitest';
import { proof } from './index';

describe('proof service', () => {
  describe('identity validation', () => {
    it('should validate pin format when provided', async () => {
      const result = await proof.identity({
        personnummer: '19900101-1234',
        birthDate: '1990-01-01',
        pin: '12345', // Too short - invalid
      });

      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.error.code).toBe('invalid_pin');
      }
    });

    it('should accept valid 6-digit pin', async () => {
      // This will fail at server level, but PIN validation should pass
      const result = await proof.identity({
        personnummer: '19900101-1234',
        birthDate: '1990-01-01',
        pin: '123456', // Valid format
      });

      // Will be network error since no server, but not invalid_pin
      if (!result.ok) {
        expect(result.error.code).not.toBe('invalid_pin');
      }
    });

    it('should work without pin for backward compatibility', async () => {
      // This will fail at server level, but no PIN validation error
      const result = await proof.identity({
        personnummer: '19900101-1234',
        birthDate: '1990-01-01',
        // No pin - backward compatible
      });

      // Will be network error since no server, but not invalid_pin
      if (!result.ok) {
        expect(result.error.code).not.toBe('invalid_pin');
      }
    });
  });

  describe('age validation', () => {
    it('should validate required birthDate', async () => {
      const result = await proof.age({
        birthDate: '',
        minAge: 18,
      });

      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.error.code).toBe('validation_error');
      }
    });
  });

  describe('membership validation', () => {
    it('should validate required memberId', async () => {
      const result = await proof.membership({
        memberId: '',
        organizationId: 'org123',
        organizationName: 'Test Org',
      });

      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.error.code).toBe('validation_error');
      }
    });

    it('should validate required organizationId', async () => {
      const result = await proof.membership({
        memberId: 'mem123',
        organizationId: '',
        organizationName: 'Test Org',
      });

      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.error.code).toBe('validation_error');
      }
    });

  });

  describe('ProofType', () => {
    it('should support identity type', () => {
      const type: proof.ProofType = 'identity';
      expect(type).toBe('identity');
    });

    it('should support age type', () => {
      const type: proof.ProofType = 'age';
      expect(type).toBe('age');
    });

    it('should support membership type', () => {
      const type: proof.ProofType = 'membership';
      expect(type).toBe('membership');
    });
  });
});
