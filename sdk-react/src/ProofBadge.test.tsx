import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { ProofBadge } from './ProofBadge';

describe('ProofBadge', () => {
  describe('rendering', () => {
    it('renders with proof ID', () => {
      render(<ProofBadge proofId="id_abc123" />);
      
      expect(screen.getByText(/Verified/i)).toBeInTheDocument();
    });

    it('renders identity badge', () => {
      render(<ProofBadge proofId="id_abc123" type="identity" />);
      
      expect(screen.getByText(/Identity/i)).toBeInTheDocument();
    });

    it('renders age badge', () => {
      render(<ProofBadge proofId="id_abc123" type="age" />);
      
      expect(screen.getByText(/Age/i)).toBeInTheDocument();
    });

    it('renders membership badge', () => {
      render(<ProofBadge proofId="id_abc123" type="membership" />);
      
      // Component shows "Member" not "Membership"
      expect(screen.getByText(/Member/i)).toBeInTheDocument();
    });

    it('renders custom label', () => {
      render(<ProofBadge proofId="id_abc123" label="Custom Badge" />);
      
      expect(screen.getByText('Custom Badge')).toBeInTheDocument();
    });

    it('applies custom className', () => {
      const { container } = render(
        <ProofBadge proofId="id_abc123" className="custom-class" />
      );
      
      expect(container.firstChild).toHaveClass('custom-class');
    });
  });

  describe('status', () => {
    it('shows verified status when not auto-verifying', () => {
      render(<ProofBadge proofId="id_abc123" showStatus />);
      
      // When autoVerify=false, it defaults to verified
      expect(screen.getByText(/Verified/i)).toBeInTheDocument();
    });

    it('shows loading when auto-verifying', () => {
      render(<ProofBadge proofId="id_abc123" autoVerify showStatus />);
      
      expect(screen.getByText(/Verifying/i)).toBeInTheDocument();
    });
  });
});
