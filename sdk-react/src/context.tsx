/**
 * OTRUST React Context Provider
 * 
 * Provides SDK configuration to all child components.
 */

import { createContext, useContext, useEffect, type ReactNode } from 'react';
import { configure } from '@otrust/sdk';

export interface OTrustConfig {
  /** API base URL (default: https://otrust.eu) */
  baseUrl?: string;
  /** Client ID for auth */
  clientId?: string;
  /** Default redirect URI for auth */
  redirectUri?: string;
  /** Request timeout in ms */
  timeout?: number;
  /** Number of retry attempts */
  retries?: number;
}

interface OTrustContextValue extends OTrustConfig {
  isConfigured: boolean;
}

const OTrustContext = createContext<OTrustContextValue | null>(null);

export interface OTrustProviderProps {
  children: ReactNode;
  config?: OTrustConfig;
}

/**
 * Provides OTRUST SDK configuration to all child components.
 * 
 * @example
 * ```tsx
 * <OTrustProvider config={{ 
 *   clientId: 'my-app',
 *   redirectUri: 'https://my-app.com/callback'
 * }}>
 *   <App />
 * </OTrustProvider>
 * ```
 */
export function OTrustProvider({ children, config = {} }: OTrustProviderProps) {
  useEffect(() => {
    configure({
      baseUrl: config.baseUrl,
      timeout: config.timeout,
      retries: config.retries,
    });
  }, [config.baseUrl, config.timeout, config.retries]);

  const value: OTrustContextValue = {
    ...config,
    isConfigured: true,
  };

  return (
    <OTrustContext.Provider value={value}>
      {children}
    </OTrustContext.Provider>
  );
}

/**
 * Hook to access OTRUST configuration.
 */
export function useOTrust(): OTrustContextValue {
  const context = useContext(OTrustContext);
  
  if (!context) {
    // Return defaults if not wrapped in provider
    return {
      baseUrl: 'https://otrust.eu',
      isConfigured: false,
    };
  }
  
  return context;
}
