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

// Mock recharts (ResponsiveContainer needs real DOM dimensions)
vi.mock('recharts', () => ({
  ResponsiveContainer: ({ children }: any) => <div data-testid="responsive-container">{children}</div>,
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

describe('Admin Pages — Smoke Tests', () => {
  it('Dashboard renders without crashing', async () => {
    const Dashboard = (await import('../Dashboard')).default;
    const { container } = render(<Dashboard />, { wrapper: createPageWrapper(['/']) });
    expect(container.firstChild).toBeTruthy();
  });

  it('Contacts renders without crashing', async () => {
    const Contacts = (await import('../Contacts')).default;
    const { container } = render(<Contacts />, { wrapper: createPageWrapper(['/contacts']) });
    expect(container.firstChild).toBeTruthy();
  });

  it('ContactDetails renders without crashing', async () => {
    const ContactDetails = (await import('../ContactDetails')).default;
    const { container } = render(<ContactDetails />, { wrapper: createPageWrapper(['/contacts/test-id']) });
    expect(container.firstChild).toBeTruthy();
  });

  it('Peptides renders without crashing', async () => {
    const Peptides = (await import('../Peptides')).default;
    const { container } = render(<Peptides />, { wrapper: createPageWrapper(['/peptides']) });
    expect(container.firstChild).toBeTruthy();
  });

  it('Lots renders without crashing', async () => {
    const Lots = (await import('../Lots')).default;
    const { container } = render(<Lots />, { wrapper: createPageWrapper(['/lots']) });
    expect(container.firstChild).toBeTruthy();
  });

  it('Bottles renders without crashing', async () => {
    const Bottles = (await import('../Bottles')).default;
    const { container } = render(<Bottles />, { wrapper: createPageWrapper(['/bottles']) });
    expect(container.firstChild).toBeTruthy();
  });

  it('Orders renders without crashing', async () => {
    const Orders = (await import('../Orders')).default;
    const { container } = render(<Orders />, { wrapper: createPageWrapper(['/orders']) });
    expect(container.firstChild).toBeTruthy();
  });

  it('OrderList renders without crashing', async () => {
    const OrderList = (await import('../sales/OrderList')).default;
    const { container } = render(<OrderList />, { wrapper: createPageWrapper(['/sales']) });
    expect(container.firstChild).toBeTruthy();
  });

  it('NewOrder renders without crashing', async () => {
    const NewOrder = (await import('../sales/NewOrder')).default;
    const { container } = render(<NewOrder />, { wrapper: createPageWrapper(['/sales/new']) });
    expect(container.firstChild).toBeTruthy();
  });

  it('OrderDetails renders without crashing', async () => {
    const OrderDetails = (await import('../sales/OrderDetails')).default;
    const { container } = render(<OrderDetails />, { wrapper: createPageWrapper(['/sales/order-123']) });
    expect(container.firstChild).toBeTruthy();
  });

  it('Movements renders without crashing', async () => {
    const Movements = (await import('../Movements')).default;
    const { container } = render(<Movements />, { wrapper: createPageWrapper(['/movements']) });
    expect(container.firstChild).toBeTruthy();
  });

  it('MovementWizard renders without crashing', async () => {
    const MovementWizard = (await import('../MovementWizard')).default;
    const { container } = render(<MovementWizard />, { wrapper: createPageWrapper(['/movements/new']) });
    expect(container.firstChild).toBeTruthy();
  });

  it('FulfillmentCenter renders without crashing', async () => {
    const FulfillmentCenter = (await import('../FulfillmentCenter')).default;
    const { container } = render(<FulfillmentCenter />, { wrapper: createPageWrapper(['/fulfillment']) });
    expect(container.firstChild).toBeTruthy();
  });

  it('Protocols renders without crashing', async () => {
    const Protocols = (await import('../Protocols')).default;
    const { container } = render(<Protocols />, { wrapper: createPageWrapper(['/protocols']) });
    expect(container.firstChild).toBeTruthy();
  });

  it('ProtocolBuilder renders without crashing', async () => {
    const ProtocolBuilder = (await import('../ProtocolBuilder')).default;
    const { container } = render(<ProtocolBuilder />, { wrapper: createPageWrapper(['/protocol-builder']) });
    expect(container.firstChild).toBeTruthy();
  });

  it('Reps renders without crashing', async () => {
    const Reps = (await import('../admin/Reps')).default;
    const { container } = render(<Reps />, { wrapper: createPageWrapper(['/admin/reps']) });
    expect(container.firstChild).toBeTruthy();
  });

  it('PartnerDetail renders without crashing', async () => {
    const PartnerDetail = (await import('../admin/PartnerDetail')).default;
    const { container } = render(<PartnerDetail />, { wrapper: createPageWrapper(['/admin/partners/partner-123']) });
    expect(container.firstChild).toBeTruthy();
  });

  it('Commissions renders without crashing', async () => {
    const Commissions = (await import('../admin/Commissions')).default;
    const { container } = render(<Commissions />, { wrapper: createPageWrapper(['/admin/commissions']) });
    expect(container.firstChild).toBeTruthy();
  });

  it('Finance renders without crashing', async () => {
    const Finance = (await import('../admin/Finance')).default;
    const { container } = render(<Finance />, { wrapper: createPageWrapper(['/admin/finance']) });
    expect(container.firstChild).toBeTruthy();
  });

  it('Automations renders without crashing', async () => {
    const Automations = (await import('../admin/Automations')).default;
    const { container } = render(<Automations />, { wrapper: createPageWrapper(['/admin/automations']) });
    expect(container.firstChild).toBeTruthy();
  });

  it('AdminSupplements renders without crashing', async () => {
    const AdminSupplements = (await import('../admin/AdminSupplements')).default;
    const { container } = render(<AdminSupplements />, { wrapper: createPageWrapper(['/admin/supplements']) });
    expect(container.firstChild).toBeTruthy();
  });

  it('FeatureManagement renders without crashing', async () => {
    const FeatureManagement = (await import('../admin/FeatureManagement')).default;
    const { container } = render(<FeatureManagement />, { wrapper: createPageWrapper(['/admin/features']) });
    expect(container.firstChild).toBeTruthy();
  });

  it('Settings renders without crashing', async () => {
    const Settings = (await import('../Settings')).default;
    const { container } = render(<Settings />, { wrapper: createPageWrapper(['/settings']) });
    expect(container.firstChild).toBeTruthy();
  });

  it('AIAssistant renders without crashing', async () => {
    const AIAssistant = (await import('../AIAssistant')).default;
    const { container } = render(<AIAssistant />, { wrapper: createPageWrapper(['/ai']) });
    expect(container.firstChild).toBeTruthy();
  });

  it('AdminFeedback renders without crashing', async () => {
    const AdminFeedback = (await import('../AdminFeedback')).default;
    const { container } = render(<AdminFeedback />, { wrapper: createPageWrapper(['/feedback']) });
    expect(container.firstChild).toBeTruthy();
  });

  it('AdminRequests renders without crashing', async () => {
    const AdminRequests = (await import('../admin/AdminRequests')).default;
    const { container } = render(<AdminRequests />, { wrapper: createPageWrapper(['/requests']) });
    expect(container.firstChild).toBeTruthy();
  });

  it('AdminResources renders without crashing', async () => {
    const AdminResources = (await import('../AdminResources')).default;
    const { container } = render(<AdminResources />, { wrapper: createPageWrapper(['/admin-resources']) });
    expect(container.firstChild).toBeTruthy();
  });

  it('Customizations renders without crashing', async () => {
    const Customizations = (await import('../Customizations')).default;
    const { container } = render(<Customizations />, { wrapper: createPageWrapper(['/customizations']) });
    expect(container.firstChild).toBeTruthy();
  });

  it('MerchantOnboarding renders without crashing', async () => {
    // MerchantOnboarding returns null when profile.org_id exists (already onboarded)
    // so we clear org_id to test the actual onboarding UI
    setAuthContext({
      profile: { ...mockProfile, org_id: null } as any,
      organization: null as any,
    });
    const MerchantOnboarding = (await import('../merchant/MerchantOnboarding')).default;
    const { container } = render(<MerchantOnboarding />, { wrapper: createPageWrapper(['/merchant-onboarding']) });
    expect(container.firstChild).toBeTruthy();
  });
});
