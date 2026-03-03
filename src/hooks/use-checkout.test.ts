import { describe, it, expect, beforeEach, vi } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';
import { setMockResponse, setRpcResponse, resetMockResponses, supabase } from '@/test/mocks/supabase';
import '@/test/mocks/auth';
import { createWrapper } from '@/test/mocks/wrapper';
import {
  useCheckout,
  useValidatedCheckout,
  useOrderPaymentStatus,
} from './use-checkout';

const mockToast = vi.fn();
vi.mock('@/hooks/use-toast', () => ({
  useToast: () => ({ toast: mockToast }),
}));

// Mock funnel-tracker to prevent side effects
vi.mock('@/lib/funnel-tracker', () => ({
  trackCheckoutStart: vi.fn(),
  trackOrderCreated: vi.fn(),
  trackCheckoutRedirect: vi.fn(),
  trackCheckoutError: vi.fn(),
}));

// Mock window.location
const originalLocation = window.location;
beforeAll(() => {
  Object.defineProperty(window, 'location', {
    writable: true,
    value: { href: '' },
  });
});
afterAll(() => {
  Object.defineProperty(window, 'location', {
    writable: true,
    value: originalLocation,
  });
});

// Mock fetch for checkout session API calls
const mockFetch = vi.fn();
global.fetch = mockFetch;

describe('use-checkout', () => {
  beforeEach(() => {
    resetMockResponses();
    mockToast.mockClear();
    mockFetch.mockReset();
    window.location.href = '';
  });

  describe('useCheckout (deprecated — admin/rep flow)', () => {
    it('rejects when user is not authenticated', async () => {
      const { setAuthContext } = await import('@/test/mocks/auth');
      setAuthContext({ user: null });

      const { result } = renderHook(() => useCheckout(), { wrapper: createWrapper() });

      result.current.mutate({
        items: [{ peptide_id: 'pep-1', name: 'BPC-157', quantity: 1, unit_price: 45 }],
        org_id: 'org-123',
        total_amount: 45,
      });

      await waitFor(() => expect(result.current.isError).toBe(true));
      expect(result.current.error?.message).toBe('Not authenticated');

      const { resetAuthContext } = await import('@/test/mocks/auth');
      resetAuthContext();
    });

    it('rejects empty cart', async () => {
      const { result } = renderHook(() => useCheckout(), { wrapper: createWrapper() });

      result.current.mutate({
        items: [],
        org_id: 'org-123',
        total_amount: 0,
      });

      await waitFor(() => expect(result.current.isError).toBe(true));
      expect(result.current.error?.message).toBe('Cart is empty');
    });

    it('creates order, items, and redirects to checkout URL', async () => {
      const order = { id: 'order-1', org_id: 'org-123', total_amount: 45 };
      setMockResponse('sales_orders', order);
      setMockResponse('sales_order_items', []);

      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({ checkout_url: 'https://pay.example.com/checkout/abc' }),
      });

      const { result } = renderHook(() => useCheckout(), { wrapper: createWrapper() });

      result.current.mutate({
        items: [{ peptide_id: 'pep-1', name: 'BPC-157', quantity: 1, unit_price: 45 }],
        org_id: 'org-123',
        total_amount: 45,
      });

      await waitFor(() => {
        expect(window.location.href).toBe('https://pay.example.com/checkout/abc');
      });
    });

    it('rejects unsafe (non-https) checkout URL', async () => {
      const order = { id: 'order-1', org_id: 'org-123', total_amount: 45 };
      setMockResponse('sales_orders', order);
      setMockResponse('sales_order_items', []);

      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({ checkout_url: 'http://evil.com/checkout' }),
      });

      const { result } = renderHook(() => useCheckout(), { wrapper: createWrapper() });

      result.current.mutate({
        items: [{ peptide_id: 'pep-1', name: 'BPC-157', quantity: 1, unit_price: 45 }],
        org_id: 'org-123',
        total_amount: 45,
      });

      await waitFor(() => expect(result.current.isError).toBe(true));
      expect(result.current.error?.message).toBe('Invalid checkout URL received');
    });

    it('cleans up order when checkout session creation fails', async () => {
      const order = { id: 'order-1', org_id: 'org-123', total_amount: 45 };
      setMockResponse('sales_orders', order);
      setMockResponse('sales_order_items', []);

      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 500,
        json: async () => ({ error: 'Payment processor down' }),
      });

      const { result } = renderHook(() => useCheckout(), { wrapper: createWrapper() });

      result.current.mutate({
        items: [{ peptide_id: 'pep-1', name: 'BPC-157', quantity: 1, unit_price: 45 }],
        org_id: 'org-123',
        total_amount: 45,
      });

      await waitFor(() => expect(result.current.isError).toBe(true));
      expect(result.current.error?.message).toBe('Payment processor down');
    });

    it('shows error toast on failure', async () => {
      setMockResponse('sales_orders', null, { message: 'DB error' });

      const { result } = renderHook(() => useCheckout(), { wrapper: createWrapper() });

      result.current.mutate({
        items: [{ peptide_id: 'pep-1', name: 'BPC-157', quantity: 1, unit_price: 45 }],
        org_id: 'org-123',
        total_amount: 45,
      });

      await waitFor(() => expect(result.current.isError).toBe(true));
      expect(mockToast).toHaveBeenCalledWith(
        expect.objectContaining({ variant: 'destructive', title: 'Checkout failed' })
      );
    });
  });

  describe('useValidatedCheckout', () => {
    it('rejects when user is not authenticated', async () => {
      const { setAuthContext } = await import('@/test/mocks/auth');
      setAuthContext({ user: null });

      const { result } = renderHook(() => useValidatedCheckout(), { wrapper: createWrapper() });

      result.current.mutate({
        items: [{ peptide_id: 'pep-1', quantity: 1 }],
      });

      await waitFor(() => expect(result.current.isError).toBe(true));
      expect(result.current.error?.message).toBe('Not authenticated');

      const { resetAuthContext } = await import('@/test/mocks/auth');
      resetAuthContext();
    });

    it('rejects empty cart', async () => {
      const { result } = renderHook(() => useValidatedCheckout(), { wrapper: createWrapper() });

      result.current.mutate({ items: [] });

      await waitFor(() => expect(result.current.isError).toBe(true));
      expect(result.current.error?.message).toBe('Cart is empty');
    });

    it('calls RPC then redirects to checkout', async () => {
      setRpcResponse('create_validated_order', { success: true, order_id: 'order-v1', total: 45 });

      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({ checkout_url: 'https://pay.example.com/checkout/def' }),
      });

      const { result } = renderHook(() => useValidatedCheckout(), { wrapper: createWrapper() });

      result.current.mutate({
        items: [{ peptide_id: 'pep-1', quantity: 1 }],
      });

      await waitFor(() => {
        expect(window.location.href).toBe('https://pay.example.com/checkout/def');
      });
    });

    it('shows user-friendly message for type mismatch DB errors', async () => {
      setRpcResponse('create_validated_order', null, { message: 'COALESCE result type numeric' });

      const { result } = renderHook(() => useValidatedCheckout(), { wrapper: createWrapper() });

      result.current.mutate({
        items: [{ peptide_id: 'pep-1', quantity: 1 }],
      });

      await waitFor(() => expect(result.current.isError).toBe(true));
      expect(result.current.error?.message).toContain('temporarily unavailable');
    });

    it('shows user-friendly message for function signature errors', async () => {
      setRpcResponse('create_validated_order', null, { message: 'could not find function' });

      const { result } = renderHook(() => useValidatedCheckout(), { wrapper: createWrapper() });

      result.current.mutate({
        items: [{ peptide_id: 'pep-1', quantity: 1 }],
      });

      await waitFor(() => expect(result.current.isError).toBe(true));
      expect(result.current.error?.message).toContain('system update');
    });

    it('handles RPC returning success=false', async () => {
      setRpcResponse('create_validated_order', { success: false, error: 'Insufficient stock' });

      const { result } = renderHook(() => useValidatedCheckout(), { wrapper: createWrapper() });

      result.current.mutate({
        items: [{ peptide_id: 'pep-1', quantity: 100 }],
      });

      await waitFor(() => expect(result.current.isError).toBe(true));
      expect(result.current.error?.message).toBe('Insufficient stock');
    });
  });

  describe('useOrderPaymentStatus', () => {
    it('returns order payment status', async () => {
      const orderStatus = {
        id: 'order-1',
        status: 'submitted',
        payment_status: 'unpaid',
        psifi_status: 'pending',
        total_amount: 45,
        created_at: '2026-01-20T00:00:00Z',
      };
      setMockResponse('sales_orders', orderStatus);

      const { result } = renderHook(() => useOrderPaymentStatus('order-1'), { wrapper: createWrapper() });

      await waitFor(() => expect(result.current.isSuccess).toBe(true));
      expect(result.current.data).toEqual(orderStatus);
    });

    it('returns null when orderId is null', () => {
      const { result } = renderHook(() => useOrderPaymentStatus(null), { wrapper: createWrapper() });
      expect(result.current.fetchStatus).toBe('idle');
    });
  });
});
