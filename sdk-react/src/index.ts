/**
 * @otrust/react - React Components for OTRUST
 * 
 * Components:
 * - <LoginWithOTrust /> - "Login with OTRUST" button
 * - <ProofBadge /> - Display verified proof status
 * - <TimestampWidget /> - Timestamp file upload widget
 * - <SignatureStatus /> - Display signature request status
 * - <OTrustErrorBoundary /> - Error boundary for graceful error handling
 * - <OTrustProvider /> - Context provider for configuration
 */

// Context
export { OTrustProvider, useOTrust, type OTrustConfig } from './context.js';

// Components
export { LoginWithOTrust, type LoginWithOTrustProps, type LoginWithOTrustLabels } from './LoginWithOTrust.js';
export { ProofBadge, type ProofBadgeProps } from './ProofBadge.js';
export { TimestampWidget, type TimestampWidgetProps } from './TimestampWidget.js';
export { SignatureStatus, type SignatureStatusProps } from './SignatureStatus.js';
export { OTrustErrorBoundary, type ErrorBoundaryProps } from './ErrorBoundary.js';

// Icons (safe SVG components)
export {
  OTrustIcon,
  UploadIcon,
  CheckIcon,
  ErrorIcon,
  ShieldIcon,
  ClockIcon,
  WarningIcon,
  DocumentIcon,
  SignatureIcon,
} from './icons.js';

// Hooks
export { useAuth, type UseAuthReturn } from './hooks/useAuth.js';
export { useProof, type UseProofReturn } from './hooks/useProof.js';
export { useTimestamp, type UseTimestampReturn } from './hooks/useTimestamp.js';

// Re-export useful types from SDK
export type { Result, TimestampClaim } from '@otrust/sdk';

/** Result returned from timestamp operations */
export interface TimestampResult {
  hash?: string;
  claimId?: string;
  timestamp?: string;
}
