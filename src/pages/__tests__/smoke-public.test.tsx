import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { createPageWrapper } from '@/test/mocks/wrapper';
import { resetMockResponses } from '@/test/mocks/supabase';
import { resetToast } from '@/test/mocks/toast';
import { resetAuthContext, setAuthContext } from '@/test/mocks/auth';

beforeEach(() => {
  vi.clearAllMocks();
  resetMockResponses();
  resetToast();
  resetAuthContext();
});

// Mock framer-motion — use importOriginal to keep hooks, just stub DOM components
vi.mock('framer-motion', async (importOriginal) => {
  const actual = await importOriginal<typeof import('framer-motion')>();
  return {
    ...actual,
    motion: new Proxy({}, {
      get: (_target, prop) => {
        return ({ children, initial, animate, exit, transition, variants, whileHover, whileTap, whileInView, viewport, ...rest }: any) => {
          const Tag = typeof prop === 'string' && ['div', 'span', 'p', 'section', 'header', 'footer', 'main', 'nav', 'ul', 'li', 'a', 'button', 'h1', 'h2', 'h3', 'h4', 'form', 'input', 'img'].includes(prop) ? prop : 'div';
          return <Tag {...rest}>{children}</Tag>;
        };
      },
    }),
    AnimatePresence: ({ children }: any) => children,
  };
});

describe('Public Pages — Smoke Tests', () => {
  it('NotFound renders without crashing', async () => {
    const NotFound = (await import('../NotFound')).default;
    const { container } = render(<NotFound />, { wrapper: createPageWrapper(['/unknown']) });
    expect(container.firstChild).toBeTruthy();
  });

  it('CrmLanding renders without crashing', async () => {
    const CrmLanding = (await import('../CrmLanding')).default;
    const { container } = render(<CrmLanding />, { wrapper: createPageWrapper(['/crm']) });
    expect(container.firstChild).toBeTruthy();
  });

  it('PrivacyPolicy renders without crashing', async () => {
    const PrivacyPolicy = (await import('../legal/PrivacyPolicy')).default;
    const { container } = render(<PrivacyPolicy />, { wrapper: createPageWrapper(['/privacy']) });
    expect(container.firstChild).toBeTruthy();
  });

  it('TermsOfService renders without crashing', async () => {
    const TermsOfService = (await import('../legal/TermsOfService')).default;
    const { container } = render(<TermsOfService />, { wrapper: createPageWrapper(['/terms']) });
    expect(container.firstChild).toBeTruthy();
  });

  it('Auth renders without crashing', async () => {
    setAuthContext({ user: null as any, session: null as any });
    const Auth = (await import('../Auth')).default;
    const { container } = render(<Auth />, { wrapper: createPageWrapper(['/auth']) });
    expect(container.firstChild).toBeTruthy();
  });

  it('Join renders without crashing', async () => {
    setAuthContext({ user: null as any, session: null as any });
    const Join = (await import('../Join')).default;
    const { container } = render(<Join />, { wrapper: createPageWrapper(['/join']) });
    expect(container.firstChild).toBeTruthy();
  });

  it('UpdatePassword renders without crashing', async () => {
    const UpdatePassword = (await import('../auth/UpdatePassword')).default;
    const { container } = render(<UpdatePassword />, { wrapper: createPageWrapper(['/update-password']) });
    expect(container.firstChild).toBeTruthy();
  });

  it('Onboarding renders without crashing', async () => {
    const Onboarding = (await import('../Onboarding')).default;
    const { container } = render(<Onboarding />, { wrapper: createPageWrapper(['/onboarding']) });
    expect(container.firstChild).toBeTruthy();
  });

  it('CheckoutSuccess renders without crashing', async () => {
    const CheckoutSuccess = (await import('../checkout/CheckoutSuccess')).default;
    const { container } = render(<CheckoutSuccess />, { wrapper: createPageWrapper(['/checkout/success?orderId=test-123']) });
    expect(container.firstChild).toBeTruthy();
  });

  it('CheckoutCancel renders without crashing', async () => {
    const CheckoutCancel = (await import('../checkout/CheckoutCancel')).default;
    const { container } = render(<CheckoutCancel />, { wrapper: createPageWrapper(['/checkout/cancel']) });
    expect(container.firstChild).toBeTruthy();
  });
});
