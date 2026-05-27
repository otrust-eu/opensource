/**
 * Unit tests for src/crypto.js
 */

import {
  verifySignature,
  sign,
  signSecp256k1,
  generateKeypair,
  getPublicKey,
  hash,
  verifyPow,
  solvePow
} from '../src/crypto.js';

describe('crypto.js', () => {

  describe('generateKeypair', () => {
    test('generates valid Ed25519 keypair by default', () => {
      const keypair = generateKeypair();

      expect(keypair.type).toBe('ed25519');
      expect(keypair.privateKey).toHaveLength(64); // 32 bytes hex
      expect(keypair.publicKey).toHaveLength(64);  // 32 bytes hex
    });

    test('generates valid secp256k1 keypair', () => {
      const keypair = generateKeypair('secp256k1');

      expect(keypair.type).toBe('secp256k1');
      expect(keypair.privateKey).toHaveLength(64); // 32 bytes hex
      expect(keypair.publicKey).toHaveLength(66);  // 33 bytes compressed
      expect(['02', '03']).toContain(keypair.publicKey.substring(0, 2));
    });

    test('generates unique keypairs', () => {
      const keypair1 = generateKeypair();
      const keypair2 = generateKeypair();

      expect(keypair1.privateKey).not.toBe(keypair2.privateKey);
      expect(keypair1.publicKey).not.toBe(keypair2.publicKey);
    });
  });

  describe('getPublicKey', () => {
    test('derives Ed25519 public key from private key', () => {
      const keypair = generateKeypair('ed25519');
      const derivedPubKey = getPublicKey(keypair.privateKey, 'ed25519');

      expect(derivedPubKey).toBe(keypair.publicKey);
    });

    test('derives secp256k1 public key from private key', () => {
      const keypair = generateKeypair('secp256k1');
      const derivedPubKey = getPublicKey(keypair.privateKey, 'secp256k1');

      expect(derivedPubKey).toBe(keypair.publicKey);
    });
  });

  describe('hash', () => {
    test('hashes string data correctly', () => {
      const result = hash('hello');

      expect(result).toHaveLength(64); // SHA-256 = 32 bytes = 64 hex chars
      // Known SHA-256 of "hello"
      expect(result).toBe('2cf24dba5fb0a30e26e83b2ac5b9e29e1b161e5c1fa7425e73043362938b9824');
    });

    test('hashes empty string', () => {
      const result = hash('');
      // Known SHA-256 of empty string
      expect(result).toBe('e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855');
    });

    test('different inputs produce different hashes', () => {
      const hash1 = hash('test1');
      const hash2 = hash('test2');

      expect(hash1).not.toBe(hash2);
    });

    test('same input produces same hash', () => {
      const hash1 = hash('deterministic');
      const hash2 = hash('deterministic');

      expect(hash1).toBe(hash2);
    });
  });

  describe('sign and verifySignature - Ed25519', () => {
    let keypair;
    let messageHash;

    beforeEach(() => {
      keypair = generateKeypair('ed25519');
      messageHash = hash('test message');
    });

    test('signs and verifies valid signature', async () => {
      const signature = await sign(messageHash, keypair.privateKey);
      const isValid = await verifySignature(messageHash, signature, keypair.publicKey);

      expect(signature).toHaveLength(128); // 64 bytes = 128 hex chars
      expect(isValid).toBe(true);
    });

    test('rejects signature with wrong message', async () => {
      const signature = await sign(messageHash, keypair.privateKey);
      const wrongHash = hash('different message');
      const isValid = await verifySignature(wrongHash, signature, keypair.publicKey);

      expect(isValid).toBe(false);
    });

    test('rejects signature with wrong public key', async () => {
      const signature = await sign(messageHash, keypair.privateKey);
      const otherKeypair = generateKeypair('ed25519');
      const isValid = await verifySignature(messageHash, signature, otherKeypair.publicKey);

      expect(isValid).toBe(false);
    });

    test('rejects tampered signature', async () => {
      const signature = await sign(messageHash, keypair.privateKey);
      const tampered = 'ff' + signature.substring(2); // Tamper first byte
      const isValid = await verifySignature(messageHash, tampered, keypair.publicKey);

      expect(isValid).toBe(false);
    });
  });

  describe('sign and verifySignature - secp256k1', () => {
    let keypair;
    let messageHash;

    beforeEach(() => {
      keypair = generateKeypair('secp256k1');
      messageHash = hash('test message');
    });

    test('signs and verifies valid signature', async () => {
      const signature = await signSecp256k1(messageHash, keypair.privateKey);
      const isValid = await verifySignature(messageHash, signature, keypair.publicKey);

      expect(isValid).toBe(true);
    });

    test('rejects signature with wrong message', async () => {
      const signature = await signSecp256k1(messageHash, keypair.privateKey);
      const wrongHash = hash('different message');
      const isValid = await verifySignature(wrongHash, signature, keypair.publicKey);

      expect(isValid).toBe(false);
    });
  });

  describe('verifyPow', () => {
    test('verifies valid proof-of-work', () => {
      // Solve a real PoW with low difficulty for speed
      const challenge = 'a'.repeat(64);
      const nonce = solvePow(challenge, 8);

      expect(verifyPow(challenge, nonce, 8)).toBe(true);
    });

    test('rejects invalid proof-of-work', () => {
      const challenge = 'a'.repeat(64);
      const badNonce = '0000000000000000';

      // Very unlikely to pass difficulty 16+ with this nonce
      expect(verifyPow(challenge, badNonce, 20)).toBe(false);
    });

    test('rejects missing challenge', () => {
      expect(verifyPow(null, 'nonce', 16)).toBe(false);
      expect(verifyPow('', 'nonce', 16)).toBe(false);
    });

    test('rejects missing nonce', () => {
      expect(verifyPow('challenge', null, 16)).toBe(false);
      expect(verifyPow('challenge', '', 16)).toBe(false);
    });
  });

  describe('solvePow', () => {
    test('solves proof-of-work with low difficulty', () => {
      const challenge = hash('unique challenge ' + Date.now());
      const nonce = solvePow(challenge, 8);

      expect(typeof nonce).toBe('string');
      expect(verifyPow(challenge, nonce, 8)).toBe(true);
    });

    test('solves proof-of-work with medium difficulty', () => {
      const challenge = hash('medium challenge ' + Date.now());
      const nonce = solvePow(challenge, 12);

      expect(verifyPow(challenge, nonce, 12)).toBe(true);
    });
  });
});
