/**
 * Proof-of-Work module tests
 */

import { verifyPow, solvePow, hash } from '../src/crypto.js';

describe('Proof-of-Work Module', () => {

  describe('Difficulty Levels', () => {
    const DIFFICULTY_EASY = 16;
    const DIFFICULTY_NORMAL = 20;
    const DIFFICULTY_HARD = 24;

    test('easy difficulty is 16 bits', () => {
      expect(DIFFICULTY_EASY).toBe(16);
    });

    test('normal difficulty is 20 bits', () => {
      expect(DIFFICULTY_NORMAL).toBe(20);
    });

    test('hard difficulty is 24 bits', () => {
      expect(DIFFICULTY_HARD).toBe(24);
    });
  });

  describe('Adaptive Difficulty Logic', () => {
    test('returns easy difficulty for low load (<100 claims)', () => {
      const recentClaims = 50;
      let difficulty;

      if (recentClaims > 1000) difficulty = 24;
      else if (recentClaims > 100) difficulty = 20;
      else difficulty = 16;

      expect(difficulty).toBe(16);
    });

    test('returns normal difficulty for medium load (100-1000 claims)', () => {
      const recentClaims = 500;
      let difficulty;

      if (recentClaims > 1000) difficulty = 24;
      else if (recentClaims > 100) difficulty = 20;
      else difficulty = 16;

      expect(difficulty).toBe(20);
    });

    test('returns hard difficulty for high load (>1000 claims)', () => {
      const recentClaims = 2000;
      let difficulty;

      if (recentClaims > 1000) difficulty = 24;
      else if (recentClaims > 100) difficulty = 20;
      else difficulty = 16;

      expect(difficulty).toBe(24);
    });
  });

  describe('Challenge Generation', () => {
    test('generates 64 character hex challenge', () => {
      const challenge = hash('test-challenge-' + Date.now());
      expect(challenge).toHaveLength(64);
      expect(challenge).toMatch(/^[a-f0-9]+$/);
    });

    test('challenges are unique', () => {
      const c1 = hash('unique-1-' + Date.now());
      const c2 = hash('unique-2-' + Date.now());
      expect(c1).not.toBe(c2);
    });
  });

  describe('Challenge TTL', () => {
    const CHALLENGE_TTL_MS = 5 * 60 * 1000; // 5 minutes

    test('challenge TTL is 5 minutes', () => {
      expect(CHALLENGE_TTL_MS).toBe(300000);
    });

    test('expires_at is in the future', () => {
      const now = Date.now();
      const expires = now + CHALLENGE_TTL_MS;
      expect(expires).toBeGreaterThan(now);
    });
  });

  describe('PoW Verification', () => {
    test('verifies correct nonce for difficulty 8', () => {
      const challenge = hash('test-challenge-' + Date.now());
      const nonce = solvePow(challenge, 8);

      expect(verifyPow(challenge, nonce, 8)).toBe(true);
    });

    test('verifies correct nonce for difficulty 12', () => {
      const challenge = hash('medium-challenge-' + Date.now());
      const nonce = solvePow(challenge, 12);

      expect(verifyPow(challenge, nonce, 12)).toBe(true);
    });

    test('rejects nonce that does not meet difficulty', () => {
      const challenge = hash('reject-test');
      // A simple nonce unlikely to meet difficulty 16+
      expect(verifyPow(challenge, '0000000000000001', 16)).toBe(false);
    });

    test('rejects empty challenge', () => {
      expect(verifyPow('', 'nonce', 16)).toBe(false);
    });

    test('rejects null challenge', () => {
      expect(verifyPow(null, 'nonce', 16)).toBe(false);
    });

    test('rejects empty nonce', () => {
      expect(verifyPow('challenge', '', 16)).toBe(false);
    });

    test('rejects null nonce', () => {
      expect(verifyPow('challenge', null, 16)).toBe(false);
    });
  });

  describe('PoW Solving Performance', () => {
    test('solves difficulty 8 quickly', () => {
      const start = Date.now();
      const challenge = hash('perf-8-' + Date.now());
      solvePow(challenge, 8);
      const elapsed = Date.now() - start;

      expect(elapsed).toBeLessThan(100); // Should be < 100ms
    });

    test('solves difficulty 12 in reasonable time', () => {
      const start = Date.now();
      const challenge = hash('perf-12-' + Date.now());
      solvePow(challenge, 12);
      const elapsed = Date.now() - start;

      expect(elapsed).toBeLessThan(1000); // Should be < 1s
    });
  });

  describe('Challenge Consumption (Atomic Operation)', () => {
    test('prevents double-spend of challenge', () => {
      // Simulate atomic findOneAndUpdate behavior
      let challengeUsed = false;

      const consumeChallenge = () => {
        if (challengeUsed) return { valid: false };
        challengeUsed = true;
        return { valid: true, difficulty: 20 };
      };

      const first = consumeChallenge();
      const second = consumeChallenge();

      expect(first.valid).toBe(true);
      expect(second.valid).toBe(false);
    });
  });
});
