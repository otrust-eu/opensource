import { describe, it, expect, vi } from 'vitest';
import { renderHook, act, waitFor } from '@testing-library/react';
import { useProof } from './useProof';

describe('useProof', () => {
  it('returns initial state', () => {
    const { result } = renderHook(() => useProof());

    expect(result.current.isLoading).toBe(false);
    expect(result.current.error).toBeNull();
    expect(result.current.lastVerification).toBeNull();
  });

  it('provides verify function', () => {
    const { result } = renderHook(() => useProof());

    expect(typeof result.current.verify).toBe('function');
  });

  it('provides getProof function', () => {
    const { result } = renderHook(() => useProof());

    expect(typeof result.current.getProof).toBe('function');
  });

  it('provides getWalletPass function', () => {
    const { result } = renderHook(() => useProof());

    expect(typeof result.current.getWalletPass).toBe('function');
  });

  it('sets loading state during verify', async () => {
    const { result } = renderHook(() => useProof());

    // Start verify (will fail due to no API, but should set loading)
    act(() => {
      result.current.verify('id_test123');
    });

    expect(result.current.isLoading).toBe(true);

    // Wait for it to complete
    await waitFor(() => {
      expect(result.current.isLoading).toBe(false);
    });
  });
});
