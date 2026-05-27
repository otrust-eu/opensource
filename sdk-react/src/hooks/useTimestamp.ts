/**
 * useTimestamp Hook
 *
 * Create and verify timestamps in React.
 */

import { useState, useCallback } from 'react';
import { timestamp, type TimestampClaim } from '@otrust/sdk';

export interface UseTimestampReturn {
  /** Create a timestamp for a file or data */
  create: (data: File | Blob | string, options?: CreateOptions) => Promise<TimestampClaim | null>;
  /** Verify if data has been timestamped */
  verify: (data: File | Blob | string) => Promise<VerifyResult | null>;
  /** Look up a timestamp by hash */
  lookup: (hash: string) => Promise<LookupResult | null>;
  /** Loading state */
  isLoading: boolean;
  /** Progress (0-1) for file hashing */
  progress: number;
  /** Error state */
  error: Error | null;
  /** Last created claim */
  lastClaim: TimestampClaim | null;
}

interface CreateOptions {
  email?: string;
  filename?: string;
}

interface VerifyResult {
  exists: boolean;
  claim?: TimestampClaim;
}

interface LookupResult {
  exists: boolean;
  receiptId?: string;
}

/**
 * Hook for creating and verifying timestamps.
 *
 * @example
 * ```tsx
 * function TimestampForm() {
 *   const { create, isLoading, progress, lastClaim, error } = useTimestamp();
 *
 *   const handleFile = async (file: File) => {
 *     const claim = await create(file, { email: 'me@example.com' });
 *     if (claim) {
 *       console.log('Timestamped:', claim.receiptId);
 *     }
 *   };
 *
 *   return (
 *     <input type="file" onChange={(e) => handleFile(e.target.files[0])} />
 *   );
 * }
 * ```
 */
export function useTimestamp(): UseTimestampReturn {
  const [isLoading, setIsLoading] = useState(false);
  const [progress, setProgress] = useState(0);
  const [error, setError] = useState<Error | null>(null);
  const [lastClaim, setLastClaim] = useState<TimestampClaim | null>(null);

  const create = useCallback(async (
    data: File | Blob | string,
    options?: CreateOptions
  ): Promise<TimestampClaim | null> => {
    setIsLoading(true);
    setProgress(0);
    setError(null);

    try {
      // Hash with progress if it's a file
      if (data instanceof File || data instanceof Blob) {
        // Use the SDK's hash with progress
        const hash = await timestamp.hash(data, (p) => setProgress(p * 0.5));
        setProgress(0.5);

        const result = await timestamp.create(hash, {
          filename: options?.filename ?? (data instanceof File ? data.name : undefined),
          email: options?.email,
        });

        setProgress(1);

        if (result.ok) {
          setLastClaim(result.value);
          return result.value;
        } else {
          throw new Error(result.error.message);
        }
      } else {
        // String data - direct create
        const result = await timestamp.create(data, options);
        setProgress(1);

        if (result.ok) {
          setLastClaim(result.value);
          return result.value;
        } else {
          throw new Error(result.error.message);
        }
      }
    } catch (err) {
      const error = err instanceof Error ? err : new Error(String(err));
      setError(error);
      return null;
    } finally {
      setIsLoading(false);
    }
  }, []);

  const verify = useCallback(async (data: File | Blob | string): Promise<VerifyResult | null> => {
    setIsLoading(true);
    setProgress(0);
    setError(null);

    try {
      const result = await timestamp.verify(data);
      setProgress(1);

      if (result.ok) {
        return {
          exists: result.value.exists,
          claim: result.value.claim,
        };
      } else {
        throw new Error(result.error.message);
      }
    } catch (err) {
      const error = err instanceof Error ? err : new Error(String(err));
      setError(error);
      return null;
    } finally {
      setIsLoading(false);
    }
  }, []);

  const lookup = useCallback(async (hash: string): Promise<LookupResult | null> => {
    setIsLoading(true);
    setError(null);

    try {
      const result = await timestamp.lookup(hash);

      if (result.ok) {
        return {
          exists: result.value.exists,
          receiptId: result.value.receiptId,
        };
      } else {
        throw new Error(result.error.message);
      }
    } catch (err) {
      const error = err instanceof Error ? err : new Error(String(err));
      setError(error);
      return null;
    } finally {
      setIsLoading(false);
    }
  }, []);

  return {
    create,
    verify,
    lookup,
    isLoading,
    progress,
    error,
    lastClaim,
  };
}
