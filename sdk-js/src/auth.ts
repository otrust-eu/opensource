/**
 * OTRUST SDK - Auth Service
 * 
 * Issuer-bound partner authentication.
 * Production challenge creation is unavailable until a trusted issuer is configured.
 */

import { getClient, ClientConfig } from './client.js';
import { Result, ok, err, OTrustError } from './result.js';

// ============================================
// Types
// ============================================

/** Auth scopes */
export type AuthScope = 'identity' | 'email' | 'verification';

/** Challenge response */
export interface AuthChallenge {
  /** Unique challenge ID */
  challengeId: string;
  /** Challenge string for signing */
  challenge: string;
  /** Login URL to redirect user to */
  loginUrl: string;
  /** Seconds until challenge expires */
  expiresIn: number;
}

/** Auth token response */
export interface AuthToken {
  /** The auth token */
  token: string;
  /** Redirect URL with token */
  redirectUrl: string;
  /** Seconds until token expires */
  expiresIn: number;
}

/** Verified issuer-bound identity token */
export interface VerifiedIdentity {
  /** Whether the token is valid */
  valid: boolean;
  /** Proof ID */
  proofId: string;
  /** Client ID that requested auth */
  clientId: string;
  /** Granted scopes */
  scope: AuthScope[];
  /** When token was issued */
  issuedAt: string;
  /** When token expires */
  expiresAt: string;
  /** Identity details */
  identity?: {
    verified: boolean;
    credentialBinding: 'trusted_issuer';
    issuer?: {
      id?: string;
      name?: string;
    } | null;
    verification?: {
      faceMatch?: boolean;
      livenessVerified?: boolean;
      documentVerified?: boolean;
    };
    createdAt: string;
  };
}

/** User info from userinfo endpoint */
export interface UserInfo {
  /** Proof ID */
  proofId: string;
  /** Whether identity is verified */
  verified: boolean;
  /** Credential provenance accepted by Auth */
  credentialBinding: 'trusted_issuer';
  /** Trusted issuer metadata */
  issuer?: {
    id?: string;
    name?: string;
  } | null;
  /** Truncated identity hash */
  identityHash?: string;
  /** Verification details */
  verification?: {
    faceMatch?: boolean;
    livenessVerified?: boolean;
    documentVerified?: boolean;
  };
  /** When identity was created */
  createdAt: string;
  /** When identity expires */
  expiresAt?: string;
}

// ============================================
// Main API Functions
// ============================================

/**
 * Create an auth challenge for "Login with OTRUST".
 * 
 * @example
 * ```ts
 * // Server-side: Create challenge
 * const result = await auth.createChallenge({
 *   clientId: 'my-app',
 *   redirectUri: 'https://my-app.com/callback',
 *   scope: ['identity'],
 *   state: generateRandomState(),
 * });
 * 
 * if (result.ok) {
 *   // Redirect user to loginUrl
 *   res.redirect(result.value.loginUrl);
 * }
 * ```
 */
export async function createChallenge(options: {
  /** Your application's client ID */
  clientId: string;
  /** URL to redirect back to after auth */
  redirectUri: string;
  /** Requested scopes */
  scope?: AuthScope[];
  /** State parameter (for CSRF protection) */
  state?: string;
}): Promise<Result<AuthChallenge>> {
  if (!options.clientId) {
    return err(new OTrustError('validation_error', 'clientId is required'));
  }
  
  if (!options.redirectUri) {
    return err(new OTrustError('validation_error', 'redirectUri is required'));
  }

  const state = options.state ?? generateState();
  const client = getClient();
  const result = await client.post<{
    success: boolean;
    challengeId: string;
    challenge: string;
    loginUrl: string;
    expiresIn: number;
  }>('/api/v1/auth/challenge', {
    clientId: options.clientId,
    redirectUri: options.redirectUri,
    scope: options.scope ?? ['identity'],
    state,
  });

  if (!result.ok) {
    return result;
  }

  return ok({
    challengeId: result.value.challengeId,
    challenge: result.value.challenge,
    loginUrl: result.value.loginUrl,
    expiresIn: result.value.expiresIn,
  });
}

/** @deprecated A valid hosted URL is returned by createChallenge. */
export function loginUrl(options: {
  clientId: string;
  redirectUri: string;
  scope?: AuthScope[];
  state?: string;
}): Result<string> {
  if (!options.clientId) {
    return err(new OTrustError('validation_error', 'clientId is required'));
  }
  
  if (!options.redirectUri) {
    return err(new OTrustError('validation_error', 'redirectUri is required'));
  }

  return err(new OTrustError(
    'server_challenge_required',
    'Create a server challenge and use the loginUrl returned by createChallenge'
  ));
}

/**
 * Prove identity ownership (used on login page).
 * Typically called by OTRUST's login page, not by your app.
 * 
 * @example
 * ```ts
 * const result = await auth.prove({
 *   challengeId: 'ch_xxx',
 *   proofId: 'id_abc123',
 *   secret: 'user-secret',
 * });
 * ```
 */
export async function prove(options: {
  challengeId: string;
  proofId: string;
  secret?: string;
  pin?: string;
}): Promise<Result<AuthToken>> {
  if (!options.challengeId || !options.proofId) {
    return err(new OTrustError(
      'validation_error',
      'challengeId and proofId are required'
    ));
  }
  if (!options.secret && !options.pin) {
    return err(new OTrustError(
      'validation_error',
      'A credential secret or PIN is required'
    ));
  }

  const client = getClient();
  const result = await client.post<{
    success: boolean;
    token: string;
    redirectUrl: string;
    expiresIn: number;
  }>('/api/v1/auth/prove', options);

  if (!result.ok) {
    return result;
  }

  return ok({
    token: result.value.token,
    redirectUrl: result.value.redirectUrl,
    expiresIn: result.value.expiresIn,
  });
}

/**
 * Verify an auth token.
 * Call this in your callback handler to validate the token.
 * 
 * @example
 * ```ts
 * // In your callback handler
 * const token = req.query.token;
 * const state = req.query.state;
 * 
 * // Verify state matches what you sent
 * if (state !== savedState) {
 *   throw new Error('Invalid state');
 * }
 * 
 * // Verify token
 * const result = await auth.verify(token);
 * if (result.ok && result.value.valid) {
 *   // User is authenticated!
 *   console.log('Proof ID:', result.value.proofId);
 *   console.log('Verified:', result.value.identity?.verified);
 * }
 * ```
 */
export async function verify(token: string): Promise<Result<VerifiedIdentity>> {
  if (!token) {
    return err(new OTrustError('validation_error', 'Token is required'));
  }

  const client = getClient();
  const result = await client.post<{
    valid: boolean;
    proofId: string;
    clientId: string;
    scope: AuthScope[];
    issuedAt: string;
    expiresAt: string;
    identity?: {
      verified: boolean;
      credentialBinding: 'trusted_issuer';
      issuer?: {
        id?: string;
        name?: string;
      } | null;
      verification?: {
        faceMatch?: boolean;
        livenessVerified?: boolean;
        documentVerified?: boolean;
      };
      createdAt: string;
    };
  }>('/api/v1/auth/verify', { token });

  return result;
}

/**
 * Get user info with a valid token.
 * 
 * @example
 * ```ts
 * const result = await auth.userinfo(token);
 * if (result.ok) {
 *   console.log('User proof ID:', result.value.proofId);
 *   console.log('Verified:', result.value.verified);
 * }
 * ```
 */
export async function userinfo(token: string): Promise<Result<UserInfo>> {
  if (!token) {
    return err(new OTrustError('validation_error', 'Token is required'));
  }

  const client = getClient();
  const result = await client.get<UserInfo>('/api/v1/auth/userinfo', {
    headers: { 'Authorization': `Bearer ${token}` },
  });

  return result;
}

// ============================================
// Helper Functions
// ============================================

/**
 * Parse callback URL to extract token and state.
 * 
 * @example
 * ```ts
 * const { token, state } = auth.parseCallback(window.location.href);
 * ```
 */
export function parseCallback(url: string): { token?: string; state?: string } {
  try {
    const parsed = new URL(url);
    return {
      token: parsed.searchParams.get('token') ?? undefined,
      state: parsed.searchParams.get('state') ?? undefined,
    };
  } catch {
    return {};
  }
}

/**
 * Generate a random state string for CSRF protection.
 * 
 * @example
 * ```ts
 * const state = auth.generateState();
 * // Store state in session, then use in createChallenge
 * ```
 */
export function generateState(): string {
  const bytes = new Uint8Array(16);
  crypto.getRandomValues(bytes);
  return Array.from(bytes)
    .map(b => b.toString(16).padStart(2, '0'))
    .join('');
}

// ============================================
// Service Object
// ============================================

/** Auth service with all methods */
export const auth = {
  createChallenge,
  loginUrl,
  prove,
  verify,
  userinfo,
  parseCallback,
  generateState,
};

export default auth;
