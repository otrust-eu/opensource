/**
 * OTRUST SDK - Admin Service
 * 
 * Server-side only administrative functions.
 * These functions require server-side API keys and should NEVER
 * be called from browser code.
 * 
 * @example
 * ```ts
 * // Server-side only (Node.js, Deno, Bun)
 * import { admin, configure } from '@otrust/sdk';
 * 
 * configure({
 *   baseUrl: 'https://otrust.eu',
 *   headers: {
 *     'Authorization': `Bearer ${process.env.OTRUST_ADMIN_KEY}`,
 *   },
 * });
 * 
 * // Get system stats
 * const stats = await admin.getStats();
 * 
 * // Manage abuse reports
 * const reports = await admin.getAbuseReports({ status: 'pending' });
 * ```
 */

import { getClient, requireServer } from './client.js';
import { Result, ok, err, OTrustError } from './result.js';

// ============================================
// Types
// ============================================

/** System statistics */
export interface SystemStats {
  /** Total number of timestamp claims */
  totalClaims: number;
  /** Claims in the last 24 hours */
  claimsLast24h: number;
  /** Total proofs created */
  totalProofs: number;
  /** Proofs in the last 24 hours */
  proofsLast24h: number;
  /** Total sign requests */
  totalSignRequests: number;
  /** Active sign requests */
  activeSignRequests: number;
  /** Blockchain confirmations pending */
  pendingConfirmations: number;
  /** System health status */
  health: 'healthy' | 'degraded' | 'down';
}

/** Abuse report status */
export type AbuseReportStatus = 'pending' | 'investigating' | 'resolved' | 'dismissed';

/** Abuse report */
export interface AbuseReport {
  id: string;
  type: 'spam' | 'fraud' | 'illegal_content' | 'harassment' | 'other';
  targetType: 'proof' | 'sign_request' | 'timestamp';
  targetId: string;
  reporterEmail?: string;
  description: string;
  status: AbuseReportStatus;
  createdAt: string;
  resolvedAt?: string;
  resolution?: string;
}

/** Options for listing abuse reports */
export interface ListAbuseReportsOptions {
  status?: AbuseReportStatus;
  type?: AbuseReport['type'];
  limit?: number;
  offset?: number;
}

/** Rate limit info */
export interface RateLimitInfo {
  ip: string;
  endpoint: string;
  count: number;
  windowStart: string;
  windowEnd: string;
  blocked: boolean;
}

// ============================================
// Admin API Functions
// ============================================

/**
 * Guard function to ensure we're not in a browser.
 * Throws if called from browser environment.
 */
function ensureServer(): void {
  requireServer('Admin functions');
}

/**
 * Get system statistics.
 * Requires admin API key.
 * 
 * @example
 * ```ts
 * const result = await admin.getStats();
 * if (result.ok) {
 *   console.log('Total claims:', result.value.totalClaims);
 *   console.log('System health:', result.value.health);
 * }
 * ```
 */
export async function getStats(): Promise<Result<SystemStats>> {
  ensureServer();
  
  const client = getClient();
  const result = await client.get<{
    total_claims: number;
    claims_last_24h: number;
    total_proofs: number;
    proofs_last_24h: number;
    total_sign_requests: number;
    active_sign_requests: number;
    pending_confirmations: number;
    health: 'healthy' | 'degraded' | 'down';
  }>('/admin/stats');

  if (!result.ok) {
    return result;
  }

  return ok({
    totalClaims: result.value.total_claims,
    claimsLast24h: result.value.claims_last_24h,
    totalProofs: result.value.total_proofs,
    proofsLast24h: result.value.proofs_last_24h,
    totalSignRequests: result.value.total_sign_requests,
    activeSignRequests: result.value.active_sign_requests,
    pendingConfirmations: result.value.pending_confirmations,
    health: result.value.health,
  });
}

/**
 * Get abuse reports.
 * Requires admin API key.
 * 
 * @example
 * ```ts
 * const result = await admin.getAbuseReports({ status: 'pending' });
 * if (result.ok) {
 *   for (const report of result.value) {
 *     console.log(report.id, report.type, report.description);
 *   }
 * }
 * ```
 */
export async function getAbuseReports(
  options: ListAbuseReportsOptions = {}
): Promise<Result<AbuseReport[]>> {
  ensureServer();
  
  const client = getClient();
  const params = new URLSearchParams();
  if (options.status) params.set('status', options.status);
  if (options.type) params.set('type', options.type);
  if (options.limit) params.set('limit', String(options.limit));
  if (options.offset) params.set('offset', String(options.offset));
  
  const queryString = params.toString();
  const url = queryString ? `/admin/abuse-reports?${queryString}` : '/admin/abuse-reports';
  
  const result = await client.get<{
    reports: Array<{
      id: string;
      type: AbuseReport['type'];
      target_type: AbuseReport['targetType'];
      target_id: string;
      reporter_email?: string;
      description: string;
      status: AbuseReportStatus;
      created_at: string;
      resolved_at?: string;
      resolution?: string;
    }>;
  }>(url);

  if (!result.ok) {
    return result;
  }

  return ok(result.value.reports.map(r => ({
    id: r.id,
    type: r.type,
    targetType: r.target_type,
    targetId: r.target_id,
    reporterEmail: r.reporter_email,
    description: r.description,
    status: r.status,
    createdAt: r.created_at,
    resolvedAt: r.resolved_at,
    resolution: r.resolution,
  })));
}

/**
 * Resolve an abuse report.
 * Requires admin API key.
 * 
 * @example
 * ```ts
 * const result = await admin.resolveAbuseReport('abuse_xyz', {
 *   status: 'resolved',
 *   resolution: 'Content removed, user warned',
 *   action: 'remove_content',
 * });
 * ```
 */
export async function resolveAbuseReport(
  reportId: string,
  options: {
    status: 'resolved' | 'dismissed';
    resolution: string;
    action?: 'remove_content' | 'block_user' | 'warn_user' | 'no_action';
  }
): Promise<Result<{ success: boolean }>> {
  ensureServer();
  
  const client = getClient();
  const result = await client.post<{ success: boolean }>(`/admin/abuse-reports/${reportId}/resolve`, {
    status: options.status,
    resolution: options.resolution,
    action: options.action,
  });

  return result;
}

/**
 * Get rate limit info for an IP address.
 * Requires admin API key.
 * 
 * @example
 * ```ts
 * const result = await admin.getRateLimitInfo('192.168.1.1');
 * if (result.ok) {
 *   console.log('Blocked:', result.value.blocked);
 * }
 * ```
 */
export async function getRateLimitInfo(ip: string): Promise<Result<RateLimitInfo[]>> {
  ensureServer();
  
  const client = getClient();
  const result = await client.get<{
    limits: Array<{
      ip: string;
      endpoint: string;
      count: number;
      window_start: string;
      window_end: string;
      blocked: boolean;
    }>;
  }>(`/admin/rate-limits/${encodeURIComponent(ip)}`);

  if (!result.ok) {
    return result;
  }

  return ok(result.value.limits.map(l => ({
    ip: l.ip,
    endpoint: l.endpoint,
    count: l.count,
    windowStart: l.window_start,
    windowEnd: l.window_end,
    blocked: l.blocked,
  })));
}

/**
 * Clear rate limits for an IP address.
 * Requires admin API key.
 * 
 * @example
 * ```ts
 * await admin.clearRateLimits('192.168.1.1');
 * ```
 */
export async function clearRateLimits(ip: string): Promise<Result<{ success: boolean }>> {
  ensureServer();
  
  const client = getClient();
  return client.delete<{ success: boolean }>(`/admin/rate-limits/${encodeURIComponent(ip)}`);
}

/**
 * Revoke a proof (admin override).
 * Requires admin API key.
 * 
 * @example
 * ```ts
 * await admin.revokeProof('id_abc123', 'Fraudulent identity');
 * ```
 */
export async function revokeProof(
  proofId: string,
  reason: string
): Promise<Result<{ success: boolean }>> {
  ensureServer();
  
  const client = getClient();
  return client.post<{ success: boolean }>(`/admin/proofs/${proofId}/revoke`, { reason });
}

/**
 * Cancel a sign request (admin override).
 * Requires admin API key.
 * 
 * @example
 * ```ts
 * await admin.cancelSignRequest('sr_xyz789', 'Reported as fraudulent');
 * ```
 */
export async function cancelSignRequest(
  requestId: string,
  reason: string
): Promise<Result<{ success: boolean }>> {
  ensureServer();
  
  const client = getClient();
  return client.post<{ success: boolean }>(`/admin/sign/${requestId}/cancel`, { reason });
}

/**
 * Delete a timestamp claim (admin override - use with caution).
 * Requires admin API key.
 * 
 * @example
 * ```ts
 * await admin.deleteTimestamp('receipt_abc123', 'Illegal content');
 * ```
 */
export async function deleteTimestamp(
  receiptId: string,
  reason: string
): Promise<Result<{ success: boolean }>> {
  ensureServer();
  
  const client = getClient();
  return client.delete<{ success: boolean }>(`/admin/timestamps/${receiptId}?reason=${encodeURIComponent(reason)}`);
}

// ============================================
// Service Object
// ============================================

/** Admin service with all methods (server-side only) */
export const admin = {
  /** Get system statistics */
  getStats,
  /** Get abuse reports */
  getAbuseReports,
  /** Resolve an abuse report */
  resolveAbuseReport,
  /** Get rate limit info for an IP */
  getRateLimitInfo,
  /** Clear rate limits for an IP */
  clearRateLimits,
  /** Revoke a proof (admin override) */
  revokeProof,
  /** Cancel a sign request (admin override) */
  cancelSignRequest,
  /** Delete a timestamp (admin override) */
  deleteTimestamp,
};

export default admin;
