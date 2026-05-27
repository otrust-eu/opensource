/**
 * useAuth Hook
 *
 * Handle OTRUST authentication flow in React.
 */

import { useState, useEffect, useCallback } from 'react';
import { auth } from '@otrust/sdk';
import { useOTrust } from '../context.js';

export interface UseAuthReturn {
  /** Current authentication state */
  isAuthenticated: boolean;
  /** User info if authenticated */
  user: UserInfo | null;
  /** Loading state */
  isLoading: boolean;
  /** Error state */
  error: Error | null;
  /** Auth token */
  token: string | null;
  /** Start login flow */
  login: (options?: LoginOptions) => Promise<void>;
  /** Log out */
  logout: () => void;
  /** Handle callback from auth redirect */
  handleCallback: () => Promise<boolean>;
  /** Verify current token */
  verifyToken: () => Promise<boolean>;
}

interface UserInfo {
  proofId: string;
  verified: boolean;
  identityHash?: string;
  verification?: {
    faceMatch?: boolean;
    livenessVerified?: boolean;
    documentVerified?: boolean;
  };
  createdAt: string;
  expiresAt?: string;
}

interface LoginOptions {
  scope?: string[];
  state?: string;
}

const TOKEN_KEY = 'otrust_auth_token';
const STATE_KEY = 'otrust_auth_state';

/**
 * Hook for managing OTRUST authentication.
 *
 * @example
 * ```tsx
 * function App() {
 *   const { isAuthenticated, user, login, logout } = useAuth();
 *
 *   if (!isAuthenticated) {
 *     return <button onClick={() => login()}>Login</button>;
 *   }
 *
 *   return (
 *     <div>
 *       <p>Logged in as {user?.proofId}</p>
 *       <button onClick={logout}>Logout</button>
 *     </div>
 *   );
 * }
 * ```
 */
export function useAuth(): UseAuthReturn {
  const config = useOTrust();
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [user, setUser] = useState<UserInfo | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);
  const [token, setToken] = useState<string | null>(null);

  // Check for existing token on mount
  useEffect(() => {
    const storedToken = sessionStorage.getItem(TOKEN_KEY);
    if (storedToken) {
      setToken(storedToken);
      verifyAndFetchUser(storedToken);
    } else {
      setIsLoading(false);
    }
  }, []);

  const verifyAndFetchUser = async (authToken: string) => {
    setIsLoading(true);
    setError(null);

    try {
      // Verify token
      const verifyResult = await auth.verify(authToken);

      if (!verifyResult.ok || !verifyResult.value.valid) {
        throw new Error('Invalid token');
      }

      // Get user info
      const userResult = await auth.userinfo(authToken);

      if (userResult.ok) {
        setUser({
          proofId: userResult.value.proofId,
          verified: userResult.value.verified,
          identityHash: userResult.value.identityHash,
          verification: userResult.value.verification,
          createdAt: userResult.value.createdAt,
          expiresAt: userResult.value.expiresAt,
        });
        setIsAuthenticated(true);
      } else {
        throw new Error(userResult.error.message);
      }
    } catch (err) {
      setError(err instanceof Error ? err : new Error(String(err)));
      setIsAuthenticated(false);
      setUser(null);
      sessionStorage.removeItem(TOKEN_KEY);
    } finally {
      setIsLoading(false);
    }
  };

  const login = useCallback(async (options?: LoginOptions) => {
    if (!config.clientId || !config.redirectUri) {
      setError(new Error('clientId and redirectUri are required'));
      return;
    }

    setIsLoading(true);
    setError(null);

    try {
      const authState = options?.state ?? auth.generateState();

      const result = await auth.loginUrl({
        clientId: config.clientId,
        redirectUri: config.redirectUri,
        scope: (options?.scope ?? ['identity']) as ('identity' | 'email' | 'verification')[],
        state: authState,
      });

      if (result.ok) {
        // Store state for CSRF protection
        sessionStorage.setItem(STATE_KEY, authState);
        // Redirect to login
        window.location.href = result.value;
      } else {
        throw new Error(result.error.message);
      }
    } catch (err) {
      setIsLoading(false);
      setError(err instanceof Error ? err : new Error(String(err)));
    }
  }, [config.clientId, config.redirectUri]);

  const logout = useCallback(() => {
    sessionStorage.removeItem(TOKEN_KEY);
    sessionStorage.removeItem(STATE_KEY);
    setToken(null);
    setUser(null);
    setIsAuthenticated(false);
    setError(null);
  }, []);

  const handleCallback = useCallback(async (): Promise<boolean> => {
    setIsLoading(true);
    setError(null);

    try {
      const parsed = auth.parseCallback(window.location.href);

      if (!parsed.token) {
        throw new Error('No token in callback');
      }

      // Verify state for CSRF protection
      const storedState = sessionStorage.getItem(STATE_KEY);
      if (storedState && parsed.state !== storedState) {
        throw new Error('State mismatch - possible CSRF attack');
      }

      // Store token
      sessionStorage.setItem(TOKEN_KEY, parsed.token);
      sessionStorage.removeItem(STATE_KEY);
      setToken(parsed.token);

      // Verify and fetch user
      await verifyAndFetchUser(parsed.token);

      return true;
    } catch (err) {
      setError(err instanceof Error ? err : new Error(String(err)));
      setIsLoading(false);
      return false;
    }
  }, []);

  const verifyToken = useCallback(async (): Promise<boolean> => {
    if (!token) return false;

    const result = await auth.verify(token);

    if (result.ok && result.value.valid) {
      return true;
    }

    // Token invalid, logout
    logout();
    return false;
  }, [token, logout]);

  return {
    isAuthenticated,
    user,
    isLoading,
    error,
    token,
    login,
    logout,
    handleCallback,
    verifyToken,
  };
}
