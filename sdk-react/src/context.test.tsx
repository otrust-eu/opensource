import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { OTrustProvider, useOTrust } from './context';

// Test component to access context
function TestComponent() {
  const config = useOTrust();
  return (
    <div>
      <span data-testid="configured">{String(config.isConfigured)}</span>
      <span data-testid="baseUrl">{config.baseUrl}</span>
      <span data-testid="clientId">{config.clientId ?? 'none'}</span>
    </div>
  );
}

describe('OTrustProvider', () => {
  it('provides config to children', () => {
    render(
      <OTrustProvider config={{ clientId: 'test-app', baseUrl: 'https://test.otrust.eu' }}>
        <TestComponent />
      </OTrustProvider>
    );

    expect(screen.getByTestId('configured')).toHaveTextContent('true');
    expect(screen.getByTestId('clientId')).toHaveTextContent('test-app');
    expect(screen.getByTestId('baseUrl')).toHaveTextContent('https://test.otrust.eu');
  });

  it('provides defaults when no config', () => {
    render(
      <OTrustProvider>
        <TestComponent />
      </OTrustProvider>
    );

    expect(screen.getByTestId('configured')).toHaveTextContent('true');
    expect(screen.getByTestId('clientId')).toHaveTextContent('none');
  });
});

describe('useOTrust', () => {
  it('returns defaults when not wrapped in provider', () => {
    render(<TestComponent />);

    expect(screen.getByTestId('configured')).toHaveTextContent('false');
    expect(screen.getByTestId('baseUrl')).toHaveTextContent('https://otrust.eu');
  });
});
