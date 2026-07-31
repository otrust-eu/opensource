/**
 * OTRUST SDK
 * 
 * Official SDK for OTRUST timestamping, signing, public proof submission, and gated authentication.
 * 
 * @example
 * ```ts
 * import { timestamp, sign, proof, auth, configure } from '@otrust/sdk';
 * 
 * // Configure (optional - defaults to https://www.otrust.eu)
 * configure({ baseUrl: 'https://www.otrust.eu' });
 * 
 * // Timestamp a file
 * const result = await timestamp.create(file);
 * if (result.ok) {
 *   console.log('Receipt:', result.value.receiptId);
 * }
 * 
 * // Create a sign request
 * const signResult = await sign.create(file, {
 *   title: 'Contract',
 *   creatorEmail: 'alice@example.com',
 *   parties: [{ email: 'bob@example.com', role: 'signer' }],
 * });
 * 
 * // Submit a Groth16 proof generated in a trusted local environment
 * const proofResult = await proof.submitBrowserProof({
 *   proofType: 'age',
 *   version: 'groth16-v3',
 *   proof: groth16Proof,
 *   publicSignals,
 *   commitment: publicSignals[5],
 * });
 * 
 * // Create an Auth challenge only after health reports a trusted issuer
 * const authResult = await auth.createChallenge({
 *   clientId: 'my-app',
 *   redirectUri: 'https://my-app.com/callback',
 * });
 * ```
 * 
 * @packageDocumentation
 */

// Import services
import { timestamp } from './timestamp.js';
import { sign } from './sign.js';
import { proof } from './proof.js';
import { auth } from './auth.js';
import { admin } from './admin.js';

// Re-export all services
export { timestamp, sign, proof, auth, admin };

// Re-export types
export type {
  TimestampClaim,
  VerifyResult,
  BulkVerifyResult,
  CreateOptions,
  Challenge,
  ProofOfWork,
  BulkClaimInput,
  BulkClaimResult,
  Receipt,
} from './timestamp.js';

export type {
  Party,
  PartyRole,
  PartyAction,
  PartyStatus,
  SignRequest,
  SignStatus,
  SigningOrder,
  CreateSignOptions,
  CompleteSignOptions,
  CompleteSignResult,
  UploadedFile,
  UploadOptions,
} from './sign.js';

export type {
  ProofType,
  ProofStatus,
  IdentityProof,
  AgeProof,
  IncomeProof,
  MembershipProof,
  ProofDetails,
  VerificationStatus,
  WalletFormat,
  ProofVerifyResult,
  BrowserProofOptions,
} from './proof.js';

export type {
  AuthScope,
  AuthChallenge,
  AuthToken,
  VerifiedIdentity,
  UserInfo,
} from './auth.js';

export type {
  SystemStats,
  AbuseReport,
  AbuseReportStatus,
  ListAbuseReportsOptions,
  RateLimitInfo,
} from './admin.js';

// Re-export client utilities
export {
  configure,
  createClient,
  getClient,
  Client,
  isBrowser,
  requireBrowser,
  requireServer,
  type ClientConfig,
  type RequestOptions,
} from './client.js';

// Re-export Result types and utilities
export {
  ok,
  err,
  isOk,
  isErr,
  unwrap,
  unwrapOr,
  map,
  mapErr,
  andThen,
  OTrustError,
  type Result,
  type Ok,
  type Err,
  type OTrustErrorCode,
} from './result.js';

// Re-export crypto utilities
export {
  sha256,
  hashFile,
  hashFileWithProgress,
  bufferToHex,
  hexToBuffer,
  randomHex,
  uuid,
  isValidHash,
  generateEd25519Keypair,
  signEd25519,
  verifyEd25519,
} from './crypto.js';

// Version
export const VERSION = '1.0.0';
