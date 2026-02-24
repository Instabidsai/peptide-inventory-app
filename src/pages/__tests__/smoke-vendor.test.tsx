import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render } from '@testing-library/react';
import { createPageWrapper } from '@/test/mocks/wrapper';
import { resetMockResponses, mockProfile } from '@/test/mocks/supabase';
import { resetToast } from '@/test/mocks/toast';
import { resetAuthContext, setAuthContext } from '@/test/mocks/auth';

beforeEach(() => {
  vi.clearAllMocks();
  resetMockResponses();
  resetToast();
  resetAuthContext();
  // Vendor pages expect super_admin role
  setAuthContext({
    userRole: 'super_admin' as any,
    profile: { ...mockProfile, role: 'super_admin' } as any,
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

// Mock recharts
vi.mock('recharts', () => ({
  ResponsiveContainer: ({ children }: any) => <div>{children}</div>,
  LineChart: ({ children }: any) => <div>{children}</div>,
  BarChart: ({ children }: any) => <div>{children}</div>,
  PieChart: ({ children }: any) => <div>{children}</div>,
  AreaChart: ({ children }: any) => <div>{children}</div>,
  ComposedChart: ({ children }: any) => <div>{children}</div>,
  Line: () => null,
  Bar: () => null,
  Pie: () => null,
  Area: () => null,
  Cell: () => null,
  XAxis: () => null,
  YAxis: () => null,
  CartesianGrid: () => null,
  Tooltip: () => null,
  Legend: () => null,
  ReferenceLine: () => null,
}));

describe('Vendor Pages — Smoke Tests', () => {
  it('VendorDashboard renders without crashing', async () => {
    const VendorDashboard = (await import('../vendor/VendorDashboard')).default;
    const { container } = render(<VendorDashboard />, { wrapper: createPageWrapper(['/vendor']) });
    expect(container.firstChild).toBeTruthy();
  });

  it('VendorTenants renders without crashing', async () => {
    const VendorTenants = (await import('../vendor/VendorTenants')).default;
    const { container } = render(<VendorTenants />, { wrapper: createPageWrapper(['/vendor/tenants']) });
    expect(container.firstChild).toBeTruthy();
  });

  it('TenantDetail renders without crashing', async () => {
    const TenantDetail = (await import('../vendor/TenantDetail')).default;
    const { container } = render(<TenantDetail />, { wrapper: createPageWrapper(['/vendor/tenant/org-123']) });
    expect(container.firstChild).toBeTruthy();
  });

  it('VendorSupplyOrders renders without crashing', async () => {
    const VendorSupplyOrders = (await import('../vendor/VendorSupplyOrders')).default;
    const { container } = render(<VendorSupplyOrders />, { wrapper: createPageWrapper(['/vendor/supply-orders']) });
    expect(container.firstChild).toBeTruthy();
  });

  it('VendorAnalytics renders without crashing', async () => {
    const VendorAnalytics = (await import('../vendor/VendorAnalytics')).default;
    const { container } = render(<VendorAnalytics />, { wrapper: createPageWrapper(['/vendor/analytics']) });
    expect(container.firstChild).toBeTruthy();
  });

  it('VendorBilling renders without crashing', async () => {
    const VendorBilling = (await import('../vendor/VendorBilling')).default;
    const { container } = render(<VendorBilling />, { wrapper: createPageWrapper(['/vendor/billing']) });
    expect(container.firstChild).toBeTruthy();
  });

  it('VendorHealth renders without crashing', async () => {
    const VendorHealth = (await import('../vendor/VendorHealth')).default;
    const { container } = render(<VendorHealth />, { wrapper: createPageWrapper(['/vendor/health']) });
    expect(container.firstChild).toBeTruthy();
  });

  it('VendorSupport renders without crashing', async () => {
    const VendorSupport = (await import('../vendor/VendorSupport')).default;
    const { container } = render(<VendorSupport />, { wrapper: createPageWrapper(['/vendor/support']) });
    expect(container.firstChild).toBeTruthy();
  });

  it('VendorOnboarding renders without crashing', async () => {
    const VendorOnboarding = (await import('../vendor/VendorOnboarding')).default;
    const { container } = render(<VendorOnboarding />, { wrapper: createPageWrapper(['/vendor/onboarding']) });
    expect(container.firstChild).toBeTruthy();
  });

  it('VendorMessages renders without crashing', async () => {
    const VendorMessages = (await import('../vendor/VendorMessages')).default;
    const { container } = render(<VendorMessages />, { wrapper: createPageWrapper(['/vendor/messages']) });
    expect(container.firstChild).toBeTruthy();
  });

  it('VendorAudit renders without crashing', async () => {
    const VendorAudit = (await import('../vendor/VendorAudit')).default;
    const { container } = render(<VendorAudit />, { wrapper: createPageWrapper(['/vendor/audit']) });
    expect(container.firstChild).toBeTruthy();
  });

  it('VendorSettings renders without crashing', async () => {
    const VendorSettings = (await import('../vendor/VendorSettings')).default;
    const { container } = render(<VendorSettings />, { wrapper: createPageWrapper(['/vendor/settings']) });
    expect(container.firstChild).toBeTruthy();
  });

  it('VendorLayout renders without crashing', async () => {
    const VendorLayout = (await import('../vendor/VendorLayout')).default;
    // VendorLayout uses <Outlet />, so render with route context
    const { container } = render(<VendorLayout />, { wrapper: createPageWrapper(['/vendor']) });
    expect(container.firstChild).toBeTruthy();
  });
});
