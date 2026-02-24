import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render } from '@testing-library/react';
import { createPageWrapper } from '@/test/mocks/wrapper';
import { resetMockResponses } from '@/test/mocks/supabase';
import { resetToast } from '@/test/mocks/toast';
import { resetAuthContext, setAuthContext } from '@/test/mocks/auth';
import { mockProfile } from '@/test/mocks/supabase';

beforeEach(() => {
  vi.clearAllMocks();
  resetMockResponses();
  resetToast();
  resetAuthContext();
  // Partner pages expect a sales_rep role
  setAuthContext({
    userRole: 'sales_rep' as any,
    profile: { ...mockProfile, role: 'sales_rep', partner_tier: 'standard' } as any,
  });
});

// Mock framer-motion
vi.mock('framer-motion', async (importOriginal) => {
  const actual = await importOriginal<typeof import('framer-motion')>();
  return {
    ...actual,
    motion: new Proxy({}, {
      get: (_target, prop) => {
        return ({ children, initial, animate, exit, transition, variants, whileHover, whileTap, whileInView, viewport, layout, layoutId, ...rest }: any) => {
          const Tag = typeof prop === 'string' && ['div', 'span', 'p', 'section', 'header', 'footer', 'main', 'nav', 'ul', 'li', 'a', 'button', 'h1', 'h2', 'h3', 'h4', 'form', 'input', 'img', 'tr', 'td'].includes(prop) ? prop : 'div';
          return <Tag {...rest}>{children}</Tag>;
        };
      },
    }),
    AnimatePresence: ({ children }: any) => children,
  };
});

describe('Partner Pages — Smoke Tests', () => {
  it('PartnerDashboard renders without crashing', async () => {
    const PartnerDashboard = (await import('../partner/PartnerDashboard')).default;
    const { container } = render(<PartnerDashboard />, { wrapper: createPageWrapper(['/partner']) });
    expect(container.firstChild).toBeTruthy();
  });

  it('PartnerStore renders without crashing', async () => {
    const PartnerStore = (await import('../partner/PartnerStore')).default;
    const { container } = render(<PartnerStore />, { wrapper: createPageWrapper(['/partner/store']) });
    expect(container.firstChild).toBeTruthy();
  });

  it('PartnerOrders renders without crashing', async () => {
    const PartnerOrders = (await import('../partner/PartnerOrders')).default;
    const { container } = render(<PartnerOrders />, { wrapper: createPageWrapper(['/partner/orders']) });
    expect(container.firstChild).toBeTruthy();
  });
});
