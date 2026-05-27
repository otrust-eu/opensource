/**
 * useProof Hook
 *
 * Manage proof verification and display in React.
 */

import { useState, useCallback } from 'react';
import { proof } from '@otrust/sdk';

export interface UseProofReturn {
  /** Verify a proof by ID */
  verify: (proofId: string) => Promise<ProofVerification | null>;
  /** Verify a proof with PIN (for signing with proof requirement) */
  verifyWithPin: (proofId: string, pin: string) => Promise<ProofVerification | null>;
  /** Get proof details */
  getProof: (proofId: string) => Promise<ProofDetails | null>;
  /** Get wallet pass URL */
  getWalletPass: (proofId: string, platform: 'apple') => Promise<string | null>;
  /** Loading state */
  isLoading: boolean;
  /** Error state */
  error: Error | null;
  /** Last verification result */
  lastVerification: ProofVerification | null;
}

interface ProofVerification {
  valid: boolean;
  proofId: string;
  proofType?: string;
  verification?: {
    faceMatch?: boolean;
    livenessVerified?: boolean;
    documentVerified?: boolean;
    timestamp?: string;
  };
}

interface ProofDetails {
  id: string;
  type: string;
  statement?: string;
  status: string;
  createdAt: string;
  expiresAt?: string;
}

/**
 * Hook for managing proofs.
 *
 * @example
 * ```tsx
 * function ProofVerifier() {
 *   const { verify, isLoading, lastVerification } = useProof();
 *
 *   const handleVerify = async () => {
 *     const result = await verify('id_abc123');
 *     if (result?.valid) {
 *       console.log('Proof is valid!');
 *     }
 *   };
 *
 *   return (
 *     <button onClick={handleVerify} disabled={isLoading}>
 *       Verify Proof
 *     </button>
 *   );
 * }
 * ```
 */
export function useProof(): UseProofReturn {
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<Error | null>(null);
  const [lastVerification, setLastVerification] = useState<ProofVerification | null>(null);

  const verify = useCallback(async (proofId: string): Promise<ProofVerification | null> => {
    setIsLoading(true);
    setError(null);

    try {
      const result = await proof.verify(proofId);

      if (result.ok) {
        const verification: ProofVerification = {
          valid: result.value.valid,
          proofId: proofId,
          proofType: result.value.proofType,
          verification: result.value.verification,
        };
        setLastVerification(verification);
        return verification;
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

  const getProof = useCallback(async (proofId: string): Promise<ProofDetails | null> => {
    setIsLoading(true);
    setError(null);

    try {
      const result = await proof.get(proofId);

      if (result.ok) {
        return {
          id: result.value.id,
          type: result.value.type,
          statement: result.value.statement,
          status: result.value.status,
          createdAt: result.value.createdAt,
          expiresAt: result.value.expiresAt,
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

  const getWalletPass = useCallback(async (
    proofId: string,
    platform: 'apple'
  ): Promise<string | null> => {
    setIsLoading(true);
    setError(null);

    try {
      const result = await proof.wallet(proofId, platform);

      if (result.ok) {
        return result.value.saveUrl ?? null;
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

  /** Verify proof with PIN (for signing with OTRUST Proof requirement) */
  const verifyWithPin = useCallback(async (
    proofId: string,
    pin: string
  ): Promise<ProofVerification | null> => {
    setIsLoading(true);
    setError(null);

    try {
      const result = await proof.verifyWithPin(proofId, pin);

      if (result.ok) {
        const verification: ProofVerification = {
          valid: result.value.valid,
          proofId: result.value.proofId,
          verification: result.value.verification,
        };
        setLastVerification(verification);
        return verification;
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
    verify,
    verifyWithPin,
    getProof,
    getWalletPass,
    isLoading,
    error,
    lastVerification,
  };
}
