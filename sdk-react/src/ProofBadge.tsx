/**
 * Proof Badge Component
 *
 * Displays a verified proof badge with optional details.
 */

import { useEffect, useState, type CSSProperties } from 'react';
import { proof, type Result } from '@otrust/sdk';
import { CheckIcon, ShieldIcon } from './icons.js';

export interface ProofBadgeProps {
  /** Proof ID to display */
  proofId: string;
  /** Proof type for display */
  type?: 'identity' | 'age' | 'membership' | 'custom';
  /** Custom label */
  label?: string;
  /** Show verification status */
  showStatus?: boolean;
  /** Auto-verify on mount */
  autoVerify?: boolean;
  /** Size variant */
  size?: 'small' | 'medium' | 'large';
  /** Custom className */
  className?: string;
  /** Custom styles */
  style?: CSSProperties;
  /** Callback when clicked */
  onClick?: () => void;
}

interface ProofData {
  verified: boolean;
  proofType?: string;
  verification?: {
    faceMatch?: boolean;
    livenessVerified?: boolean;
    documentVerified?: boolean;
    timestamp?: string;
  };
}

/**
 * Display a verified proof badge.
 *
 * @example
 * ```tsx
 * <ProofBadge
 *   proofId="id_abc123"
 *   type="identity"
 *   showStatus
 *   autoVerify
 * />
 * ```
 */
export function ProofBadge({
  proofId,
  type = 'identity',
  label,
  showStatus = true,
  autoVerify = false,
  size = 'medium',
  className = '',
  style,
  onClick,
}: ProofBadgeProps) {
  const [status, setStatus] = useState<'loading' | 'verified' | 'invalid' | 'error'>('loading');
  const [proofData, setProofData] = useState<ProofData | null>(null);

  useEffect(() => {
    if (!autoVerify) {
      setStatus('verified'); // Assume verified if not checking
      return;
    }

    async function verifyProof() {
      setStatus('loading');

      const result = await proof.verify(proofId);

      if (result.ok) {
        if (result.value.valid) {
          setStatus('verified');
          setProofData({
            verified: true,
            proofType: result.value.proofType,
            verification: result.value.verification,
          });
        } else {
          setStatus('invalid');
        }
      } else {
        setStatus('error');
      }
    }

    verifyProof();
  }, [proofId, autoVerify]);

  // Type labels
  const typeLabels: Record<string, string> = {
    identity: 'Verified Identity',
    age: 'Age Verified',
    membership: 'Member',
    custom: 'Verified',
  };

  const displayLabel = label ?? typeLabels[type] ?? 'Verified';

  // Size styles
  const sizeStyles: Record<string, CSSProperties> = {
    small: { padding: '4px 8px', fontSize: '12px', gap: '4px' },
    medium: { padding: '6px 12px', fontSize: '14px', gap: '6px' },
    large: { padding: '8px 16px', fontSize: '16px', gap: '8px' },
  };

  // Status colors
  const statusColors: Record<string, { bg: string; text: string; border: string }> = {
    loading: { bg: '#f3f4f6', text: '#6b7280', border: '#d1d5db' },
    verified: { bg: '#dcfce7', text: '#166534', border: '#86efac' },
    invalid: { bg: '#fee2e2', text: '#991b1b', border: '#fca5a5' },
    error: { bg: '#fef3c7', text: '#92400e', border: '#fcd34d' },
  };

  const colors = statusColors[status];
  const iconSize = size === 'small' ? 14 : size === 'large' ? 20 : 16;

  const badgeStyles: CSSProperties = {
    display: 'inline-flex',
    alignItems: 'center',
    fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
    fontWeight: 500,
    borderRadius: '9999px',
    backgroundColor: colors.bg,
    color: colors.text,
    border: `1px solid ${colors.border}`,
    cursor: onClick ? 'pointer' : 'default',
    transition: 'all 0.2s ease',
    ...sizeStyles[size],
    ...style,
  };

  return (
    <span
      className={`otrust-proof-badge otrust-proof-badge--${status} ${className}`}
      style={badgeStyles}
      onClick={onClick}
      role={onClick ? 'button' : undefined}
      tabIndex={onClick ? 0 : undefined}
      title={proofData?.verification?.timestamp ? `Verified ${new Date(proofData.verification.timestamp).toLocaleDateString()}` : undefined}
    >
      {status === 'verified' ? (
        <CheckIcon size={iconSize} aria-hidden />
      ) : (
        <ShieldIcon size={iconSize} aria-hidden />
      )}
      <span>{status === 'loading' ? 'Verifying...' : displayLabel}</span>
      {showStatus && status !== 'verified' && status !== 'loading' && (
        <span style={{ opacity: 0.7, marginLeft: '4px' }}>
          ({status})
        </span>
      )}
    </span>
  );
}
