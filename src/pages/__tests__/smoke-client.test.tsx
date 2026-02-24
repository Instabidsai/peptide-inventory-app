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
  // Client pages expect a client role
  setAuthContext({
    userRole: 'client' as any,
    profile: { ...mockProfile, role: 'client' } as any,
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
  RadarChart: ({ children }: any) => <div>{children}</div>,
  Line: () => null,
  Bar: () => null,
  Pie: () => null,
  Area: () => null,
  Radar: () => null,
  PolarGrid: () => null,
  PolarAngleAxis: () => null,
  PolarRadiusAxis: () => null,
  Cell: () => null,
  XAxis: () => null,
  YAxis: () => null,
  CartesianGrid: () => null,
  Tooltip: () => null,
  Legend: () => null,
  ReferenceLine: () => null,
}));

describe('Client Pages — Smoke Tests', () => {
  it('ClientDashboard renders without crashing', async () => {
    const ClientDashboard = (await import('../client/ClientDashboard')).default;
    const { container } = render(<ClientDashboard />, { wrapper: createPageWrapper(['/dashboard']) });
    expect(container.firstChild).toBeTruthy();
  }, 15000);

  it('ClientRegimen renders without crashing', async () => {
    const ClientRegimen = (await import('../client/ClientRegimen')).default;
    const { container } = render(<ClientRegimen />, { wrapper: createPageWrapper(['/my-regimen']) });
    expect(container.firstChild).toBeTruthy();
  });

  it('ClientMessages renders without crashing', async () => {
    const ClientMessages = (await import('../client/ClientMessages')).default;
    const { container } = render(<ClientMessages />, { wrapper: createPageWrapper(['/messages']) });
    expect(container.firstChild).toBeTruthy();
  });

  it('ClientNotifications renders without crashing', async () => {
    const ClientNotifications = (await import('../client/ClientNotifications')).default;
    const { container } = render(<ClientNotifications />, { wrapper: createPageWrapper(['/notifications']) });
    expect(container.firstChild).toBeTruthy();
  });

  it('ClientResources renders without crashing', async () => {
    const ClientResources = (await import('../client/ClientResources')).default;
    const { container } = render(<ClientResources />, { wrapper: createPageWrapper(['/resources']) });
    expect(container.firstChild).toBeTruthy();
  });

  it('ClientSettings renders without crashing', async () => {
    const ClientSettings = (await import('../client/ClientSettings')).default;
    const { container } = render(<ClientSettings />, { wrapper: createPageWrapper(['/account']) });
    expect(container.firstChild).toBeTruthy();
  });

  it('ClientStore renders without crashing', async () => {
    const ClientStore = (await import('../client/ClientStore')).default;
    const { container } = render(<ClientStore />, { wrapper: createPageWrapper(['/store']) });
    expect(container.firstChild).toBeTruthy();
  });

  it('ClientOrders renders without crashing', async () => {
    const ClientOrders = (await import('../client/ClientOrders')).default;
    const { container } = render(<ClientOrders />, { wrapper: createPageWrapper(['/my-orders']) });
    expect(container.firstChild).toBeTruthy();
  });

  it('ClientMenu renders without crashing', async () => {
    const ClientMenu = (await import('../client/ClientMenu')).default;
    const { container } = render(<ClientMenu />, { wrapper: createPageWrapper(['/menu']) });
    expect(container.firstChild).toBeTruthy();
  });

  it('MacroTracker renders without crashing', async () => {
    const MacroTracker = (await import('../client/MacroTracker')).default;
    const { container } = render(<MacroTracker />, { wrapper: createPageWrapper(['/macro-tracker']) });
    expect(container.firstChild).toBeTruthy();
  });

  it('BodyComposition renders without crashing', async () => {
    const BodyComposition = (await import('../client/BodyComposition')).default;
    const { container } = render(<BodyComposition />, { wrapper: createPageWrapper(['/body-composition']) });
    expect(container.firstChild).toBeTruthy();
  });

  it('CommunityForum renders without crashing', async () => {
    const CommunityForum = (await import('../client/CommunityForum')).default;
    const { container } = render(<CommunityForum />, { wrapper: createPageWrapper(['/community']) });
    expect(container.firstChild).toBeTruthy();
  });

  it('HealthTracking renders without crashing', async () => {
    const HealthTracking = (await import('../client/HealthTracking')).default;
    const { container } = render(<HealthTracking />, { wrapper: createPageWrapper(['/health']) });
    expect(container.firstChild).toBeTruthy();
  });
});
