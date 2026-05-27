import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { timestamp } from './index';

describe('timestamp service', () => {
  describe('hash', () => {
    it('should hash a string correctly', async () => {
      const hash = await timestamp.hash('Hello, World!');
      expect(hash).toBe('dffd6021bb2bd5b0af676290809ec3a53191dd81c7f70a4b28688a362182986f');
    });

    it('should hash empty string', async () => {
      const hash = await timestamp.hash('');
      expect(hash).toBe('e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855');
    });

    it('should hash Uint8Array', async () => {
      const data = new TextEncoder().encode('Hello, World!');
      const hash = await timestamp.hash(data);
      expect(hash).toBe('dffd6021bb2bd5b0af676290809ec3a53191dd81c7f70a4b28688a362182986f');
    });
  });

  describe('isValidHash', () => {
    it('should validate correct SHA-256 hash', () => {
      const hash = 'dffd6021bb2bd5b0af676290809ec3a53191dd81c7f70a4b28688a362182986f';
      expect(timestamp.isValidHash(hash)).toBe(true);
    });

    it('should reject short hash', () => {
      expect(timestamp.isValidHash('abc123')).toBe(false);
    });

    it('should reject non-hex characters', () => {
      expect(timestamp.isValidHash('gggg6021bb2bd5b0af676290809ec3a53191dd81c7f70a4b28688a362182986f')).toBe(false);
    });
  });
});
