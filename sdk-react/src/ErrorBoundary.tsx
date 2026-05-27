/**
 * Error Boundary Component for OTRUST React SDK
 *
 * Catches JavaScript errors anywhere in the child component tree
 * and displays a fallback UI instead of crashing.
 */

import { Component, type ReactNode, type ErrorInfo } from 'react';

export interface ErrorBoundaryProps {
  /** Child components to wrap */
  children: ReactNode;
  /** Custom fallback UI to display on error */
  fallback?: ReactNode;
  /** Callback when an error is caught */
  onError?: (error: Error, errorInfo: ErrorInfo) => void;
}

interface ErrorBoundaryState {
  hasError: boolean;
  error: Error | null;
}

/**
 * Error boundary component that catches errors in child components.
 *
 * @example
 * ```tsx
 * <OTrustErrorBoundary
 *   fallback={<div>Something went wrong</div>}
 *   onError={(error) => logError(error)}
 * >
 *   <TimestampWidget />
 * </OTrustErrorBoundary>
 * ```
 */
export class OTrustErrorBoundary extends Component<ErrorBoundaryProps, ErrorBoundaryState> {
  constructor(props: ErrorBoundaryProps) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error: Error): ErrorBoundaryState {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, errorInfo: ErrorInfo): void {
    this.props.onError?.(error, errorInfo);
  }

  render(): ReactNode {
    if (this.state.hasError) {
      if (this.props.fallback) {
        return this.props.fallback;
      }

      return (
        <div
          style={{
            padding: '16px',
            backgroundColor: '#fef2f2',
            border: '1px solid #fecaca',
            borderRadius: '8px',
            color: '#dc2626',
            fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
          }}
          role="alert"
        >
          <strong>OTRUST Error:</strong> {this.state.error?.message || 'Something went wrong'}
        </div>
      );
    }

    return this.props.children;
  }
}
