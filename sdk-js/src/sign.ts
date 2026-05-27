/**
 * OTRUST SDK - Sign Service
 *
 * Multi-party document signing with zero-knowledge proofs.
 */

import { getClient } from './client.js';
import { Result, ok, err, OTrustError } from './result.js';
import { sha256, hashFile, isValidHash } from './crypto.js';

// ============================================
// Types
// ============================================

/** Party role in signing */
export type PartyRole = 'signer' | 'approver' | 'viewer';

/** Party action */
export type PartyAction = 'signed' | 'approved' | 'viewed' | 'declined' | null;

/** Sign request status */
export type SignStatus = 'pending' | 'completed' | 'expired' | 'cancelled' | 'declined';

/** Signing order */
export type SigningOrder = 'parallel' | 'sequential';

/** Party in a sign request */
export interface Party {
  /** Email address */
  email: string;
  /** Display name */
  name?: string;
  /** Role: signer, approver, or viewer */
  role: PartyRole;
  /** Order for sequential signing */
  order?: number;
  /** Require OTRUST Proof verification before signing */
  requireOtrustProof?: boolean;
}

/** Party status */
export interface PartyStatus extends Party {
  /** Action taken */
  action: PartyAction;
  /** When they were notified */
  notifiedAt?: string;
  /** When they acted */
  actedAt?: string;
  /** OTRUST Proof data if verified */
  otrustProof?: {
    proofId: string;
    verifiedAt: string;
  };
}

/** Sign request */
export interface SignRequest {
  /** Unique request ID (e.g., "sr_xyz789") */
  id: string;
  /** Document hash */
  documentHash: string;
  /** Document title/name */
  title: string;
  /** Optional message to parties */
  message?: string;
  /** Creator email */
  creatorEmail: string;
  /** All parties */
  parties: PartyStatus[];
  /** Signing order */
  signingOrder: SigningOrder;
  /** Current status */
  status: SignStatus;
  /** Deadline for completion */
  deadline?: string;
  /** When created */
  createdAt: string;
  /** Status page URL */
  statusUrl: string;
  /** Cancel token (only for creator) */
  cancelToken?: string;
}

/** Options for creating a sign request */
export interface CreateSignOptions {
  /** Document title/name */
  title: string;
  /** Parties to sign */
  parties: Party[];
  /** Creator email */
  creatorEmail: string;
  /** Optional message */
  message?: string;
  /** Signing order: parallel (default) or sequential */
  signingOrder?: SigningOrder;
  /** Deadline as ISO string or relative string like "7d" */
  deadline?: string;
  /** Document URL (if not using temporary storage) */
  documentUrl?: string;
}

/** File upload response */
export interface UploadedFile {
  /** File ID (e.g., "sf_xyz789") */
  fileId: string;
  /** Secure token for creator access */
  fileToken: string;
  /** SHA-256 hash of the document */
  documentHash: string;
  /** Original filename */
  filename: string;
  /** File size in bytes */
  size: number;
  /** Expiration time as ISO string */
  expiresAt: string;
  /** TTL in hours */
  ttlHours: number;
}

/** Options for file upload */
export interface UploadOptions {
  /** Custom filename (defaults to File.name or 'document') */
  filename?: string;
  /** TTL in hours: 1, 6, or 12 (default 1) */
  ttlHours?: 1 | 6 | 12;
  /** Creator email for notifications */
  creatorEmail?: string;
}

// ============================================
// Main API Functions
// ============================================

/**
 * Upload a document for signing (temporary storage).
 * Files are stored for up to 12 hours, then automatically deleted.
 *
 * @example
 * ```ts
 * const file = document.getElementById('fileInput').files[0];
 * const result = await sign.upload(file, { ttlHours: 6 });
 *
 * if (result.ok) {
 *   console.log('File uploaded:', result.value.fileId);
 *   console.log('Document hash:', result.value.documentHash);
 *
 *   // Now create a sign request
 *   const signResult = await sign.create(result.value.documentHash, {
 *     title: file.name,
 *     creatorEmail: 'alice@example.com',
 *     parties: [{ email: 'bob@example.com', role: 'signer' }],
 *   });
 * }
 * ```
 */
export async function upload(
  document: File | Blob | ArrayBuffer,
  options: UploadOptions = {}
): Promise<Result<UploadedFile>> {
  const client = getClient();

  // Get file buffer
  let buffer: ArrayBuffer;
  let filename = options.filename || 'document';

  if (document instanceof File) {
    buffer = await document.arrayBuffer();
    filename = options.filename || document.name;
  } else if (document instanceof Blob) {
    buffer = await document.arrayBuffer();
  } else {
    buffer = document;
  }

  // Size check (25MB max)
  if (buffer.byteLength > 25 * 1024 * 1024) {
    return err(new OTrustError('validation_error', 'File must be under 25MB'));
  }

  // Use raw fetch for binary upload
  const response = await fetch(`${client.baseUrl}/sign/upload`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/octet-stream',
      'X-Filename': filename,
      'X-TTL-Hours': String(options.ttlHours || 1),
      ...(options.creatorEmail ? { 'X-Creator-Email': options.creatorEmail } : {}),
      ...client.headers,
    },
    body: buffer,
  });

  if (!response.ok) {
    const errorData = await response.json().catch(() => ({}));
    return err(new OTrustError(
      errorData.error || 'upload_failed',
      errorData.message || `Upload failed: ${response.status}`
    ));
  }

  const data = await response.json();

  return ok({
    fileId: data.file_id,
    fileToken: data.file_token,
    documentHash: data.document_hash,
    filename: data.filename,
    size: data.size,
    expiresAt: data.expires_at,
    ttlHours: data.ttl_hours,
  });
}

/**
 * Download a document by file ID.
 * Requires a valid signing token, view token, or file token.
 *
 * @example
 * ```ts
 * // As a signer with their token
 * const result = await sign.downloadFile('sf_xyz789', { token: signerToken, signId: 'sr_abc123' });
 *
 * // As creator with file token
 * const result = await sign.downloadFile('sf_xyz789', { fileToken });
 *
 * if (result.ok) {
 *   // Create download link
 *   const url = URL.createObjectURL(result.value.blob);
 *   const a = document.createElement('a');
 *   a.href = url;
 *   a.download = result.value.filename;
 *   a.click();
 * }
 * ```
 */
export async function downloadFile(
  fileId: string,
  auth: { token?: string; signId?: string; viewToken?: string; fileToken?: string }
): Promise<Result<{ blob: Blob; filename: string; mimeType: string }>> {
  if (!fileId.startsWith('sf_')) {
    return err(new OTrustError('validation_error', 'Invalid file ID'));
  }

  const client = getClient();
  const params = new URLSearchParams();

  if (auth.token) params.set('token', auth.token);
  if (auth.signId) params.set('sign_id', auth.signId);
  if (auth.viewToken) params.set('view_token', auth.viewToken);
  if (auth.fileToken) params.set('file_token', auth.fileToken);

  const url = `${client.baseUrl}/sign/file/${fileId}?${params.toString()}`;

  const response = await fetch(url, {
    headers: {
      'Accept': 'application/octet-stream',
      ...client.headers,
    },
  });

  if (!response.ok) {
    if (response.status === 410) {
      return err(new OTrustError('file_deleted', 'File has been deleted (privacy purge)'));
    }
    const errorData = await response.json().catch(() => ({}));
    return err(new OTrustError(
      errorData.error || 'download_failed',
      errorData.message || `Download failed: ${response.status}`
    ));
  }

  const blob = await response.blob();
  const contentDisposition = response.headers.get('Content-Disposition');
  const filename = contentDisposition?.match(/filename="?([^"]+)"?/)?.[1] || 'document';
  const mimeType = response.headers.get('Content-Type') || 'application/octet-stream';

  return ok({ blob, filename, mimeType });
}

/**
 * Get sign request details for acting (signing/approving).
 * This is used by the signing party when they receive a signing link.
 *
 * @example
 * ```ts
 * // Get request details using token from email link
 * const result = await sign.getActInfo('sr_xyz789', token);
 *
 * if (result.ok) {
 *   console.log('Document:', result.value.title);
 *   console.log('Your role:', result.value.party.role);
 *   console.log('File ID:', result.value.fileId); // Download with this
 * }
 * ```
 */
export async function getActInfo(
  requestId: string,
  token: string
): Promise<Result<SignRequest & { fileId?: string; party?: PartyStatus }>> {
  if (!requestId.startsWith('sr_')) {
    return err(new OTrustError('validation_error', 'Invalid sign request ID'));
  }

  const client = getClient();
  const result = await client.get<{
    id: string;
    document_hash: string;
    title: string;
    message?: string;
    creator_email: string;
    parties: Array<{
      email: string;
      name?: string;
      role: PartyRole;
      action: PartyAction;
      order?: number;
      notified_at?: string;
      acted_at?: string;
      otrust_proof?: {
        proof_id: string;
        verified_at: string;
      };
    }>;
    signing_order: SigningOrder;
    status: SignStatus;
    deadline?: string;
    created_at: string;
    file_id?: string;
    current_party?: {
      email: string;
      name?: string;
      role: PartyRole;
      action: PartyAction;
      order?: number;
      requireOtrustProof?: boolean;
    };
  }>(`/sign/${requestId}/act?token=${token}`);

  if (!result.ok) {
    return result;
  }

  const data = result.value;

  return ok({
    id: data.id,
    documentHash: data.document_hash,
    title: data.title,
    message: data.message,
    creatorEmail: data.creator_email,
    parties: data.parties.map(p => ({
      email: p.email,
      name: p.name,
      role: p.role,
      action: p.action,
      order: p.order,
      notifiedAt: p.notified_at,
      actedAt: p.acted_at,
      otrustProof: p.otrust_proof ? {
        proofId: p.otrust_proof.proof_id,
        verifiedAt: p.otrust_proof.verified_at,
      } : undefined,
    })),
    signingOrder: data.signing_order,
    status: data.status,
    deadline: data.deadline,
    createdAt: data.created_at,
    statusUrl: `${client.baseUrl}/sign/view?id=${data.id}`,
    fileId: data.file_id,
    party: data.current_party ? {
      email: data.current_party.email,
      name: data.current_party.name,
      role: data.current_party.role,
      action: data.current_party.action,
      order: data.current_party.order,
      requireOtrustProof: data.current_party.requireOtrustProof,
    } : undefined,
  });
}

/**
 * Create a new multi-party signing request.
 *
 * @example
 * ```ts
 * // Create a sign request
 * const result = await sign.create(file, {
 *   title: 'Contract Agreement',
 *   creatorEmail: 'alice@example.com',
 *   parties: [
 *     { email: 'bob@example.com', name: 'Bob', role: 'signer' },
 *     { email: 'carol@example.com', name: 'Carol', role: 'approver' },
 *   ],
 *   deadline: '7d', // 7 days
 * });
 *
 * if (result.ok) {
 *   console.log('Sign request created:', result.value.id);
 * }
 * ```
 */
export async function create(
  document: File | Blob | string,
  options: CreateSignOptions
): Promise<Result<SignRequest>> {
  // Hash the document
  let documentHash: string;

  if (document instanceof File || document instanceof Blob) {
    documentHash = await hashFile(document);
  } else if (isValidHash(document)) {
    documentHash = document.toLowerCase();
  } else {
    documentHash = await sha256(document);
  }

  // Validate options
  if (!options.title) {
    return err(new OTrustError('validation_error', 'Title is required'));
  }

  if (!options.creatorEmail) {
    return err(new OTrustError('validation_error', 'Creator email is required'));
  }

  if (!options.parties || options.parties.length === 0) {
    return err(new OTrustError('validation_error', 'At least one party is required'));
  }

  // Parse deadline
  let deadline: string | undefined;
  if (options.deadline) {
    const match = options.deadline.match(/^(\d+)([dhm])$/);
    if (match) {
      const value = parseInt(match[1] as string);
      const unit = match[2];
      const now = new Date();
      switch (unit) {
        case 'd':
          now.setDate(now.getDate() + value);
          break;
        case 'h':
          now.setHours(now.getHours() + value);
          break;
        case 'm':
          now.setMinutes(now.getMinutes() + value);
          break;
      }
      deadline = now.toISOString();
    } else {
      deadline = options.deadline; // Assume ISO string
    }
  }

  const client = getClient();
  const result = await client.post<{
    success: boolean;
    request_id: string;
    status_url: string;
    cancel_token: string;
    created_at: string;
  }>('/sign/create', {
    document_hash: documentHash,
    title: options.title,
    message: options.message,
    creator_email: options.creatorEmail,
    parties: options.parties.map((p, i) => ({
      email: p.email,
      name: p.name,
      role: p.role,
      order: p.order ?? (options.signingOrder === 'sequential' ? i + 1 : 1),
      requireOtrustProof: p.requireOtrustProof ?? false,
    })),
    signing_order: options.signingOrder ?? 'parallel',
    deadline,
    document_url: options.documentUrl,
  });

  if (!result.ok) {
    return result;
  }

  return ok({
    id: result.value.request_id,
    documentHash,
    title: options.title,
    message: options.message,
    creatorEmail: options.creatorEmail,
    parties: options.parties.map((p, i) => ({
      ...p,
      action: null,
      order: p.order ?? (options.signingOrder === 'sequential' ? i + 1 : 1),
    })),
    signingOrder: options.signingOrder ?? 'parallel',
    status: 'pending',
    deadline,
    createdAt: result.value.created_at,
    statusUrl: result.value.status_url,
    cancelToken: result.value.cancel_token,
  });
}

/**
 * Get the status of a sign request.
 *
 * @example
 * ```ts
 * const result = await sign.status('sr_xyz789');
 * if (result.ok) {
 *   console.log('Status:', result.value.status);
 *   console.log('Completed:', result.value.parties.filter(p => p.action).length);
 * }
 * ```
 */
export async function status(requestId: string, viewToken?: string): Promise<Result<SignRequest>> {
  const client = getClient();
  const url = viewToken
    ? `/sign/${requestId}?token=${viewToken}`
    : `/sign/${requestId}`;

  const result = await client.get<{
    id: string;
    document_hash: string;
    title: string;
    message?: string;
    creator_email: string;
    parties: Array<{
      email: string;
      name?: string;
      role: PartyRole;
      order?: number;
      action: PartyAction;
      notified_at?: string;
      acted_at?: string;
    }>;
    signing_order: SigningOrder;
    status: SignStatus;
    deadline?: string;
    created_at: string;
  }>(url);

  if (!result.ok) {
    return result;
  }

  return ok({
    id: result.value.id,
    documentHash: result.value.document_hash,
    title: result.value.title,
    message: result.value.message,
    creatorEmail: result.value.creator_email,
    parties: result.value.parties.map(p => ({
      email: p.email,
      name: p.name,
      role: p.role,
      order: p.order,
      action: p.action,
      notifiedAt: p.notified_at,
      actedAt: p.acted_at,
    })),
    signingOrder: result.value.signing_order,
    status: result.value.status,
    deadline: result.value.deadline,
    createdAt: result.value.created_at,
    statusUrl: `https://otrust.eu/sign/${result.value.id}`,
  });
}

/**
 * Cancel a sign request.
 *
 * @example
 * ```ts
 * const result = await sign.cancel('sr_xyz789', cancelToken);
 * ```
 */
export async function cancel(requestId: string, cancelToken: string): Promise<Result<{ success: boolean }>> {
  const client = getClient();
  const result = await client.post<{ success: boolean }>(`/sign/${requestId}/cancel`, {
    cancel_token: cancelToken,
  });

  return result;
}

/**
 * Send reminder to pending parties.
 *
 * @example
 * ```ts
 * const result = await sign.remind('sr_xyz789', cancelToken);
 * ```
 */
export async function remind(requestId: string, cancelToken: string): Promise<Result<{ success: boolean; reminded: number }>> {
  const client = getClient();
  const result = await client.post<{ success: boolean; reminded_count: number }>(`/sign/${requestId}/remind`, {
    cancel_token: cancelToken,
  });

  if (!result.ok) {
    return result;
  }

  return ok({
    success: result.value.success,
    reminded: result.value.reminded_count,
  });
}

/**
 * Verify a document hash matches the sign request.
 *
 * @example
 * ```ts
 * const result = await sign.verifyDocument('sr_xyz789', file);
 * if (result.ok && result.value.matches) {
 *   console.log('Document matches!');
 * }
 * ```
 */
export async function verifyDocument(
  requestId: string,
  document: File | Blob | string
): Promise<Result<{ matches: boolean }>> {
  let documentHash: string;

  if (document instanceof File || document instanceof Blob) {
    documentHash = await hashFile(document);
  } else if (isValidHash(document)) {
    documentHash = document.toLowerCase();
  } else {
    documentHash = await sha256(document);
  }

  const client = getClient();
  const result = await client.post<{ valid: boolean }>(`/sign/${requestId}/verify`, {
    document_hash: documentHash,
  });

  if (!result.ok) {
    return result;
  }

  return ok({ matches: result.value.valid });
}

/**
 * Get the signature package (proof) for a completed sign request.
 *
 * @example
 * ```ts
 * const result = await sign.getPackage('sr_xyz789');
 * if (result.ok) {
 *   console.log('Package hash:', result.value.packageHash);
 * }
 * ```
 */
export async function getPackage(requestId: string): Promise<Result<{
  packageHash: string;
  signatures: Array<{
    email: string;
    role: PartyRole;
    signature: string;
    timestamp: string;
  }>;
  blockchainStatus: 'pending' | 'confirmed';
}>> {
  const client = getClient();
  const result = await client.get<{
    package_hash: string;
    signatures: Array<{
      email: string;
      role: PartyRole;
      signature: string;
      timestamp: string;
    }>;
    blockchain_status: string;
  }>(`/sign/${requestId}/package`);

  if (!result.ok) {
    return result;
  }

  return ok({
    packageHash: result.value.package_hash,
    signatures: result.value.signatures,
    blockchainStatus: result.value.blockchain_status === 'confirmed' ? 'confirmed' : 'pending',
  });
}

/** Options for completing a signature */
export interface CompleteSignOptions {
  /** Cryptographic signature (Ed25519 hex) */
  signature?: string;
  /** Public key (Ed25519 hex) */
  pubkey?: string;
  /** OTRUST Proof verification (if required by sender) */
  otrustProof?: {
    valid: boolean;
    proofId: string;
    verifiedAt: string;
    verification?: {
      faceMatch?: boolean;
      livenessVerified?: boolean;
      documentVerified?: boolean;
    };
  };
}

/** Result of completing a signature */
export interface CompleteSignResult {
  success: boolean;
  action: PartyAction;
  signId: string;
  completedAt: string;
  allPartiesComplete?: boolean;
  status?: SignStatus;
}

/**
 * Complete a signature/approval/view action on a sign request.
 *
 * @example
 * ```ts
 * // First verify proof if required
 * const proofResult = await proof.verifyWithPin('id_abc123', '123456');
 *
 * // Then complete signature with proof
 * const result = await sign.complete('sr_xyz789', 'token_abc', documentHash, 'signed', {
 *   signature: mySignature,
 *   pubkey: myPubkey,
 *   otrustProof: proofResult.ok ? proofResult.value : undefined,
 * });
 * ```
 */
export async function complete(
  requestId: string,
  token: string,
  documentHash: string,
  action: 'signed' | 'approved' | 'viewed' | 'declined',
  options: CompleteSignOptions = {}
): Promise<Result<CompleteSignResult>> {
  if (!requestId.startsWith('sr_')) {
    return err(new OTrustError('invalid_id', 'Invalid sign request ID'));
  }

  if (!isValidHash(documentHash)) {
    return err(new OTrustError('invalid_hash', 'Invalid document hash'));
  }

  const client = getClient();
  const result = await client.post<{
    success: boolean;
    action: PartyAction;
    sign_id: string;
    completed_at: string;
    all_parties_complete?: boolean;
    status?: SignStatus;
  }>(`/sign/${requestId}/complete`, {
    token,
    document_hash: documentHash,
    action,
    signature: options.signature,
    pubkey: options.pubkey,
    otrustProof: options.otrustProof,
  });

  if (!result.ok) {
    return result;
  }

  return ok({
    success: result.value.success,
    action: result.value.action,
    signId: result.value.sign_id,
    completedAt: result.value.completed_at,
    allPartiesComplete: result.value.all_parties_complete,
    status: result.value.status,
  });
}

// ============================================
// Service Object
// ============================================

/** Sign service with all methods */
export const sign = {
  upload,
  downloadFile,
  getActInfo,
  create,
  status,
  cancel,
  remind,
  verifyDocument,
  getPackage,
  complete,
};

export default sign;
