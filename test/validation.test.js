/**
 * Unit tests for server validation helpers
 * Tests the validation functions used by API endpoints
 */

// Since validation functions are internal to server.js, we test them via the API
// This file tests validation logic patterns

describe('Validation Logic', () => {

  describe('Hash Validation Pattern', () => {
    const isValidHash = (hash) => {
      if (typeof hash !== 'string') return false;
      const clean = hash.toLowerCase().trim();
      return /^[a-f0-9]{64}$/.test(clean);
    };

    test('accepts valid SHA-256 hash (lowercase)', () => {
      const hash = 'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855';
      expect(isValidHash(hash)).toBe(true);
    });

    test('accepts valid SHA-256 hash (uppercase)', () => {
      const hash = 'E3B0C44298FC1C149AFBF4C8996FB92427AE41E4649B934CA495991B7852B855';
      expect(isValidHash(hash)).toBe(true);
    });

    test('accepts valid hash with whitespace', () => {
      const hash = '  e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855  ';
      expect(isValidHash(hash)).toBe(true);
    });

    test('rejects hash that is too short', () => {
      expect(isValidHash('e3b0c44298fc1c149afbf4c8996fb924')).toBe(false);
    });

    test('rejects hash that is too long', () => {
      expect(isValidHash('e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855aa')).toBe(false);
    });

    test('rejects hash with non-hex characters', () => {
      expect(isValidHash('g3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855')).toBe(false);
    });

    test('rejects null', () => {
      expect(isValidHash(null)).toBe(false);
    });

    test('rejects undefined', () => {
      expect(isValidHash(undefined)).toBe(false);
    });

    test('rejects number', () => {
      expect(isValidHash(12345)).toBe(false);
    });

    test('rejects empty string', () => {
      expect(isValidHash('')).toBe(false);
    });
  });

  describe('Signature Validation Pattern', () => {
    const isValidSignature = (sig) => {
      if (typeof sig !== 'string') return false;
      const clean = sig.toLowerCase().trim();
      return /^[a-f0-9]{128}$/.test(clean);
    };

    test('accepts valid Ed25519 signature (128 hex chars)', () => {
      const sig = 'a'.repeat(128);
      expect(isValidSignature(sig)).toBe(true);
    });

    test('rejects signature that is too short', () => {
      expect(isValidSignature('a'.repeat(127))).toBe(false);
    });

    test('rejects signature that is too long', () => {
      expect(isValidSignature('a'.repeat(129))).toBe(false);
    });

    test('rejects signature with non-hex', () => {
      expect(isValidSignature('g'.repeat(128))).toBe(false);
    });

    test('rejects null', () => {
      expect(isValidSignature(null)).toBe(false);
    });
  });

  describe('Public Key Validation Pattern', () => {
    const isValidPubkey = (pk) => {
      if (typeof pk !== 'string') return false;
      const clean = pk.toLowerCase().trim();
      if (/^[a-f0-9]{64}$/.test(clean)) return true; // Ed25519
      if (/^0[23][a-f0-9]{64}$/.test(clean)) return true; // secp256k1 compressed
      if (/^04[a-f0-9]{128}$/.test(clean)) return true; // secp256k1 uncompressed
      return false;
    };

    test('accepts valid Ed25519 public key (64 hex)', () => {
      const pk = 'a'.repeat(64);
      expect(isValidPubkey(pk)).toBe(true);
    });

    test('accepts valid secp256k1 compressed key (02 prefix)', () => {
      const pk = '02' + 'a'.repeat(64);
      expect(isValidPubkey(pk)).toBe(true);
    });

    test('accepts valid secp256k1 compressed key (03 prefix)', () => {
      const pk = '03' + 'b'.repeat(64);
      expect(isValidPubkey(pk)).toBe(true);
    });

    test('accepts valid secp256k1 uncompressed key (04 prefix)', () => {
      const pk = '04' + 'c'.repeat(128);
      expect(isValidPubkey(pk)).toBe(true);
    });

    test('rejects secp256k1 with invalid prefix (01)', () => {
      const pk = '01' + 'a'.repeat(64);
      expect(isValidPubkey(pk)).toBe(false);
    });

    test('rejects wrong length', () => {
      expect(isValidPubkey('a'.repeat(63))).toBe(false);
      expect(isValidPubkey('a'.repeat(65))).toBe(false);
    });

    test('rejects null', () => {
      expect(isValidPubkey(null)).toBe(false);
    });
  });

  describe('Receipt ID Validation Pattern', () => {
    const isValidReceiptId = (id) => {
      if (typeof id !== 'string') return false;
      return /^ot_[a-zA-Z0-9_-]{16}$/.test(id) || /^[a-zA-Z0-9_-]{16}$/.test(id);
    };

    test('accepts valid prefixed receipt ID', () => {
      expect(isValidReceiptId('ot_abcd1234EFGH5678')).toBe(true);
    });

    test('accepts valid unprefixed receipt ID', () => {
      expect(isValidReceiptId('abcd1234EFGH5678')).toBe(true);
    });

    test('accepts receipt ID with dashes and underscores', () => {
      expect(isValidReceiptId('ot_ab-cd_12-34_EF-G')).toBe(true);
    });

    test('rejects too short', () => {
      expect(isValidReceiptId('ot_short')).toBe(false);
    });

    test('rejects too long', () => {
      expect(isValidReceiptId('ot_' + 'a'.repeat(20))).toBe(false);
    });

    test('rejects invalid characters', () => {
      expect(isValidReceiptId('ot_abcd!@#$12345678')).toBe(false);
    });

    test('rejects null', () => {
      expect(isValidReceiptId(null)).toBe(false);
    });
  });

  describe('Email Validation Pattern', () => {
    const isValidEmail = (email) => {
      if (typeof email !== 'string') return false;
      if (email.length > 254) return false;
      return /^[a-zA-Z0-9.!#$%&'*+/=?^_`{|}~-]+@[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?(?:\.[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?)*$/.test(email);
    };

    test('accepts valid email', () => {
      expect(isValidEmail('test@example.com')).toBe(true);
    });

    test('accepts email with subdomain', () => {
      expect(isValidEmail('user@mail.example.com')).toBe(true);
    });

    test('accepts email with plus sign', () => {
      expect(isValidEmail('user+tag@example.com')).toBe(true);
    });

    test('accepts email with dots', () => {
      expect(isValidEmail('first.last@example.com')).toBe(true);
    });

    test('rejects email without @', () => {
      expect(isValidEmail('invalid-email')).toBe(false);
    });

    test('rejects email without domain', () => {
      expect(isValidEmail('user@')).toBe(false);
    });

    test('rejects email without local part', () => {
      expect(isValidEmail('@example.com')).toBe(false);
    });

    test('rejects overly long email', () => {
      const longEmail = 'a'.repeat(250) + '@example.com';
      expect(isValidEmail(longEmail)).toBe(false);
    });

    test('rejects null', () => {
      expect(isValidEmail(null)).toBe(false);
    });

    test('rejects number', () => {
      expect(isValidEmail(12345)).toBe(false);
    });
  });

  describe('Sanitize String Pattern', () => {
    const sanitizeString = (str) => {
      if (typeof str !== 'string') return null;
      return str.replace(/[${}]/g, '').trim();
    };

    test('removes MongoDB operators', () => {
      expect(sanitizeString('$gt')).toBe('gt');
      expect(sanitizeString('${injection}')).toBe('injection');
    });

    test('trims whitespace', () => {
      expect(sanitizeString('  hello  ')).toBe('hello');
    });

    test('preserves normal strings', () => {
      expect(sanitizeString('normal string')).toBe('normal string');
    });

    test('returns null for non-strings', () => {
      expect(sanitizeString(null)).toBe(null);
      expect(sanitizeString(123)).toBe(null);
      expect(sanitizeString({})).toBe(null);
    });
  });
});
