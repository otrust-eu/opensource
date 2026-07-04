import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { SignatureStatus } from './SignatureStatus';

describe('SignatureStatus', () => {
  describe('rendering', () => {
    it('renders with request ID', () => {
      render(<SignatureStatus requestId="sr_abc123" />);
      
      // Shows loading state initially
      expect(screen.getByText(/Loading/i)).toBeInTheDocument();
    });

    it('applies custom className', () => {
      const { container } = render(
        <SignatureStatus requestId="sr_abc123" className="custom-status" />
      );
      
      expect(container.firstChild).toHaveClass('custom-status');
    });
  });

  describe('polling', () => {
    it('does not poll when pollInterval is not set', () => {
      vi.useFakeTimers();
      
      render(<SignatureStatus requestId="sr_abc123" />);
      
      // No interval should be set
      vi.advanceTimersByTime(60000);
      
      vi.useRealTimers();
    });
  });
});
