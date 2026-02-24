import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { ErrorBoundary } from '../ErrorBoundary';

// Mock Sentry to avoid import errors
vi.mock('@sentry/react', () => ({
  captureException: vi.fn(),
}));

// Component that throws on render
function ThrowingComponent({ error }: { error?: Error }) {
  if (error) throw error;
  return <div>All good</div>;
}

describe('ErrorBoundary', () => {
  const originalError = console.error;
  beforeEach(() => { console.error = vi.fn(); });
  afterEach(() => { console.error = originalError; });

  it('renders children when no error', () => {
    render(
      <ErrorBoundary>
        <div>Child content</div>
      </ErrorBoundary>
    );
    expect(screen.getByText('Child content')).toBeInTheDocument();
  });

  it('shows error UI when child throws', () => {
    render(
      <ErrorBoundary>
        <ThrowingComponent error={new Error('Boom')} />
      </ErrorBoundary>
    );
    expect(screen.getByText('Something went wrong')).toBeInTheDocument();
    expect(screen.getByText(/Try Again/)).toBeInTheDocument();
    expect(screen.getByText(/Reload Page/)).toBeInTheDocument();
  });

  it('renders custom fallback when provided', () => {
    render(
      <ErrorBoundary fallback={<div>Custom fallback</div>}>
        <ThrowingComponent error={new Error('Crash')} />
      </ErrorBoundary>
    );
    expect(screen.getByText('Custom fallback')).toBeInTheDocument();
    expect(screen.queryByText('Something went wrong')).not.toBeInTheDocument();
  });

  it('shows chunk/dynamic import message for code splitting errors', () => {
    render(
      <ErrorBoundary>
        <ThrowingComponent error={new Error('Loading chunk 42 failed')} />
      </ErrorBoundary>
    );
    expect(screen.getByText(/new version.*available/i)).toBeInTheDocument();
  });

  it('shows network message for fetch errors', () => {
    render(
      <ErrorBoundary>
        <ThrowingComponent error={new Error('network error')} />
      </ErrorBoundary>
    );
    expect(screen.getByText(/couldn.*reach the server/i)).toBeInTheDocument();
  });

  describe('friendlyMessage', () => {
    it('returns chunk reload message for dynamic imports', () => {
      const msg = ErrorBoundary.friendlyMessage(new Error('dynamically imported module'));
      expect(msg).toContain('new version');
    });

    it('returns network message for fetch errors', () => {
      const msg = ErrorBoundary.friendlyMessage(new Error('fetch failed'));
      expect(msg).toContain('server');
    });

    it('returns generic message for unknown errors', () => {
      const msg = ErrorBoundary.friendlyMessage(new Error('random thing'));
      expect(msg).toContain('unexpected');
    });

    it('returns generic message for null error', () => {
      const msg = ErrorBoundary.friendlyMessage(null);
      expect(msg).toContain('unexpected');
    });
  });
});
