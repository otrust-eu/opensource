import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { LoginWithOTrust } from './LoginWithOTrust';
import { OTrustProvider } from './context';

describe('LoginWithOTrust', () => {
  describe('rendering', () => {
    it('renders default button text', () => {
      render(
        <OTrustProvider config={{ clientId: 'test', redirectUri: 'https://test.com/cb' }}>
          <LoginWithOTrust />
        </OTrustProvider>
      );

      expect(screen.getByRole('button')).toHaveTextContent('Login with OTRUST');
    });

    it('renders custom children', () => {
      render(
        <OTrustProvider config={{ clientId: 'test', redirectUri: 'https://test.com/cb' }}>
          <LoginWithOTrust>Sign In</LoginWithOTrust>
        </OTrustProvider>
      );

      expect(screen.getByRole('button')).toHaveTextContent('Sign In');
    });

    it('renders disabled state', () => {
      render(
        <OTrustProvider config={{ clientId: 'test', redirectUri: 'https://test.com/cb' }}>
          <LoginWithOTrust disabled />
        </OTrustProvider>
      );

      expect(screen.getByRole('button')).toBeDisabled();
    });

    it('applies custom className', () => {
      render(
        <OTrustProvider config={{ clientId: 'test', redirectUri: 'https://test.com/cb' }}>
          <LoginWithOTrust className="custom-class" />
        </OTrustProvider>
      );

      expect(screen.getByRole('button')).toHaveClass('custom-class');
    });
  });

  describe('callbacks', () => {
    it('calls onError when clientId missing', async () => {
      const onError = vi.fn();
      
      render(
        <OTrustProvider>
          <LoginWithOTrust onError={onError} />
        </OTrustProvider>
      );

      fireEvent.click(screen.getByRole('button'));
      
      // Wait for async handler
      await vi.waitFor(() => {
        expect(onError).toHaveBeenCalled();
      });
      
      expect(onError).toHaveBeenCalledWith(
        expect.objectContaining({
          message: expect.stringContaining('clientId')
        })
      );
    });

    it('calls onAuthStart when clicked', async () => {
      const onAuthStart = vi.fn();
      
      render(
        <OTrustProvider config={{ clientId: 'test', redirectUri: 'https://test.com/cb' }}>
          <LoginWithOTrust onAuthStart={onAuthStart} />
        </OTrustProvider>
      );

      fireEvent.click(screen.getByRole('button'));
      
      await vi.waitFor(() => {
        expect(onAuthStart).toHaveBeenCalled();
      });
    });
  });
});
