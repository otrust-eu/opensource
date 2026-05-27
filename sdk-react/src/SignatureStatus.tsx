/**
 * Signature Status Component
 *
 * Display the status of a signing request with party progress.
 */

import { useEffect, useState, type CSSProperties, type ReactNode } from 'react';
import { sign } from '@otrust/sdk';
import { ClockIcon, CheckIcon, ErrorIcon, WarningIcon } from './icons.js';

export interface SignatureStatusProps {
  /** Sign request ID */
  requestId: string;
  /** Poll for updates */
  pollInterval?: number;
  /** Callback when status changes */
  onStatusChange?: (status: SignRequestStatus) => void;
  /** Show party list */
  showParties?: boolean;
  /** Compact view */
  compact?: boolean;
  /** Custom className */
  className?: string;
  /** Custom styles */
  style?: CSSProperties;
}

interface SignRequestStatus {
  status: 'pending' | 'completed' | 'expired' | 'cancelled' | 'declined';
  title: string;
  createdAt: string;
  deadline?: string;
  parties: Array<{
    email: string;
    name?: string;
    role: string;
    action: 'signed' | 'approved' | 'viewed' | 'declined' | null;
    actedAt?: string;
  }>;
}

/** Get icon component for status */
function StatusIcon({ status, size = 16 }: { status: string; size?: number }): ReactNode {
  switch (status) {
    case 'completed':
      return <CheckIcon size={size} />;
    case 'cancelled':
    case 'declined':
      return <ErrorIcon size={size} />;
    case 'expired':
    case 'pending':
    default:
      return <ClockIcon size={size} />;
  }
}

const STATUS_COLORS: Record<string, { bg: string; text: string; border: string }> = {
  pending: { bg: '#fef3c7', text: '#92400e', border: '#fcd34d' },
  completed: { bg: '#dcfce7', text: '#166534', border: '#86efac' },
  cancelled: { bg: '#fee2e2', text: '#991b1b', border: '#fca5a5' },
  expired: { bg: '#f3f4f6', text: '#4b5563', border: '#d1d5db' },
  declined: { bg: '#fee2e2', text: '#991b1b', border: '#fca5a5' },
};

/**
 * Display signing request status.
 *
 * @example
 * ```tsx
 * <SignatureStatus
 *   requestId="sr_xyz789"
 *   showParties
 *   pollInterval={30000}
 *   onStatusChange={(status) => console.log('Status:', status)}
 * />
 * ```
 */
export function SignatureStatus({
  requestId,
  pollInterval,
  onStatusChange,
  showParties = true,
  compact = false,
  className = '',
  style,
}: SignatureStatusProps) {
  const [data, setData] = useState<SignRequestStatus | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let mounted = true;
    let intervalId: ReturnType<typeof setInterval> | undefined;

    async function fetchStatus() {
      const result = await sign.status(requestId);

      if (!mounted) return;

      if (result.ok) {
        const newData: SignRequestStatus = {
          status: result.value.status as SignRequestStatus['status'],
          title: result.value.title,
          createdAt: result.value.createdAt,
          deadline: result.value.deadline,
          parties: result.value.parties.map(p => ({
            email: p.email,
            name: p.name,
            role: p.role,
            action: p.action,
            actedAt: p.actedAt,
          })),
        };

        setData(newData);
        setLoading(false);
        setError(null);
        onStatusChange?.(newData);

        // Stop polling if completed/cancelled/expired/declined
        if (['completed', 'cancelled', 'expired', 'declined'].includes(newData.status) && intervalId) {
          clearInterval(intervalId);
        }
      } else {
        setError(result.error.message);
        setLoading(false);
      }
    }

    fetchStatus();

    if (pollInterval && pollInterval > 0) {
      intervalId = setInterval(fetchStatus, pollInterval);
    }

    return () => {
      mounted = false;
      if (intervalId) clearInterval(intervalId);
    };
  }, [requestId, pollInterval, onStatusChange]);

  if (loading) {
    return (
      <div className={className} style={{ padding: '16px', textAlign: 'center', color: '#6b7280', ...style }}>
        Loading...
      </div>
    );
  }

  if (error || !data) {
    return (
      <div className={className} style={{ padding: '16px', color: '#dc2626', ...style }}>
        {error ?? 'Failed to load status'}
      </div>
    );
  }

  const colors = STATUS_COLORS[data.status] ?? STATUS_COLORS.pending;
  const signedCount = data.parties.filter(p => p.action === 'signed' || p.action === 'approved').length;
  const totalCount = data.parties.length;

  const containerStyles: CSSProperties = {
    fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
    backgroundColor: 'white',
    border: '1px solid #e5e7eb',
    borderRadius: '12px',
    overflow: 'hidden',
    ...style,
  };

  if (compact) {
    return (
      <div className={`otrust-signature-status ${className}`} style={containerStyles}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px', padding: '12px 16px' }}>
          <span
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: '6px',
              padding: '4px 10px',
              borderRadius: '9999px',
              backgroundColor: colors.bg,
              color: colors.text,
              fontSize: '12px',
              fontWeight: 500,
            }}
          >
            <span style={{ width: 14, height: 14, display: 'flex' }}>
              <StatusIcon status={data.status} size={14} />
            </span>
            {data.status.replace('_', ' ')}
          </span>
          <span style={{ fontSize: '14px', color: '#374151' }}>{data.title}</span>
          <span style={{ marginLeft: 'auto', fontSize: '12px', color: '#6b7280' }}>
            {signedCount}/{totalCount} signed
          </span>
        </div>
      </div>
    );
  }

  return (
    <div className={`otrust-signature-status ${className}`} style={containerStyles}>
      {/* Header */}
      <div style={{ padding: '16px', borderBottom: '1px solid #e5e7eb' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '8px' }}>
          <span
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: '6px',
              padding: '6px 12px',
              borderRadius: '9999px',
              backgroundColor: colors.bg,
              color: colors.text,
              fontSize: '14px',
              fontWeight: 500,
            }}
          >
            <span style={{ width: 16, height: 16, display: 'flex' }}>
              <StatusIcon status={data.status} size={16} />
            </span>
            {data.status.replace('_', ' ')}
          </span>
        </div>
        <h3 style={{ margin: 0, fontSize: '18px', fontWeight: 600, color: '#111827' }}>
          {data.title}
        </h3>
        <p style={{ margin: '4px 0 0', fontSize: '14px', color: '#6b7280' }}>
          Created {new Date(data.createdAt).toLocaleDateString()}
          {data.deadline && ` · Due ${new Date(data.deadline).toLocaleDateString()}`}
        </p>
      </div>

      {/* Progress bar */}
      <div style={{ padding: '12px 16px', backgroundColor: '#f9fafb' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '6px' }}>
          <span style={{ fontSize: '12px', color: '#6b7280' }}>Progress</span>
          <span style={{ fontSize: '12px', fontWeight: 500, color: '#374151' }}>
            {signedCount} of {totalCount} signed
          </span>
        </div>
        <div style={{ height: '6px', backgroundColor: '#e5e7eb', borderRadius: '3px', overflow: 'hidden' }}>
          <div
            style={{
              width: `${(signedCount / totalCount) * 100}%`,
              height: '100%',
              backgroundColor: '#16a34a',
              transition: 'width 0.3s ease',
            }}
          />
        </div>
      </div>

      {/* Parties list */}
      {showParties && (
        <div style={{ padding: '16px' }}>
          {data.parties.map((party, idx) => (
            <div
              key={party.email}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '12px',
                padding: '8px 0',
                borderTop: idx > 0 ? '1px solid #f3f4f6' : undefined,
              }}
            >
              <div
                style={{
                  width: 32,
                  height: 32,
                  borderRadius: '50%',
                  backgroundColor: party.action === 'signed' || party.action === 'approved' ? '#dcfce7' : '#f3f4f6',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  fontSize: '14px',
                  fontWeight: 500,
                  color: party.action === 'signed' || party.action === 'approved' ? '#16a34a' : '#6b7280',
                }}
              >
                {(party.name ?? party.email).charAt(0).toUpperCase()}
              </div>
              <div style={{ flex: 1 }}>
                <p style={{ margin: 0, fontSize: '14px', fontWeight: 500, color: '#111827' }}>
                  {party.name ?? party.email}
                </p>
                <p style={{ margin: 0, fontSize: '12px', color: '#6b7280' }}>
                  {party.role} · {party.action ?? 'pending'}
                  {party.actedAt && ` on ${new Date(party.actedAt).toLocaleDateString()}`}
                </p>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
