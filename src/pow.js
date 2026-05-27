/**
 * otrust-core/src/pow.js
 * 
 * Proof-of-Work challenge generation and management
 * Adaptive difficulty based on global load
 */

import crypto from 'crypto';
import { getDb } from './db.js';

// Helper to check if running in test mode (checked dynamically at runtime)
function isTestMode() {
  return process.env.NODE_ENV === 'test' || process.env.TEST_MODE === 'true';
}

// Difficulty levels (leading zero bits required)
function getDifficultyLevels() {
  const testMode = isTestMode();
  return {
    EASY: testMode ? 4 : 16,      // Light load (4 bits for tests)
    NORMAL: testMode ? 6 : 20,    // Normal load (6 bits for tests)
    HARD: testMode ? 8 : 24       // Heavy load (8 bits for tests)
  };
}

const CHALLENGE_TTL_MS = 5 * 60 * 1000; // 5 minutes

/**
 * Calculate adaptive difficulty based on recent load
 * Per spec section 8.3
 */
async function getAdaptiveDifficulty() {
  const levels = getDifficultyLevels();
  try {
    const db = getDb();
    const tenMinutesAgo = new Date(Date.now() - 10 * 60 * 1000);
    
    const recentClaims = await db.collection('claims').countDocuments({
      created_at: { $gte: tenMinutesAgo }
    });
    
    if (recentClaims > 1000) {
      return levels.HARD;  // Heavy load
    } else if (recentClaims > 100) {
      return levels.NORMAL; // Normal load
    } else {
      return levels.EASY;   // Light load
    }
  } catch (error) {
    console.error('[PoW] Failed to get load stats:', error.message);
    return levels.NORMAL; // Default to normal on error
  }
}

/**
 * Generate a new PoW challenge with adaptive difficulty
 */
export async function generateChallenge() {
  const challenge = crypto.randomBytes(32).toString('hex');
  const difficulty = await getAdaptiveDifficulty();
  const now = new Date();
  const expires = new Date(now.getTime() + CHALLENGE_TTL_MS);

  try {
    const db = getDb();
    await db.collection('pow_challenges').insertOne({
      challenge,
      difficulty,
      created_at: now,
      expires_at: expires,
      used: false
    });
  } catch (error) {
    console.error('[PoW] Failed to store challenge:', error.message);
  }

  return {
    challenge,
    difficulty,
    expires: expires.toISOString()
  };
}

/**
 * Validate and consume a PoW challenge - atomic operation
 * Returns { valid: boolean, difficulty: number } to prevent race conditions
 */
export async function consumeChallenge(challenge) {
  try {
    const db = getDb();
    const now = new Date();

    // Atomic find-and-update: get difficulty AND mark as used in one operation
    // This prevents race condition where multiple requests use same challenge
    const result = await db.collection('pow_challenges').findOneAndUpdate(
      {
        challenge: challenge,
        used: false,
        expires_at: { $gt: now }
      },
      {
        $set: { used: true, used_at: now }
      },
      {
        returnDocument: 'before' // Return the document before update to get difficulty
      }
    );

    if (result) {
      return { valid: true, difficulty: result.difficulty };
    }
    return { valid: false, difficulty: null };
  } catch (error) {
    console.error('[PoW] Challenge validation error:', error.message);
    return { valid: false, difficulty: null };
  }
}

/**
 * Get challenge difficulty (for display only, not for validation)
 */
export async function getChallengeDifficulty(challenge) {
  try {
    const db = getDb();
    const doc = await db.collection('pow_challenges').findOne({ challenge });
    return doc ? doc.difficulty : null;
  } catch (error) {
    console.error('[PoW] Get difficulty error:', error.message);
    return null;
  }
}

// Export difficulty levels function for testing
export { getDifficultyLevels };
