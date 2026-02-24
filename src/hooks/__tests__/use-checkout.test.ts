import { describe, it, expect, beforeEach, vi } from 'vitest';
import { renderHook, waitFor, act } from '@testing-library/react';
import { createWrapper } from '@/test/mocks/wrapper';
import { supabase, setMockResponse, setRpcResponse, resetMockResponses } from '@/test/mocks/supabase';
import { mockToast, resetToast } from '@/test/mocks/toast';
import { resetAuthContext, setAuthContext } from '@/test/mocks/auth';
import {
  useCheckout,
  useValidatedCheckout,
  useOrderPaymentStatus,
} from '../use-checkout';

// Mock fetch for checkout session creation
const mockFetch = vi.fn();
global.fetch = mockFetch;

// Mock window.location
const originalLocation = window.location;
beforeAll(() => {
  Object.defineProperty(window, 'location', {
    writable: true,
    value: { ...originalLocation, href: '' },
  });
});
afterAll(() => {
  Object.defineProperty(window, 'location', { writable: true, value: originalLocation });
});

beforeEach(() => {
  vi.clearAllMocks();
  resetMockResponses();
  resetToast();
  resetAuthContext();
  mockFetch.mockReset();
});

describe('useCheckout', () => {
  it('throws when user is not authenticated', async () => {
    setAuthContext({ user: null as any });

    const { result } = renderHook(() => useCheckout(), { wrapper: createWrapper() });

    await act(async () => {
      result.current.mutate({
        items: [{ peptide_id: 'p1', name: 'BPC-157', quantity: 1, unit_price: 100 }],
        org_id: 'org-123',
        total_amount: 100,
      });
    });

    await waitFor(() => expect(result.current.isError).toBe(true));
    expect(result.current.error?.message).toContain('Not authenticated');
  });

  it('throws when cart is empty', async () => {
    const { result } = renderHook(() => useCheckout(), { wrapper: createWrapper() });

    await act(async () => {
      result.current.mutate({
        items: [],
        org_id: 'org-123',
        total_amount: 0,
      });
    });

    await waitFor(() => expect(result.current.isError).toBe(true));
    expect(result.current.error?.message).toContain('Cart is empty');
  });

  it('shows error toast on failure', async () => {
    setMockResponse('sales_orders', null, { message: 'Insert failed' });

    const { result } = renderHook(() => useCheckout(), { wrapper: createWrapper() });

    await act(async () => {
      result.current.mutate({
        items: [{ peptide_id: 'p1', name: 'BPC-157', quantity: 1, unit_price: 100 }],
        org_id: 'org-123',
        total_amount: 100,
      });
    });

    await waitFor(() => expect(result.current.isError).toBe(true));
    expect(mockToast).toHaveBeenCalledWith(
      expect.objectContaining({ variant: 'destructive', title: 'Checkout failed' })
    );
  });
});

describe('useValidatedCheckout', () => {
  it('throws when user is not authenticated', async () => {
    setAuthContext({ user: null as any });

    const { result } = renderHook(() => useValidatedCheckout(), { wrapper: createWrapper() });

    await act(async () => {
      result.current.mutate({
        items: [{ peptide_id: 'p1', quantity: 1 }],
      });
    });

    await waitFor(() => expect(result.current.isError).toBe(true));
    expect(result.current.error?.message).toContain('Not authenticated');
  });

  it('throws when cart is empty', async () => {
    const { result } = renderHook(() => useValidatedCheckout(), { wrapper: createWrapper() });

    await act(async () => {
      result.current.mutate({ items: [] });
    });

    await waitFor(() => expect(result.current.isError).toBe(true));
    expect(result.current.error?.message).toContain('Cart is empty');
  });

  it('throws when RPC returns failure', async () => {
    setRpcResponse('create_validated_order', { success: false, error: 'Out of stock' });

    const { result } = renderHook(() => useValidatedCheckout(), { wrapper: createWrapper() });

    await act(async () => {
      result.current.mutate({
        items: [{ peptide_id: 'p1', quantity: 999 }],
      });
    });

    await waitFor(() => expect(result.current.isError).toBe(true));
    expect(result.current.error?.message).toContain('Out of stock');
  });

  it('shows error toast on any failure', async () => {
    setRpcResponse('create_validated_order', null, { message: 'DB error' });

    const { result } = renderHook(() => useValidatedCheckout(), { wrapper: createWrapper() });

    await act(async () => {
      result.current.mutate({
        items: [{ peptide_id: 'p1', quantity: 1 }],
      });
    });

    await waitFor(() => expect(result.current.isError).toBe(true));
    expect(mockToast).toHaveBeenCalledWith(
      expect.objectContaining({ variant: 'destructive', title: 'Checkout failed' })
    );
  });
});

describe('useOrderPaymentStatus', () => {
  it('fetches order payment status by ID', async () => {
    setMockResponse('sales_orders', {
      id: 'order-1',
      status: 'submitted',
      payment_status: 'unpaid',
      psifi_status: 'pending',
      total_amount: 100,
    });

    const { result } = renderHook(() => useOrderPaymentStatus('order-1'), { wrapper: createWrapper() });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(result.current.data?.payment_status).toBe('unpaid');
  });

  it('does not fetch with null order ID', async () => {
    const { result } = renderHook(() => useOrderPaymentStatus(null), { wrapper: createWrapper() });

    await waitFor(() => expect(result.current.fetchStatus).toBe('idle'));
  });
});
