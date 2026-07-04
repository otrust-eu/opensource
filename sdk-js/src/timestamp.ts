/**
 * OTRUST SDK - Timestamp Service
 * 
 * Bitcoin-anchored timestamps via OpenTimestamps.
 * Prove that data existed at a specific point in time.
 */

import { getClient } from './client.js';
import { Result, ok, err, OTrustError } from './result.js';
import { sha256, hashFile, hashFileWithProgress, isValidHash } from './crypto.js';

// ============================================
// Types
// ============================================

/** Timestamp claim response */
export interface TimestampClaim {
  /** Unique receipt ID (e.g., "ot_abc123") */
  receiptId: string;
  /** SHA-256 hash of the timestamped data */
  hash: string;
  /** When the claim was created */
  createdAt: string;
  /** URL to view the proof */
  proofUrl: string;
  /** Current blockchain status */
  blockchainStatus: 'pending' | 'confirmed';
  /** Bitcoin block number if confirmed */
  blockNumber?: number;
  /** Bitcoin transaction hash if confirmed */
  txHash?: string;
}

/** Verification result */
export interface VerifyResult {
  /** Whether the hash was found */
  exists: boolean;
  /** Claim details if found */
  claim?: TimestampClaim;
}

/** Bulk verification result */
export interface BulkVerifyResult {
  /** Results for each hash */
  results: Array<{
    hash: string;
    exists: boolean;
    claim?: TimestampClaim;
    error?: string;
  }>;
}

/** Challenge for proof-of-work */
export interface Challenge {
  /** Challenge ID */
  id: string;
  /** Challenge string to hash */
  challenge: string;
  /** Required difficulty (number of leading zeros) */
  difficulty: number;
  /** When challenge expires */
  expiresAt: string;
}

/** Proof of work solution */
export interface ProofOfWork {
  /** Original challenge string */
  challenge: string;
  /** Nonce that produces valid hash */
  nonce: number;
}

/** Bulk claim input */
export interface BulkClaimInput {
  /** SHA-256 hash */
  hash: string;
  /** Ed25519 signature */
  signature: string;
  /** Ed25519 public key */
  pubkey: string;
  /** Optional filename */
  filename?: string;
}

/** Bulk claim result */
export interface BulkClaimResult {
  /** Results for each claim */
  results: Array<{
    index: number;
    status: 'created' | 'duplicate' | 'error';
    receiptId?: string;
    timestamp?: string;
    error?: string;
  }>;
}

/** Receipt from receipts list */
export interface Receipt {
  receiptId: string;
  hash: string;
  filename?: string;
  timestamp: string;
  blockchainConfirmed: boolean;
  blockchainBlock?: number;
  hasOtsProof: boolean;
}

/** Options for creating a timestamp */
export interface CreateOptions {
  /** Ed25519 public key (hex) for signed claims */
  pubkey?: string;
  /** Ed25519 signature (hex) for signed claims */
  signature?: string;
  /** Source identifier */
  source?: string;
  /** Email for notification when blockchain confirmed */
  email?: string;
  /** Original filename (for reference) */
  filename?: string;
}

// ============================================
// Main API Functions
// ============================================

/**
 * Create a timestamp for a file or data.
 * This is the main entry point - handles hashing automatically.
 * 
 * @example
 * ```ts
 * // Timestamp a file
 * const result = await timestamp.create(file);
 * if (result.ok) {
 *   console.log('Receipt:', result.value.receiptId);
 * }
 * 
 * // Timestamp a string
 * const result = await timestamp.create('Hello, World!');
 * 
 * // Timestamp with options
 * const result = await timestamp.create(file, { 
 *   email: 'me@example.com' 
 * });
 * ```
 */
export async function create(
  data: File | Blob | string | ArrayBuffer,
  options?: CreateOptions
): Promise<Result<TimestampClaim>> {
  // Hash the data
  let hash: string;
  
  if (data instanceof File || data instanceof Blob) {
    hash = await hashFile(data);
  } else if (typeof data === 'string') {
    // Check if it's already a hash
    if (isValidHash(data)) {
      hash = data.toLowerCase();
    } else {
      hash = await sha256(data);
    }
  } else {
    hash = await sha256(data);
  }

  // Use simple endpoint (no PoW required for rate-limited usage)
  return createSimple(hash, options);
}

/**
 * Create a timestamp using the simple API (rate-limited, no PoW).
 * 
 * @example
 * ```ts
 * const result = await timestamp.createSimple(hash);
 * ```
 */
export async function createSimple(
  hash: string,
  options?: CreateOptions
): Promise<Result<TimestampClaim>> {
  if (!isValidHash(hash)) {
    return err(new OTrustError('validation_error', 'Invalid hash format. Expected 64-character hex string.'));
  }

  const client = getClient();
  const result = await client.post<{
    status: string;
    receipt_id: string;
    timestamp: string;
    proof_url: string;
    blockchain_status: string;
    block_number?: number;
    tx_hash?: string;
  }>('/claim/simple', {
    hash: hash.toLowerCase(),
    source: options?.source ?? 'sdk',
    filename: options?.filename,
    email: options?.email,
    pubkey: options?.pubkey,
    signature: options?.signature,
  });

  if (!result.ok) {
    return result;
  }

  return ok({
    receiptId: result.value.receipt_id,
    hash: hash.toLowerCase(),
    createdAt: result.value.timestamp,
    proofUrl: result.value.proof_url,
    blockchainStatus: result.value.blockchain_status === 'confirmed' ? 'confirmed' : 'pending',
    blockNumber: result.value.block_number,
    txHash: result.value.tx_hash,
  });
}

/**
 * Verify if a hash has been timestamped.
 * 
 * @example
 * ```ts
 * // Verify a file
 * const result = await timestamp.verify(file);
 * if (result.ok && result.value.exists) {
 *   console.log('Timestamped at:', result.value.claim?.createdAt);
 * }
 * 
 * // Verify a hash directly
 * const result = await timestamp.verify(hash);
 * ```
 */
export async function verify(
  data: File | Blob | string | ArrayBuffer
): Promise<Result<VerifyResult>> {
  // Hash the data
  let hash: string;
  
  if (data instanceof File || data instanceof Blob) {
    hash = await hashFile(data);
  } else if (typeof data === 'string') {
    if (isValidHash(data)) {
      hash = data.toLowerCase();
    } else {
      hash = await sha256(data);
    }
  } else {
    hash = await sha256(data);
  }

  const client = getClient();
  const result = await client.post<{
    status: string;
    exists?: boolean;
    claims?: Array<{
      receipt_id: string;
      pubkey?: string;
      timestamp: string;
      blockchain_confirmed: boolean;
      blockchain_block?: number;
      ots_pending?: boolean;
      proof_url?: string;
    }>;
  }>('/verify', { hash });

  if (!result.ok) {
    return result;
  }

  const exists = result.value.status === 'found' && (result.value.claims?.length ?? 0) > 0;
  const firstClaim = result.value.claims?.[0];

  return ok({
    exists,
    claim: firstClaim ? {
      receiptId: firstClaim.receipt_id,
      hash: hash.toLowerCase(),
      createdAt: firstClaim.timestamp,
      proofUrl: firstClaim.proof_url ?? `https://otrust.eu/proof/${firstClaim.receipt_id}`,
      blockchainStatus: firstClaim.blockchain_confirmed ? 'confirmed' : 'pending',
      blockNumber: firstClaim.blockchain_block,
    } : undefined,
  });
}

/**
 * Verify multiple hashes at once (max 100).
 * 
 * @example
 * ```ts
 * const result = await timestamp.verifyBulk([hash1, hash2, hash3]);
 * ```
 */
export async function verifyBulk(hashes: string[]): Promise<Result<BulkVerifyResult>> {
  if (hashes.length === 0) {
    return ok({ results: [] });
  }

  if (hashes.length > 100) {
    return err(new OTrustError('validation_error', 'Maximum 100 hashes per request'));
  }

  const invalidHashes = hashes.filter(h => !isValidHash(h));
  if (invalidHashes.length > 0) {
    return err(new OTrustError('validation_error', `Invalid hash format: ${invalidHashes[0]}`));
  }

  const client = getClient();
  const result = await client.post<{
    results: Array<{
      hash: string;
      status: string;
      claims?: Array<{
        receipt_id: string;
        pubkey?: string;
        timestamp: string;
        blockchain_confirmed: boolean;
        blockchain_block?: number;
      }>;
      error?: string;
    }>;
  }>('/verify/bulk', { hashes: hashes.map(h => h.toLowerCase()) });

  if (!result.ok) {
    return result;
  }

  return ok({
    results: result.value.results.map(r => {
      const exists = r.status === 'found' && (r.claims?.length ?? 0) > 0;
      const firstClaim = r.claims?.[0];
      
      return {
        hash: r.hash,
        exists,
        claim: firstClaim ? {
          receiptId: firstClaim.receipt_id,
          hash: r.hash,
          createdAt: firstClaim.timestamp,
          proofUrl: `https://otrust.eu/proof/${firstClaim.receipt_id}`,
          blockchainStatus: firstClaim.blockchain_confirmed ? 'confirmed' as const : 'pending' as const,
          blockNumber: firstClaim.blockchain_block,
        } : undefined,
        error: r.error,
      };
    }),
  });
}

/**
 * Get proof details for a receipt ID.
 * 
 * @example
 * ```ts
 * const result = await timestamp.getProof('ot_abc123');
 * ```
 */
export async function getProof(receiptId: string): Promise<Result<TimestampClaim>> {
  const client = getClient();
  const result = await client.get<{
    receipt_id: string;
    hash: string;
    created_at: string;
    blockchain_status: string;
    block_number?: number;
    tx_hash?: string;
  }>(`/proof/${receiptId}`, {
    headers: { 'Accept': 'application/json' },
  });

  if (!result.ok) {
    return result;
  }

  return ok({
    receiptId: result.value.receipt_id,
    hash: result.value.hash,
    createdAt: result.value.created_at,
    proofUrl: `https://otrust.eu/proof/${result.value.receipt_id}`,
    blockchainStatus: result.value.blockchain_status === 'confirmed' ? 'confirmed' : 'pending',
    blockNumber: result.value.block_number,
    txHash: result.value.tx_hash,
  });
}

/**
 * Lookup if a hash exists (quick check).
 * 
 * @example
 * ```ts
 * const result = await timestamp.lookup(hash);
 * if (result.ok && result.value.exists) {
 *   // Hash is already timestamped
 * }
 * ```
 */
export async function lookup(hash: string): Promise<Result<{ exists: boolean; receiptId?: string }>> {
  if (!isValidHash(hash)) {
    return err(new OTrustError('validation_error', 'Invalid hash format'));
  }

  const client = getClient();
  const result = await client.get<{
    exists: boolean;
    timestamp?: {
      receipt_id: string;
    };
  }>(`/lookup/${hash.toLowerCase()}`);

  if (!result.ok) {
    return result;
  }

  return ok({
    exists: result.value.exists,
    receiptId: result.value.timestamp?.receipt_id,
  });
}

// ============================================
// Utility Functions
// ============================================

/**
 * Hash a file with progress reporting.
 * 
 * @example
 * ```ts
 * const hash = await timestamp.hash(file, (progress) => {
 *   console.log(`${Math.round(progress * 100)}% complete`);
 * });
 * ```
 */
export async function hash(
  data: File | Blob | string | ArrayBuffer,
  onProgress?: (progress: number) => void
): Promise<string> {
  if (data instanceof File || data instanceof Blob) {
    return hashFileWithProgress(data, onProgress);
  } else if (typeof data === 'string') {
    onProgress?.(1);
    return isValidHash(data) ? data.toLowerCase() : sha256(data);
  } else {
    onProgress?.(1);
    return sha256(data);
  }
}

// ============================================
// PoW-Based API Functions
// ============================================

/**
 * Get a proof-of-work challenge from the server.
 * 
 * @example
 * ```ts
 * const challenge = await timestamp.getChallenge();
 * if (challenge.ok) {
 *   const pow = await timestamp.solveChallenge(challenge.value);
 *   const claim = await timestamp.createWithPoW(hash, pow);
 * }
 * ```
 */
export async function getChallenge(): Promise<Result<Challenge>> {
  const client = getClient();
  const result = await client.get<{
    id: string;
    challenge: string;
    difficulty: number;
    expires_at: string;
  }>('/challenge');

  if (!result.ok) {
    return result;
  }

  return ok({
    id: result.value.id,
    challenge: result.value.challenge,
    difficulty: result.value.difficulty,
    expiresAt: result.value.expires_at,
  });
}

/**
 * Solve a proof-of-work challenge.
 * This is CPU-intensive and runs synchronously.
 * 
 * @example
 * ```ts
 * const pow = await timestamp.solveChallenge(challenge);
 * ```
 */
export function solveChallenge(challenge: Challenge): ProofOfWork {
  const target = '0'.repeat(challenge.difficulty);
  let nonce = 0;
  
  while (true) {
    // Simple hash check - in production this should use Web Crypto
    const testHash = simpleHash(challenge.challenge + nonce);
    if (testHash.startsWith(target)) {
      return { challenge: challenge.challenge, nonce };
    }
    nonce++;
    
    // Safety limit
    if (nonce > 100_000_000) {
      throw new Error('PoW solving exceeded maximum iterations');
    }
  }
}

// Simple hash for PoW (synchronous, for challenge solving)
function simpleHash(str: string): string {
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    const char = str.charCodeAt(i);
    hash = ((hash << 5) - hash) + char;
    hash = hash & hash;
  }
  return Math.abs(hash).toString(16).padStart(8, '0');
}

/**
 * Create a timestamp with proof-of-work (higher rate limits).
 * 
 * @example
 * ```ts
 * const challenge = await timestamp.getChallenge();
 * const pow = timestamp.solveChallenge(challenge.value);
 * const claim = await timestamp.createWithPoW(hash, signature, pubkey, pow);
 * ```
 */
export async function createWithPoW(
  hash: string,
  signature: string,
  pubkey: string,
  pow: ProofOfWork,
  options?: { filename?: string; email?: string }
): Promise<Result<TimestampClaim>> {
  if (!isValidHash(hash)) {
    return err(new OTrustError('validation_error', 'Invalid hash format'));
  }

  const client = getClient();
  const result = await client.post<{
    status: string;
    receipt_id: string;
    timestamp: string;
    proof_url: string;
  }>('/claim', {
    hash: hash.toLowerCase(),
    signature,
    pubkey,
    pow,
    filename: options?.filename,
    notify_email: options?.email,
  });

  if (!result.ok) {
    return result;
  }

  return ok({
    receiptId: result.value.receipt_id,
    hash: hash.toLowerCase(),
    createdAt: result.value.timestamp,
    proofUrl: result.value.proof_url,
    blockchainStatus: 'pending',
  });
}

/**
 * Create multiple timestamps in a single batch (max 100).
 * Requires proof-of-work for the entire batch.
 * 
 * @example
 * ```ts
 * const challenge = await timestamp.getChallenge();
 * const pow = timestamp.solveChallenge(challenge.value);
 * const result = await timestamp.createBulk(claims, pow);
 * ```
 */
export async function createBulk(
  claims: BulkClaimInput[],
  pow: ProofOfWork
): Promise<Result<BulkClaimResult>> {
  if (claims.length === 0) {
    return err(new OTrustError('validation_error', 'At least one claim is required'));
  }

  if (claims.length > 100) {
    return err(new OTrustError('validation_error', 'Maximum 100 claims per batch'));
  }

  const client = getClient();
  const result = await client.post<{
    results: Array<{
      index: number;
      status: string;
      receipt_id?: string;
      timestamp?: string;
      error?: string;
    }>;
  }>('/claim/bulk', { claims, pow });

  if (!result.ok) {
    return result;
  }

  return ok({
    results: result.value.results.map(r => ({
      index: r.index,
      status: r.status as 'created' | 'duplicate' | 'error',
      receiptId: r.receipt_id,
      timestamp: r.timestamp,
      error: r.error,
    })),
  });
}

/**
 * @deprecated Receipt history is stored locally in the browser only.
 * Persist receipts client-side (localStorage or extension storage) when you create timestamps.
 */
export async function getReceiptsByPubkey(_pubkey: string): Promise<Result<Receipt[]>> {
  return err(new OTrustError(
    'validation_error',
    'Receipt history is browser-local only. The server does not expose per-key receipt lists.',
    { details: { error: 'local_history_only' } }
  ));
}

/**
 * Verify a cryptographic signature.
 * 
 * @example
 * ```ts
 * const result = await timestamp.verifySignature(hash, signature, pubkey);
 * if (result.ok && result.value.valid) {
 *   console.log('Signature is valid');
 * }
 * ```
 */
export async function verifySignature(
  hash: string,
  signature: string,
  pubkey: string
): Promise<Result<{ valid: boolean }>> {
  const client = getClient();
  const result = await client.post<{ valid: boolean }>('/verify/signature', {
    hash: hash.toLowerCase(),
    signature,
    pubkey,
  });

  return result;
}

/**
 * Verify an OpenTimestamps blockchain proof.
 * 
 * @example
 * ```ts
 * const result = await timestamp.verifyBlockchain(hash, otsProof);
 * if (result.ok && result.value.verified) {
 *   console.log('Blockchain verified at block', result.value.blockHeight);
 * }
 * ```
 */
export async function verifyBlockchain(
  hash: string,
  otsProof: string // Base64 encoded .ots file
): Promise<Result<{
  verified: boolean;
  timestamp?: string;
  blockHeight?: number;
  txHash?: string;
}>> {
  const client = getClient();
  const result = await client.post<{
    verified: boolean;
    timestamp?: string;
    block_height?: number;
    tx_hash?: string;
  }>('/verify/blockchain', {
    hash: hash.toLowerCase(),
    ots_proof: otsProof,
  });

  if (!result.ok) {
    return result;
  }

  return ok({
    verified: result.value.verified,
    timestamp: result.value.timestamp,
    blockHeight: result.value.block_height,
    txHash: result.value.tx_hash,
  });
}

// ============================================
// Service Object (for namespaced usage)
// ============================================

/** Timestamp service with all methods */
export const timestamp = {
  create,
  createSimple,
  createWithPoW,
  createBulk,
  verify,
  verifyBulk,
  verifySignature,
  verifyBlockchain,
  getChallenge,
  solveChallenge,
  getProof,
  getReceiptsByPubkey,
  lookup,
  hash,
  isValidHash,
};

export default timestamp;
