/**
 * OTRUST SDK - proof submission and verification.
 *
 * Private inputs must be processed by the published browser circuits. This
 * module never sends private witness values to OTRUST.
 */

import { getClient } from './client.js';
import { Result, ok, err, OTrustError } from './result.js';

export type ProofType = 'identity' | 'age' | 'income' | 'membership';
export type ProofStatus = 'active' | 'revoked' | 'expired';
export type WalletFormat = 'apple' | 'google';

/** Legacy verification metadata. It is not a trusted issuer assertion. */
export interface VerificationStatus {
  faceMatch?: boolean;
  livenessVerified?: boolean;
  documentVerified?: boolean;
}

/** Legacy shape retained so upgrading clients receive a typed local error. */
export interface IdentityProof {
  proofId: string;
  type: 'identity';
  commitment: string;
  secret: string;
  statement: string;
  verification: VerificationStatus;
  shareUrl: string;
  walletUrl: string;
  createdAt: string;
  expiresAt?: string;
}

/** Legacy shape retained so upgrading clients receive a typed local error. */
export interface AgeProof {
  proofId: string;
  type: 'age';
  commitment: string;
  secret: string;
  minAge: number;
  shareUrl: string;
  verifyUrl: string;
}

/** Legacy shape retained so upgrading clients receive a typed local error. */
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

/** Legacy shape retained so upgrading clients receive a typed local error. */
export interface MembershipProof {
  proofId: string;
  type: 'membership';
  commitment: string;
  secret: string;
  organizationName: string;
  shareUrl: string;
  verifyUrl: string;
}

export interface ProofDetails {
  id: string;
  type: ProofType;
  statement?: string;
  commitment: string;
  credentialBinding?: 'trusted_issuer' | 'none';
  verification?: VerificationStatus;
  status: ProofStatus;
  createdAt: string;
  expiresAt?: string;
}

/** Legacy input shape. No field is inspected or transmitted. */
export interface IdentityVerifyOptions {
  personnummer: string;
  birthDate: string;
  pin?: string;
  idDocument: HTMLImageElement | HTMLCanvasElement;
  videoElement: HTMLVideoElement;
  skipFaceVerification?: boolean;
  skipLiveness?: boolean;
  onProgress?: (status: {
    step: 'init' | 'detecting_id_face' | 'verifying_selfie' | 'creating_proof';
    message: string;
    faceDetected?: boolean;
    blinksDetected?: number;
  }) => void;
  recoveryToken?: string;
}

export interface BrowserProofOptions {
  proofType: 'age' | 'income';
  version: 'groth16-v3';
  proof: Record<string, unknown>;
  publicSignals: string[];
  commitment: string;
}

export interface ProofVerifyResult {
  valid: boolean;
  proofId: string;
  verifiedAt: string;
  credentialBinding?: 'trusted_issuer' | 'none';
  verification?: VerificationStatus;
  statement?: string;
}

function trustedIssuerRequired<T>(): Result<T> {
  return err(new OTrustError(
    'trusted_identity_issuer_required',
    'Trusted identity issuance is not currently available'
  ));
}

function browserProofRequired<T>(proofType: 'age' | 'income'): Result<T> {
  return err(new OTrustError(
    'browser_proof_required',
    `Generate the ${proofType} proof locally, then call submitBrowserProof`
  ));
}

/** @deprecated Trusted identity issuance is not currently available. */
export async function verifyIdentity(
  _options: IdentityVerifyOptions
): Promise<Result<IdentityProof>> {
  return trustedIssuerRequired();
}

/** @deprecated Self-attested identity registration is retired. */
export async function identity(_options: {
  personnummer: string;
  birthDate: string;
  pin?: string;
  faceMatch?: boolean;
  livenessVerified?: boolean;
  recoveryToken?: string;
}): Promise<Result<IdentityProof>> {
  return trustedIssuerRequired();
}

/** @deprecated Generate an age proof locally, then use submitBrowserProof. */
export async function age(_options: {
  birthDate: string;
  minAge: number;
}): Promise<Result<AgeProof>> {
  return browserProofRequired('age');
}

/** @deprecated Generate an income proof locally, then use submitBrowserProof. */
export async function income(_options: {
  income: number;
  minIncome: number;
  maxIncome?: number;
}): Promise<Result<IncomeProof>> {
  return browserProofRequired('income');
}

/** @deprecated Membership proof generation is not supported. */
export async function membership(_options: {
  memberId: string;
  organizationId: string;
  organizationName?: string;
}): Promise<Result<MembershipProof>> {
  return err(new OTrustError(
    'feature_unavailable',
    'Membership proof generation is not supported'
  ));
}

/**
 * Submit a locally generated proof using a strict public-field allowlist.
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
    proofType: options.proofType,
    version: options.version,
    proof: options.proof,
    publicSignals: options.publicSignals,
    commitment: options.commitment,
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

export async function get(proofId: string): Promise<Result<ProofDetails>> {
  const client = getClient();
  const result = await client.get<{
    success: boolean;
    proof: ProofDetails;
  }>(`/api/proof/${proofId}`);

  if (!result.ok) {
    return result;
  }

  return ok({
    id: result.value.proof.id,
    type: result.value.proof.type,
    statement: result.value.proof.statement,
    commitment: result.value.proof.commitment,
    credentialBinding: result.value.proof.credentialBinding,
    verification: result.value.proof.verification,
    status: result.value.proof.status,
    createdAt: result.value.proof.createdAt,
    expiresAt: result.value.proof.expiresAt,
  });
}

export async function verify(proofId: string): Promise<Result<{
  valid: boolean;
  proofType?: ProofType;
  credentialBinding?: 'trusted_issuer' | 'none';
  verification?: VerificationStatus;
  error?: string;
}>> {
  const client = getClient();
  return client.post<{
    valid: boolean;
    proofType?: ProofType;
    credentialBinding?: 'trusted_issuer' | 'none';
    verification?: VerificationStatus;
    error?: string;
  }>(`/api/proof/${proofId}/verify`, {});
}

/**
 * Verify ownership of a trusted issuer-bound credential with a PIN.
 */
export async function verifyWithPin(
  proofId: string,
  pin: string
): Promise<Result<ProofVerifyResult>> {
  if (!/^\d{6}$/.test(pin)) {
    return err(new OTrustError('invalid_pin', 'PIN must be exactly 6 digits'));
  }
  if (!proofId.startsWith('id_') || proofId.length < 10) {
    return err(new OTrustError('invalid_proof_id', 'Invalid Proof ID format'));
  }

  const client = getClient();
  const result = await client.post<{
    success: boolean;
    valid: boolean;
    proofId: string;
    verifiedAt: string;
    credentialBinding?: 'trusted_issuer' | 'none';
    verification?: VerificationStatus;
    statement?: string;
    message?: string;
  }>('/api/proof/verify', { proofId, pin });

  if (!result.ok) {
    return result;
  }
  if (!result.value.valid || result.value.credentialBinding !== 'trusted_issuer') {
    return err(new OTrustError(
      'verification_failed',
      result.value.message ?? 'Trusted issuer credential verification failed'
    ));
  }

  return ok({
    valid: true,
    proofId: result.value.proofId,
    verifiedAt: result.value.verifiedAt,
    credentialBinding: result.value.credentialBinding,
    verification: result.value.verification,
    statement: result.value.statement,
  });
}

/**
 * Request wallet metadata for a trusted issuer-bound identity credential.
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

/** @deprecated Credential revocation requires an authenticated issuer. */
export async function revoke(_proofId: string): Promise<Result<{
  success: boolean;
  recoveryToken: string;
  expiresIn: string;
}>> {
  return err(new OTrustError(
    'trusted_identity_issuer_required',
    'Credential revocation requires an authenticated issuer integration'
  ));
}

/** @deprecated Client-supplied identity backup email is retired. */
export async function emailBackup(_options: {
  email: string;
  proofId: string;
  secret: string;
  commitment: string;
}): Promise<Result<{ success: boolean }>> {
  return err(new OTrustError(
    'legacy_feature_retired',
    'Client-supplied identity backup email is retired'
  ));
}

export const proof = {
  verifyIdentity,
  identity,
  age,
  income,
  membership,
  submitBrowserProof,
  get,
  verify,
  verifyWithPin,
  wallet,
  revoke,
  emailBackup,
};

export default proof;
