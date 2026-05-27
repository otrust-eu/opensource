import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent, act } from '@testing-library/react';
import { TimestampWidget } from './TimestampWidget';

describe('TimestampWidget', () => {
  describe('rendering', () => {
    it('renders drop zone', () => {
      render(<TimestampWidget />);

      // Actual text is "Drop files here or click to browse"
      expect(screen.getByText(/Drop files here/i)).toBeInTheDocument();
    });

    it('renders file input', () => {
      const { container } = render(<TimestampWidget />);

      const input = container.querySelector('input[type="file"]');
      expect(input).toBeInTheDocument();
    });

    it('applies custom className', () => {
      const { container } = render(<TimestampWidget className="custom-widget" />);

      expect(container.firstChild).toHaveClass('custom-widget');
    });
  });

  describe('file input', () => {
    it('accepts multiple files when enabled', () => {
      const { container } = render(<TimestampWidget multiple />);

      const input = container.querySelector('input[type="file"]');
      expect(input).toHaveAttribute('multiple');
    });

    it('restricts file types with accept prop', () => {
      const { container } = render(<TimestampWidget accept=".pdf,.doc" />);

      const input = container.querySelector('input[type="file"]');
      expect(input).toHaveAttribute('accept', '.pdf,.doc');
    });
  });

  describe('callbacks', () => {
    it('calls onError for oversized files', async () => {
      const onError = vi.fn();
      const { container } = render(
        <TimestampWidget maxSize={100} onError={onError} />
      );

      const file = new File(['x'.repeat(200)], 'large.txt', { type: 'text/plain' });
      const input = container.querySelector('input[type="file"]') as HTMLInputElement;

      Object.defineProperty(input, 'files', {
        value: [file],
      });

      await act(async () => {
        fireEvent.change(input);
      });

      await vi.waitFor(() => {
        expect(onError).toHaveBeenCalled();
      });
    });
  });
});
