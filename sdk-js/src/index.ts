/**
 * OTRUST SDK
 *
 * Official SDK for OTRUST - Zero-knowledge timestamping, signing, identity proofs, and authentication.
 *
 * @example
 * ```ts
 * import { timestamp, sign, proof, auth, configure } from '@otrust/sdk';
 *
 * // Configure (optional - defaults to https://otrust.eu)
 * configure({ baseUrl: 'https://otrust.eu' });
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
 * // Create identity proof
 * const proofResult = await proof.identity({
 *   personnummer: '19900101-1234',
 *   birthDate: '1990-01-01',
 * });
 *
 * // Login with OTRUST
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
import { face } from './face.js';

// Re-export all services
export { timestamp, sign, proof, auth, face };

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
  FaceDetection,
  FaceVerificationResult,
  LivenessStatus,
  VerifySelfieOptions,
} from './face.js';

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
