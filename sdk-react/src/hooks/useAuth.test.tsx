import { describe, it, expect, vi } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useAuth } from './useAuth';
import { OTrustProvider } from '../context';
import type { ReactNode } from 'react';

const wrapper = ({ children }: { children: ReactNode }) => (
  <OTrustProvider config={{ clientId: 'test-app', redirectUri: 'https://test.com/callback' }}>
    {children}
  </OTrustProvider>
);

describe('useAuth', () => {
  beforeEach(() => {
    // Clear storage
    sessionStorage.clear();
    localStorage.clear();
  });

  it('returns initial unauthenticated state', () => {
    const { result } = renderHook(() => useAuth(), { wrapper });

    expect(result.current.isAuthenticated).toBe(false);
    expect(result.current.user).toBeNull();
    expect(result.current.token).toBeNull();
  });

  it('provides login function', () => {
    const { result } = renderHook(() => useAuth(), { wrapper });

    expect(typeof result.current.login).toBe('function');
  });

  it('provides logout function', () => {
    const { result } = renderHook(() => useAuth(), { wrapper });

    expect(typeof result.current.logout).toBe('function');
  });

  it('provides handleCallback function', () => {
    const { result } = renderHook(() => useAuth(), { wrapper });

    expect(typeof result.current.handleCallback).toBe('function');
  });

  it('provides verifyToken function', () => {
    const { result } = renderHook(() => useAuth(), { wrapper });

    expect(typeof result.current.verifyToken).toBe('function');
  });

  it('resets state on logout', async () => {
    const { result } = renderHook(() => useAuth(), { wrapper });

    await act(async () => {
      result.current.logout();
    });

    // After logout, user should be cleared
    expect(result.current.isAuthenticated).toBe(false);
    expect(result.current.user).toBeNull();
    expect(result.current.token).toBeNull();
  });
});
