/**
 * OTRUST SDK - Result Types
 * 
 * Modern error handling using Result types instead of try/catch.
 * Inspired by Rust's Result<T, E> pattern.
 */

/** Success result containing a value */
export interface Ok<T> {
  readonly ok: true;
  readonly value: T;
}

/** Error result containing an error */
export interface Err<E> {
  readonly ok: false;
  readonly error: E;
}

/** Result type - either Ok<T> or Err<E> */
export type Result<T, E = OTrustError> = Ok<T> | Err<E>;

/** Create a success result */
export function ok<T>(value: T): Ok<T> {
  return { ok: true, value };
}

/** Create an error result */
export function err<E>(error: E): Err<E> {
  return { ok: false, error };
}

/** Check if result is Ok */
export function isOk<T, E>(result: Result<T, E>): result is Ok<T> {
  return result.ok === true;
}

/** Check if result is Err */
export function isErr<T, E>(result: Result<T, E>): result is Err<E> {
  return result.ok === false;
}

/** Unwrap a result, throwing if it's an error */
export function unwrap<T, E>(result: Result<T, E>): T {
  if (result.ok) {
    return result.value;
  }
  throw result.error;
}

/** Unwrap a result with a default value */
export function unwrapOr<T, E>(result: Result<T, E>, defaultValue: T): T {
  if (result.ok) {
    return result.value;
  }
  return defaultValue;
}

/** Map the value of a successful result */
export function map<T, U, E>(result: Result<T, E>, fn: (value: T) => U): Result<U, E> {
  if (result.ok) {
    return ok(fn(result.value));
  }
  return result;
}

/** Map the error of a failed result */
export function mapErr<T, E, F>(result: Result<T, E>, fn: (error: E) => F): Result<T, F> {
  if (!result.ok) {
    return err(fn(result.error));
  }
  return result;
}

/** Chain results together */
export function andThen<T, U, E>(result: Result<T, E>, fn: (value: T) => Result<U, E>): Result<U, E> {
  if (result.ok) {
    return fn(result.value);
  }
  return result;
}

/** OTRUST Error codes */
export type OTrustErrorCode =
  | 'network_error'
  | 'timeout'
  | 'invalid_response'
  | 'validation_error'
  | 'not_found'
  | 'unauthorized'
  | 'forbidden'
  | 'rate_limited'
  | 'server_error'
  | 'unknown_error'
  // Face recognition errors
  | 'init_failed'
  | 'not_initialized'
  | 'no_face'
  | 'detection_failed'
  | 'camera_failed'
  | 'id_face_not_found'
  | 'face_mismatch'
  // Proof verification errors
  | 'invalid_pin'
  | 'invalid_proof_id'
  | 'verification_failed'
  // Sign errors
  | 'invalid_id'
  | 'invalid_hash'
  // File errors
  | 'file_deleted'
  | 'upload_failed'
  | 'download_failed'
  // Environment errors
  | 'browser_required'
  | 'server_required';

/** OTRUST Error class */
export class OTrustError extends Error {
  readonly code: OTrustErrorCode;
  readonly statusCode?: number;
  readonly details?: Record<string, unknown>;

  constructor(
    code: OTrustErrorCode,
    message: string,
    options?: { statusCode?: number; details?: Record<string, unknown> }
  ) {
    super(message);
    this.name = 'OTrustError';
    this.code = code;
    this.statusCode = options?.statusCode;
    this.details = options?.details;
  }

  /** Create from HTTP response */
  static fromResponse(status: number, body?: Record<string, unknown>): OTrustError {
    const message = (body?.message as string) || (body?.error as string) || 'Unknown error';
    
    let code: OTrustErrorCode;
    switch (status) {
      case 400:
        code = 'validation_error';
        break;
      case 401:
        code = 'unauthorized';
        break;
      case 403:
        code = 'forbidden';
        break;
      case 404:
        code = 'not_found';
        break;
      case 429:
        code = 'rate_limited';
        break;
      case 500:
      case 502:
      case 503:
      case 504:
        code = 'server_error';
        break;
      default:
        code = 'unknown_error';
    }

    return new OTrustError(code, message, { statusCode: status, details: body });
  }
}
