import { describe, it, expect, vi } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useProof } from './useProof';

const { verifyMock } = vi.hoisted(() => ({
  verifyMock: vi.fn(),
}));

vi.mock('@otrust/sdk', () => ({
  proof: {
    verify: verifyMock,
  },
}));

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
    let finishRequest!: (value: { ok: false; error: Error }) => void;
    verifyMock.mockImplementationOnce(() => new Promise((resolve) => {
      finishRequest = resolve;
    }));
    let request!: Promise<unknown>;

    act(() => {
      request = result.current.verify('id_test123');
    });

    expect(result.current.isLoading).toBe(true);

    await act(async () => {
      finishRequest({ ok: false, error: new Error('Verification failed') });
      await request;
    });

    expect(result.current.isLoading).toBe(false);
  });
});
