/**
 * OTRUST SDK - Proof Service
 * 
 * Zero-knowledge identity and attribute proofs.
 */

import { getClient } from './client.js';
import { Result, ok, err, OTrustError } from './result.js';

// ============================================
// Types
// ============================================

/** Proof type */
export type ProofType = 'identity' | 'age' | 'income' | 'membership';

/** Proof status */
export type ProofStatus = 'active' | 'revoked' | 'expired';

/** Verification status for identity proofs */
export interface VerificationStatus {
  faceMatch?: boolean;
  livenessVerified?: boolean;
  documentVerified?: boolean;
}

/** Identity proof */
export interface IdentityProof {
  /** Unique proof ID (e.g., "id_abc123") */
  proofId: string;
  /** Type of proof */
  type: 'identity';
  /** Proof commitment (public) */
  commitment: string;
  /** Secret key (private - store securely!) */
  secret: string;
  /** Statement describing the proof */
  statement: string;
  /** Verification details */
  verification: VerificationStatus;
  /** Shareable URL */
  shareUrl: string;
  /** Wallet pass URL */
  walletUrl: string;
  /** When created */
  createdAt: string;
  /** When expires */
  expiresAt?: string;
}

/** Age proof */
export interface AgeProof {
  proofId: string;
  type: 'age';
  commitment: string;
  secret: string;
  minAge: number;
  shareUrl: string;
  verifyUrl: string;
}

/** Membership proof */
export interface MembershipProof {
  proofId: string;
  type: 'membership';
  commitment: string;
  secret: string;
  organizationName: string;
  shareUrl: string;
  verifyUrl: string;
}

/** Proof details (for viewing) */
export interface ProofDetails {
  id: string;
  type: ProofType;
  statement?: string;
  commitment: string;
  verification?: VerificationStatus;
  status: ProofStatus;
  createdAt: string;
  expiresAt?: string;
}

/** Wallet format */
export type WalletFormat = 'apple' | 'google';

/** Options for identity verification with face recognition */
export interface IdentityVerifyOptions {
  /** Swedish personnummer */
  personnummer: string;
  /** Birth date (YYYY-MM-DD) */
  birthDate: string;
  /** 6-digit PIN for proof encryption (recommended for security) */
  pin?: string;
  /** ID document image element */
  idDocument: HTMLImageElement | HTMLCanvasElement;
  /** Video element for selfie capture */
  videoElement: HTMLVideoElement;
  /** Skip face verification (lower trust) */
  skipFaceVerification?: boolean;
  /** Skip liveness detection (lower trust) */
  skipLiveness?: boolean;
  /** Progress callback */
  onProgress?: (status: {
    step: 'init' | 'detecting_id_face' | 'verifying_selfie' | 'creating_proof';
    message: string;
    faceDetected?: boolean;
    blinksDetected?: number;
  }) => void;
  /** Recovery token if re-creating lost proof */
  recoveryToken?: string;
}

// ============================================
// Main API Functions
// ============================================

/**
 * Create a new identity proof WITH face verification.
 * 
 * This is the recommended way to create an identity proof.
 * It performs face recognition client-side before submitting to the server.
 * 
 * IMPORTANT: Store the returned `secret` securely!
 * It's the only way to prove you own this identity.
 * 
 * @example
 * ```ts
 * import { proof, face } from '@otrust/sdk';
 * 
 * // Initialize face recognition
 * await face.init();
 * 
 * // Start camera
 * const video = document.getElementById('webcam');
 * await face.startCamera(video);
 * 
 * // Create identity proof with face verification
 * const result = await proof.verifyIdentity({
 *   personnummer: '19900101-1234',
 *   birthDate: '1990-01-01',
 *   idDocument: document.getElementById('id-photo'),
 *   videoElement: video,
 *   onProgress: (status) => console.log(status.message),
 * });
 * 
 * if (result.ok) {
 *   console.log('Proof created:', result.value.proofId);
 *   console.log('Face match:', result.value.verification.faceMatch);
 * }
 * ```
 */
export async function verifyIdentity(options: IdentityVerifyOptions): Promise<Result<IdentityProof>> {
  const { face } = await import('./face.js');
  
  const {
    personnummer,
    birthDate,
    idDocument,
    videoElement,
    skipFaceVerification = false,
    skipLiveness = false,
    onProgress,
    recoveryToken,
  } = options;

  let faceMatch = false;
  let livenessVerified = false;

  if (!skipFaceVerification) {
    // Step 1: Initialize face recognition
    onProgress?.({ step: 'init', message: 'Loading face recognition models...' });
    const initResult = await face.init();
    if (!initResult.ok) {
      return initResult;
    }

    // Step 2: Detect face on ID document
    onProgress?.({ step: 'detecting_id_face', message: 'Scanning ID document for face...' });
    const idFaceResult = await face.detectFromImage(idDocument);
    if (!idFaceResult.ok) {
      return err(new OTrustError('id_face_not_found', 'Could not detect face on ID document. Please ensure the photo is clear and visible.'));
    }

    // Step 3: Verify selfie with liveness
    onProgress?.({ step: 'verifying_selfie', message: 'Position your face and blink twice...', faceDetected: false, blinksDetected: 0 });
    
    const verifyResult = await face.verifySelfie(videoElement, idFaceResult.value, {
      requireLiveness: !skipLiveness,
      requiredBlinks: 2,
      similarityThreshold: 0.55,
      timeout: 30000,
      onProgress: (status) => {
        onProgress?.({
          step: 'verifying_selfie',
          message: status.message,
          faceDetected: status.faceDetected,
          blinksDetected: status.blinksDetected,
        });
      },
    });

    if (!verifyResult.ok) {
      return verifyResult;
    }

    faceMatch = verifyResult.value.faceMatch;
    livenessVerified = verifyResult.value.livenessVerified;

    if (!faceMatch) {
      return err(new OTrustError('face_mismatch', 'Face does not match ID document. Please try again or use the same person as on the ID.'));
    }
  }

  // Step 4: Create proof on server
  onProgress?.({ step: 'creating_proof', message: 'Creating identity proof...' });
  
  return identity({
    personnummer,
    birthDate,
    pin: options.pin,
    faceMatch,
    livenessVerified,
    recoveryToken,
  });
}

/**
 * Create a new identity proof (low-level, without face verification).
 * 
 * ⚠️ For production use, prefer `proof.verifyIdentity()` which includes
 * face recognition and liveness detection.
 * 
 * @example
 * ```ts
 * const result = await proof.identity({
 *   personnummer: '19900101-1234',
 *   birthDate: '1990-01-01',
 *   pin: '123456',  // Required 6-digit PIN for encryption
 *   faceMatch: true,  // Only set true if you verified!
 *   livenessVerified: true,
 * });
 * ```
 */
export async function identity(options: {
  personnummer: string;
  birthDate: string;
  /** 6-digit PIN for proof encryption (recommended for security) */
  pin?: string;
  faceMatch?: boolean;
  livenessVerified?: boolean;
  recoveryToken?: string;
}): Promise<Result<IdentityProof>> {
  // Validate PIN format if provided
  if (options.pin !== undefined && !/^\d{6}$/.test(options.pin)) {
    return err(new OTrustError('invalid_pin', 'PIN must be exactly 6 digits'));
  }

  const client = getClient();
  const result = await client.post<{
    success: boolean;
    proofId: string;
    commitment: string;
    secret: string;
    statement: string;
    verification: VerificationStatus;
    shareUrl: string;
    walletUrl: string;
    createdAt: string;
  }>('/api/proof/identity', options);

  if (!result.ok) {
    return result;
  }

  return ok({
    proofId: result.value.proofId,
    type: 'identity',
    commitment: result.value.commitment,
    secret: result.value.secret,
    statement: result.value.statement,
    verification: result.value.verification,
    shareUrl: result.value.shareUrl,
    walletUrl: result.value.walletUrl,
    createdAt: result.value.createdAt,
  });
}


/**
 * Create an age proof (prove you're at least X years old).
 * 
 * @example
 * ```ts
 * const result = await proof.age({
 *   birthDate: '1990-01-01',
 *   minAge: 18,
 * });
 * ```
 */
export async function age(options: {
  birthDate: string;
  minAge: number;
}): Promise<Result<AgeProof>> {
  const client = getClient();
  const result = await client.post<{
    success: boolean;
    proofId: string;
    commitment: string;
    secret: string;
    shareUrl: string;
    verifyUrl: string;
  }>('/api/proof/age', options);

  if (!result.ok) {
    return result;
  }

  return ok({
    proofId: result.value.proofId,
    type: 'age',
    commitment: result.value.commitment,
    secret: result.value.secret,
    minAge: options.minAge,
    shareUrl: result.value.shareUrl,
    verifyUrl: result.value.verifyUrl,
  });
}

/**
 * Create a membership proof.
 * 
 * @example
 * ```ts
 * const result = await proof.membership({
 *   memberId: 'M12345',
 *   organizationId: 'org_abc',
 *   organizationName: 'Example Club',
 * });
 * ```
 */
export async function membership(options: {
  memberId: string;
  organizationId: string;
  organizationName?: string;
}): Promise<Result<MembershipProof>> {
  const client = getClient();
  const result = await client.post<{
    success: boolean;
    proofId: string;
    commitment: string;
    secret: string;
    shareUrl: string;
    verifyUrl: string;
  }>('/api/proof/membership', options);

  if (!result.ok) {
    return result;
  }

  return ok({
    proofId: result.value.proofId,
    type: 'membership',
    commitment: result.value.commitment,
    secret: result.value.secret,
    organizationName: options.organizationName ?? 'Organization',
    shareUrl: result.value.shareUrl,
    verifyUrl: result.value.verifyUrl,
  });
}

/** Income proof */
export interface IncomeProof {
  proofId: string;
  type: 'income';
  commitment: string;
  secret: string;
  minIncome: number;
  maxIncome?: number;
  shareUrl: string;
  verifyUrl: string;
}

/**
 * Create an income proof (prove income is within a range).
 * 
 * @example
 * ```ts
 * const result = await proof.income({
 *   income: 50000,
 *   minIncome: 40000,
 *   maxIncome: 60000, // Optional upper bound
 * });
 * 
 * if (result.ok) {
 *   // Share this URL to prove income is >= 40000
 *   console.log(result.value.shareUrl);
 * }
 * ```
 */
export async function income(options: {
  income: number;
  minIncome: number;
  maxIncome?: number;
}): Promise<Result<IncomeProof>> {
  const client = getClient();
  const result = await client.post<{
    success: boolean;
    proofId: string;
    commitment: string;
    secret: string;
    shareUrl: string;
    verifyUrl: string;
  }>('/api/proof/income', {
    income: options.income,
    minIncome: options.minIncome,
    maxIncome: options.maxIncome,
  });

  if (!result.ok) {
    return result;
  }

  return ok({
    proofId: result.value.proofId,
    type: 'income',
    commitment: result.value.commitment,
    secret: result.value.secret,
    minIncome: options.minIncome,
    maxIncome: options.maxIncome,
    shareUrl: result.value.shareUrl,
    verifyUrl: result.value.verifyUrl,
  });
}

/** Options for submitting a browser-generated proof */
export interface BrowserProofOptions {
  /** Type of proof (age, income, membership) */
  proofType: ProofType;
  /** Proof version (e.g., 'groth16-v3', 'simple-v1') */
  version: string;
  /** The proof data (format depends on version) */
  proof: Record<string, unknown>;
  /** Public signals from the proof (for Groth16) */
  publicSignals?: string[];
  /** Proof commitment */
  commitment: string;
  /** Human-readable statement */
  statement?: string;
  /** For age proofs: minimum age proven */
  minAge?: number;
  /** For income proofs: minimum income */
  minIncome?: number;
  /** For income proofs: maximum income */
  maxIncome?: number;
  /** When the proof was generated (ISO string) */
  generatedAt?: string;
}

/**
 * Submit a browser-generated ZK proof for storage.
 * 
 * Use this when you generate proofs client-side using snarkjs or similar.
 * The server will verify and store the proof for sharing.
 * 
 * @example
 * ```ts
 * // After generating a Groth16 proof client-side
 * const result = await proof.submitBrowserProof({
 *   proofType: 'age',
 *   version: 'groth16-v3',
 *   proof: groth16Proof,
 *   publicSignals: publicSignals,
 *   commitment: commitment,
 *   statement: 'I am at least 21 years old',
 *   minAge: 21,
 *   generatedAt: new Date().toISOString(),
 * });
 * 
 * if (result.ok) {
 *   console.log('Proof stored:', result.value.proofId);
 *   console.log('Share URL:', result.value.shareUrl);
 * }
 * ```
 */
export async function submitBrowserProof(
  options: BrowserProofOptions
): Promise<Result<{
  proofId: string;
  shareUrl: string;
  verifyUrl: string;
}>> {
  const client = getClient();
  const result = await client.post<{
    success: boolean;
    proofId: string;
    shareUrl: string;
    verifyUrl: string;
  }>('/api/proof/submit', {
    ...options,
    generatedLocally: true,
  });

  if (!result.ok) {
    return result;
  }

  return ok({
    proofId: result.value.proofId,
    shareUrl: result.value.shareUrl,
    verifyUrl: result.value.verifyUrl,
  });
}

/**
 * Get proof details.
 * 
 * @example
 * ```ts
 * const result = await proof.get('id_abc123');
 * if (result.ok) {
 *   console.log('Status:', result.value.status);
 * }
 * ```
 */
export async function get(proofId: string): Promise<Result<ProofDetails>> {
  const client = getClient();
  const result = await client.get<{
    success: boolean;
    proof: {
      id: string;
      type: ProofType;
      statement?: string;
      commitment: string;
      verification?: VerificationStatus;
      status: ProofStatus;
      createdAt: string;
      expiresAt?: string;
    };
  }>(`/api/proof/${proofId}`);

  if (!result.ok) {
    return result;
  }

  return ok({
    id: result.value.proof.id,
    type: result.value.proof.type,
    statement: result.value.proof.statement,
    commitment: result.value.proof.commitment,
    verification: result.value.proof.verification,
    status: result.value.proof.status,
    createdAt: result.value.proof.createdAt,
    expiresAt: result.value.proof.expiresAt,
  });
}

/**
 * Verify a proof is valid.
 * 
 * @example
 * ```ts
 * const result = await proof.verify('id_abc123');
 * if (result.ok && result.value.valid) {
 *   console.log('Proof is valid!');
 * }
 * ```
 */
export async function verify(proofId: string): Promise<Result<{
  valid: boolean;
  proofType?: ProofType;
  verification?: VerificationStatus;
  error?: string;
}>> {
  const client = getClient();
  const result = await client.post<{
    valid: boolean;
    proofType?: ProofType;
    verification?: VerificationStatus;
    error?: string;
  }>(`/api/proof/${proofId}/verify`, {});

  return result;
}

/** Result of PIN-based proof verification */
export interface ProofVerifyResult {
  /** Whether verification was successful */
  valid: boolean;
  /** Proof ID that was verified */
  proofId: string;
  /** When the verification occurred */
  verifiedAt: string;
  /** Verification details */
  verification?: VerificationStatus;
  /** Statement describing the proof */
  statement?: string;
}

/**
 * Verify a proof with PIN (for signing authentication).
 * 
 * This is used when a signer needs to prove they own an OTRUST identity
 * proof as part of the signing process. The sender can require this
 * for extra identity verification.
 * 
 * @example
 * ```ts
 * // Verify proof with PIN before signing
 * const result = await proof.verifyWithPin('id_abc123', '123456');
 * 
 * if (result.ok && result.value.valid) {
 *   // Pass the verification result to sign.complete()
 *   await sign.complete(signId, token, hash, {
 *     otrustProof: result.value
 *   });
 * }
 * ```
 */
export async function verifyWithPin(
  proofId: string, 
  pin: string
): Promise<Result<ProofVerifyResult>> {
  // Validate PIN format
  if (!/^\d{6}$/.test(pin)) {
    return err(new OTrustError('invalid_pin', 'PIN must be exactly 6 digits'));
  }

  // Validate proof ID format
  if (!proofId.startsWith('id_') || proofId.length < 10) {
    return err(new OTrustError('invalid_proof_id', 'Invalid Proof ID format'));
  }

  const client = getClient();
  const result = await client.post<{
    success: boolean;
    valid: boolean;
    proofId: string;
    verifiedAt: string;
    verification?: VerificationStatus;
    statement?: string;
    message?: string;
  }>('/api/proof/verify', {
    proofId,
    pin,
  });

  if (!result.ok) {
    return result;
  }

  if (!result.value.valid) {
    return err(new OTrustError('verification_failed', result.value.message ?? 'Proof verification failed'));
  }

  return ok({
    valid: result.value.valid,
    proofId: result.value.proofId,
    verifiedAt: result.value.verifiedAt,
    verification: result.value.verification,
    statement: result.value.statement,
  });
}

/**
 * Get wallet pass data.
 * 
 * @example
 * ```ts
 * const result = await proof.wallet('id_abc123', 'apple');
 * if (result.ok) {
 *   console.log('Save URL:', result.value.saveUrl);
 * }
 * ```
 */
export async function wallet(
  proofId: string,
  format: WalletFormat = 'apple'
): Promise<Result<{
  format: WalletFormat;
  saveUrl?: string;
  verifyUrl: string;
}>> {
  const client = getClient();
  const result = await client.get<{
    success: boolean;
    format: WalletFormat;
    saveUrl?: string;
    verifyUrl: string;
  }>(`/api/proof/${proofId}/wallet?format=${format}`);

  if (!result.ok) {
    return result;
  }

  return ok({
    format: result.value.format,
    saveUrl: result.value.saveUrl,
    verifyUrl: result.value.verifyUrl,
  });
}

/**
 * Revoke an identity proof (for lost/compromised cases).
 * Returns a recovery token to create a new proof.
 * 
 * @example
 * ```ts
 * const result = await proof.revoke('id_abc123');
 * if (result.ok) {
 *   // Use recoveryToken to create new proof within 24h
 *   console.log('Recovery token:', result.value.recoveryToken);
 * }
 * ```
 */
export async function revoke(proofId: string): Promise<Result<{
  success: boolean;
  recoveryToken: string;
  expiresIn: string;
}>> {
  const client = getClient();
  const result = await client.post<{
    success: boolean;
    recoveryToken: string;
    expiresIn: string;
  }>(`/api/proof/${proofId}/revoke`, {});

  return result;
}

/**
 * Send proof backup to email.
 * 
 * @example
 * ```ts
 * await proof.emailBackup({
 *   email: 'me@example.com',
 *   proofId: 'id_abc123',
 *   secret: 'your-secret',
 *   commitment: 'commitment-hash',
 * });
 * ```
 */
export async function emailBackup(options: {
  email: string;
  proofId: string;
  secret: string;
  commitment: string;
}): Promise<Result<{ success: boolean }>> {
  const client = getClient();
  
  return client.post<{ success: boolean }>('/api/proof/email-backup', {
    ...options,
    shareUrl: `${client.baseUrl}/proof/${options.proofId}`,
  });
}

// ============================================
// Service Object
// ============================================

/** Proof service with all methods */
export const proof = {
  /** Create identity proof WITH face verification (recommended) */
  verifyIdentity,
  /** Create identity proof (low-level, without face verification) */
  identity,
  /** Create age proof */
  age,
  /** Create income proof */
  income,
  /** Create membership proof */
  membership,
  /** Submit a browser-generated ZK proof */
  submitBrowserProof,
  /** Get proof details */
  get,
  /** Verify a proof */
  verify,
  /** Verify a proof with PIN (for signing) */
  verifyWithPin,
  /** Download wallet pass */
  wallet,
  /** Revoke a proof */
  revoke,
  /** Send proof backup to email */
  emailBackup,
};

export default proof;
