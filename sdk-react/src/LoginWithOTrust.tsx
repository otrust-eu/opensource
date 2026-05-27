/**
 * Login with OTRUST Button Component
 *
 * A styled button that initiates the OTRUST authentication flow.
 */

import { useCallback, useState, type CSSProperties, type ReactNode } from 'react';
import { auth } from '@otrust/sdk';
import { useOTrust } from './context.js';
import { OTrustIcon } from './icons.js';

/** Internationalization labels for LoginWithOTrust */
export interface LoginWithOTrustLabels {
  /** Button text (default: "Login with OTRUST") */
  login?: string;
  /** Loading text (default: "Connecting...") */
  loading?: string;
}

export interface LoginWithOTrustProps {
  /** Client ID (uses context if not provided) */
  clientId?: string;
  /** Redirect URI after auth (uses context if not provided) */
  redirectUri?: string;
  /** Requested scopes */
  scope?: string[];
  /** Custom state parameter */
  state?: string;
  /** Button variant */
  variant?: 'primary' | 'secondary' | 'minimal';
  /** Button size */
  size?: 'small' | 'medium' | 'large';
  /** Custom button text */
  children?: ReactNode;
  /** Internationalization labels */
  labels?: LoginWithOTrustLabels;
  /** Callback when auth starts */
  onAuthStart?: () => void;
  /** Callback on error */
  onError?: (error: Error) => void;
  /** Disabled state */
  disabled?: boolean;
  /** Custom className */
  className?: string;
  /** Custom styles */
  style?: CSSProperties;
}

/**
 * "Login with OTRUST" button component.
 *
 * @example
 * ```tsx
 * <LoginWithOTrust
 *   clientId="my-app"
 *   redirectUri="https://my-app.com/callback"
 *   onError={(err) => console.error(err)}
 * />
 * ```
 */
/** Default English labels */
const DEFAULT_LABELS: Required<LoginWithOTrustLabels> = {
  login: 'Login with OTRUST',
  loading: 'Connecting...',
};

export function LoginWithOTrust({
  clientId: propClientId,
  redirectUri: propRedirectUri,
  scope = ['identity'],
  state,
  variant = 'primary',
  size = 'medium',
  children,
  labels,
  onAuthStart,
  onError,
  disabled = false,
  className = '',
  style,
}: LoginWithOTrustProps) {
  const config = useOTrust();
  const [loading, setLoading] = useState(false);
  const l = { ...DEFAULT_LABELS, ...labels };

  const clientId = propClientId ?? config.clientId;
  const redirectUri = propRedirectUri ?? config.redirectUri;

  const handleClick = useCallback(() => {
    if (!clientId || !redirectUri) {
      onError?.(new Error('clientId and redirectUri are required'));
      return;
    }

    setLoading(true);
    onAuthStart?.();

    try {
      const authState = state ?? auth.generateState();

      // loginUrl is now synchronous
      const result = auth.loginUrl({
        clientId,
        redirectUri,
        scope: scope as ('identity' | 'email' | 'verification')[],
        state: authState,
      });

      if (result.ok) {
        // Store state in sessionStorage for CSRF protection
        sessionStorage.setItem('otrust_auth_state', authState);
        // Redirect to login
        window.location.href = result.value;
      } else {
        throw new Error(result.error.message);
      }
    } catch (error) {
      setLoading(false);
      onError?.(error instanceof Error ? error : new Error(String(error)));
    }
  }, [clientId, redirectUri, scope, state, onAuthStart, onError]);

  // Styles
  const baseStyles: CSSProperties = {
    display: 'inline-flex',
    alignItems: 'center',
    justifyContent: 'center',
    gap: '8px',
    fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
    fontWeight: 600,
    border: 'none',
    borderRadius: '8px',
    cursor: disabled || loading ? 'not-allowed' : 'pointer',
    opacity: disabled || loading ? 0.6 : 1,
    transition: 'all 0.2s ease',
    textDecoration: 'none',
    ...style,
  };

  const sizeStyles: Record<string, CSSProperties> = {
    small: { padding: '8px 16px', fontSize: '14px' },
    medium: { padding: '12px 24px', fontSize: '16px' },
    large: { padding: '16px 32px', fontSize: '18px' },
  };

  const variantStyles: Record<string, CSSProperties> = {
    primary: {
      backgroundColor: '#2d5a3d',
      color: 'white',
    },
    secondary: {
      backgroundColor: 'white',
      color: '#2d5a3d',
      border: '2px solid #2d5a3d',
    },
    minimal: {
      backgroundColor: 'transparent',
      color: '#2d5a3d',
    },
  };

  const buttonStyles: CSSProperties = {
    ...baseStyles,
    ...sizeStyles[size],
    ...variantStyles[variant],
  };

  const iconSize = size === 'small' ? 16 : size === 'large' ? 24 : 20;

  return (
    <button
      type="button"
      onClick={handleClick}
      disabled={disabled || loading}
      className={`otrust-login-button ${className}`}
      style={buttonStyles}
      aria-busy={loading}
    >
      <OTrustIcon size={iconSize} aria-hidden />
      {loading ? l.loading : (children ?? l.login)}
    </button>
  );
}
