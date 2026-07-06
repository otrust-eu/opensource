/**
 * OTRUST SDK - HTTP Client
 * 
 * Universal HTTP client that works in Node.js, Deno, Bun, browsers, and edge runtimes.
 * Uses native fetch API with Result types for error handling.
 */

import { Result, ok, err, OTrustError } from './result.js';

// ============================================
// Environment Detection
// ============================================

/**
 * Check if running in a browser environment.
 * Used to guard browser-only features like file downloads.
 */
export function isBrowser(): boolean {
  return typeof window !== 'undefined' && typeof document !== 'undefined';
}

/**
 * Ensure we're running in a browser environment.
 * Throws an error if called from Node.js or other server runtime.
 */
export function requireBrowser(feature: string): void {
  if (!isBrowser()) {
    throw new OTrustError('browser_required', `${feature} is only available in browser environments`);
  }
}

/**
 * Ensure we're NOT running in a browser environment.
 * Used for admin features that should only run server-side.
 */
export function requireServer(feature: string): void {
  if (isBrowser()) {
    throw new OTrustError('server_required', `${feature} should only be used in server environments for security reasons`);
  }
}

// ============================================
// Client Configuration
// ============================================

/** Client configuration */
export interface ClientConfig {
  /** Base URL for the OTRUST API (default: https://otrust.eu) */
  baseUrl?: string;
  /** API key (otrust_live_... or otrust_test_...) */
  apiKey?: string;
  /** live (default) or sandbox (test keys / mock OTS on server) */
  environment?: 'live' | 'sandbox';
  /** Request timeout in milliseconds (default: 30000) */
  timeout?: number;
  /** Number of retry attempts for failed requests (default: 3) */
  retries?: number;
  /** Custom headers to include in all requests */
  headers?: Record<string, string>;
  /** Custom fetch implementation (for testing or edge cases) */
  fetch?: typeof fetch;
}

/** Request options */
export interface RequestOptions {
  method?: 'GET' | 'POST' | 'PUT' | 'DELETE' | 'PATCH';
  headers?: Record<string, string>;
  body?: unknown;
  timeout?: number;
  signal?: AbortSignal;
  /** Idempotency-Key for safe POST retries */
  idempotencyKey?: string;
}

/** Default configuration */
const DEFAULT_CONFIG = {
  baseUrl: 'https://otrust.eu',
  timeout: 30000,
  retries: 3,
  apiKey: undefined as string | undefined,
  environment: 'live' as const,
};

type ResolvedClientConfig = {
  baseUrl: string;
  timeout: number;
  retries: number;
  headers: Record<string, string>;
  apiKey?: string;
  environment?: 'live' | 'sandbox';
  fetch: typeof fetch;
};

/** HTTP Client class */
export class Client {
  private config: ResolvedClientConfig;

  constructor(config: ClientConfig = {}) {
    const env = config.environment === 'sandbox' ? 'sandbox' : 'live';
    const sandboxUrl = (typeof process !== 'undefined' && process.env?.OTRUST_SANDBOX_URL)
      ? process.env.OTRUST_SANDBOX_URL
      : 'https://sandbox.otrust.eu';
    const baseUrl = config.baseUrl ?? (env === 'sandbox' ? sandboxUrl : DEFAULT_CONFIG.baseUrl);

    const headers: Record<string, string> = { ...(config.headers ?? {}) };
    if (config.apiKey) {
      headers.Authorization = `Bearer ${config.apiKey}`;
    }

    this.config = {
      baseUrl,
      timeout: config.timeout ?? DEFAULT_CONFIG.timeout,
      retries: config.retries ?? DEFAULT_CONFIG.retries,
      headers,
      fetch: config.fetch ?? globalThis.fetch.bind(globalThis),
    };
  }

  /** Get the configured base URL */
  get baseUrl(): string {
    return this.config.baseUrl;
  }

  /** Get the configured headers */
  get headers(): Record<string, string> {
    return { ...this.config.headers };
  }

  /** Make an HTTP request with automatic retries and Result type */
  async request<T>(path: string, options: RequestOptions = {}): Promise<Result<T>> {
    const url = `${this.config.baseUrl}${path}`;
    const method = options.method ?? 'GET';
    
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
      'Accept': 'application/json',
      ...this.config.headers,
      ...options.headers,
    };

    if (options.idempotencyKey) {
      headers['Idempotency-Key'] = options.idempotencyKey;
    }

    let lastError: OTrustError | undefined;
    
    for (let attempt = 0; attempt <= this.config.retries; attempt++) {
      try {
        // Create abort controller for timeout
        const controller = new AbortController();
        const timeoutId = setTimeout(
          () => controller.abort(),
          options.timeout ?? this.config.timeout
        );

        const response = await this.config.fetch(url, {
          method,
          headers,
          body: options.body ? JSON.stringify(options.body) : undefined,
          signal: options.signal ?? controller.signal,
        });

        clearTimeout(timeoutId);

        // Parse response
        const text = await response.text();
        let data: T | Record<string, unknown>;
        
        try {
          data = text ? JSON.parse(text) : {};
        } catch {
          data = { raw: text } as Record<string, unknown>;
        }

        // Check for error response
        if (!response.ok) {
          const error = OTrustError.fromResponse(
            response.status,
            data as Record<string, unknown>
          );
          
          // Don't retry on client errors (4xx) except rate limiting
          if (response.status >= 400 && response.status < 500 && response.status !== 429) {
            return err(error);
          }
          
          lastError = error;
          
          // Exponential backoff before retry
          if (attempt < this.config.retries) {
            await this.sleep(Math.min(1000 * Math.pow(2, attempt), 10000));
          }
          continue;
        }

        return ok(data as T);
        
      } catch (error) {
        if (error instanceof Error) {
          if (error.name === 'AbortError') {
            lastError = new OTrustError('timeout', 'Request timed out');
          } else {
            lastError = new OTrustError('network_error', error.message);
          }
        } else {
          lastError = new OTrustError('unknown_error', String(error));
        }
        
        // Exponential backoff before retry
        if (attempt < this.config.retries) {
          await this.sleep(Math.min(1000 * Math.pow(2, attempt), 10000));
        }
      }
    }

    return err(lastError ?? new OTrustError('unknown_error', 'Request failed'));
  }

  /** GET request */
  get<T>(path: string, options?: Omit<RequestOptions, 'method' | 'body'>): Promise<Result<T>> {
    return this.request<T>(path, { ...options, method: 'GET' });
  }

  /** POST request */
  post<T>(path: string, body?: unknown, options?: Omit<RequestOptions, 'method' | 'body'>): Promise<Result<T>> {
    return this.request<T>(path, { ...options, method: 'POST', body });
  }

  /** PUT request */
  put<T>(path: string, body?: unknown, options?: Omit<RequestOptions, 'method' | 'body'>): Promise<Result<T>> {
    return this.request<T>(path, { ...options, method: 'PUT', body });
  }

  /** DELETE request */
  delete<T>(path: string, options?: Omit<RequestOptions, 'method' | 'body'>): Promise<Result<T>> {
    return this.request<T>(path, { ...options, method: 'DELETE' });
  }

  /** Sleep for a given number of milliseconds */
  private sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  /** Update configuration */
  configure(config: Partial<ClientConfig>): void {
    if (config.baseUrl !== undefined) this.config.baseUrl = config.baseUrl;
    if (config.timeout !== undefined) this.config.timeout = config.timeout;
    if (config.retries !== undefined) this.config.retries = config.retries;
    if (config.headers !== undefined) this.config.headers = { ...this.config.headers, ...config.headers };
    if (config.apiKey !== undefined) this.config.headers.Authorization = `Bearer ${config.apiKey}`;
    if (config.fetch !== undefined) this.config.fetch = config.fetch;
  }
}

/** Default client instance */
let defaultClient = new Client();

/** Get the default client */
export function getClient(): Client {
  return defaultClient;
}

/** Configure the default client */
export function configure(config: ClientConfig): void {
  defaultClient = new Client(config);
}

/** Create a new client instance */
export function createClient(config?: ClientConfig): Client {
  return new Client(config);
}
