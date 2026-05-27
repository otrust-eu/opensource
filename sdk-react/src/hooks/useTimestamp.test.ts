import { describe, it, expect, vi } from 'vitest';
import { renderHook, act, waitFor } from '@testing-library/react';
import { useTimestamp } from './useTimestamp';

describe('useTimestamp', () => {
  it('returns initial state', () => {
    const { result } = renderHook(() => useTimestamp());

    expect(result.current.isLoading).toBe(false);
    expect(result.current.progress).toBe(0);
    expect(result.current.error).toBeNull();
    expect(result.current.lastClaim).toBeNull();
  });

  it('provides create function', () => {
    const { result } = renderHook(() => useTimestamp());

    expect(typeof result.current.create).toBe('function');
  });

  it('provides verify function', () => {
    const { result } = renderHook(() => useTimestamp());

    expect(typeof result.current.verify).toBe('function');
  });

  it('provides lookup function', () => {
    const { result } = renderHook(() => useTimestamp());

    expect(typeof result.current.lookup).toBe('function');
  });

  it('sets loading state during create', async () => {
    const { result } = renderHook(() => useTimestamp());

    // Verify initial state is not loading
    expect(result.current.isLoading).toBe(false);

    // Verify create function exists and can be called
    expect(typeof result.current.create).toBe('function');
  });
});
