import { describe, it, expect, beforeEach, vi } from 'vitest';
import { renderHook, waitFor, act } from '@testing-library/react';
import { createWrapper } from '@/test/mocks/wrapper';
import { supabase, setMockResponse, setRpcResponse, resetMockResponses, mockProfile } from '@/test/mocks/supabase';
import { mockToast, resetToast } from '@/test/mocks/toast';
import { resetAuthContext } from '@/test/mocks/auth';
import {
  useSalesOrders,
  useCreateSalesOrder,
  useUpdateSalesOrder,
  useDeleteSalesOrder,
  usePayWithCredit,
  useCreateValidatedOrder,
} from '../use-sales-orders';

// Mock the non-critical helper modules
vi.mock('@/lib/order-profit', () => ({
  recalculateOrderProfit: vi.fn().mockResolvedValue(undefined),
}));
vi.mock('@/lib/auto-protocol', () => ({
  autoGenerateProtocol: vi.fn().mockResolvedValue({ protocolItemMap: new Map() }),
}));
vi.mock('@/lib/supply-calculations', () => ({
  parseVialSize: vi.fn().mockReturnValue(5),
}));

beforeEach(() => {
  vi.clearAllMocks();
  resetMockResponses();
  resetToast();
  resetAuthContext();
});

const mockOrders = [
  {
    id: 'order-1',
    org_id: 'org-123',
    client_id: 'c1',
    rep_id: 'profile-123',
    status: 'draft',
    total_amount: 200,
    commission_amount: 20,
    payment_status: 'unpaid',
    amount_paid: 0,
    created_at: '2025-01-01T00:00:00Z',
  },
];

describe('useSalesOrders', () => {
  it('fetches all orders for the org', async () => {
    setMockResponse('sales_orders', mockOrders);

    const { result } = renderHook(() => useSalesOrders(), { wrapper: createWrapper() });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(result.current.data).toEqual(mockOrders);
    expect(supabase.from).toHaveBeenCalledWith('sales_orders');
  });

  it('filters by status when provided', async () => {
    setMockResponse('sales_orders', []);

    const { result } = renderHook(() => useSalesOrders('fulfilled'), { wrapper: createWrapper() });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(supabase.from).toHaveBeenCalledWith('sales_orders');
  });
});

describe('useCreateSalesOrder', () => {
  it('creates order with items and toasts success', async () => {
    const createdOrder = { id: 'order-new', org_id: 'org-123', total_amount: 100 };
    setMockResponse('profiles', mockProfile);
    setMockResponse('contacts', { assigned_rep_id: null });
    setMockResponse('sales_orders', createdOrder);
    setMockResponse('sales_order_items', []);

    const { result } = renderHook(() => useCreateSalesOrder(), { wrapper: createWrapper() });

    await act(async () => {
      result.current.mutate({
        client_id: 'c1',
        items: [{ peptide_id: 'p1', quantity: 2, unit_price: 50 }],
      });
    });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(mockToast).toHaveBeenCalledWith(expect.objectContaining({ title: 'Order created' }));
  });

  it('shows error toast on order creation failure', async () => {
    setMockResponse('profiles', mockProfile);
    setMockResponse('contacts', { assigned_rep_id: null });
    setMockResponse('sales_orders', null, { message: 'Constraint violation' });

    const { result } = renderHook(() => useCreateSalesOrder(), { wrapper: createWrapper() });

    await act(async () => {
      result.current.mutate({
        client_id: 'c1',
        items: [{ peptide_id: 'p1', quantity: 1, unit_price: 100 }],
      });
    });

    await waitFor(() => expect(result.current.isError).toBe(true));
    expect(mockToast).toHaveBeenCalledWith(
      expect.objectContaining({ variant: 'destructive', title: 'Failed to create order' })
    );
  });

  it('processes commission when amount > 0', async () => {
    const createdOrder = { id: 'order-comm', org_id: 'org-123', total_amount: 200 };
    setMockResponse('profiles', { ...mockProfile, commission_rate: 0.15 });
    setMockResponse('contacts', { assigned_rep_id: null });
    setMockResponse('sales_orders', createdOrder);
    setMockResponse('sales_order_items', []);
    setRpcResponse('process_sale_commission', null);

    const { result } = renderHook(() => useCreateSalesOrder(), { wrapper: createWrapper() });

    await act(async () => {
      result.current.mutate({
        client_id: 'c1',
        items: [{ peptide_id: 'p1', quantity: 2, unit_price: 100 }],
      });
    });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(supabase.rpc).toHaveBeenCalledWith('process_sale_commission', { p_sale_id: 'order-comm' });
  });
});

describe('useCreateValidatedOrder', () => {
  it('calls create_validated_order RPC with items', async () => {
    setRpcResponse('create_validated_order', { success: true, order_id: 'v-order-1', total_amount: 150 });

    const { result } = renderHook(() => useCreateValidatedOrder(), { wrapper: createWrapper() });

    await act(async () => {
      result.current.mutate({
        items: [{ peptide_id: 'p1', quantity: 3 }],
        shipping_address: '123 Main St',
      });
    });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(supabase.rpc).toHaveBeenCalledWith('create_validated_order', expect.objectContaining({
      p_items: [{ peptide_id: 'p1', quantity: 3 }],
      p_shipping_address: '123 Main St',
    }));
    expect(result.current.data).toEqual({ id: 'v-order-1', total_amount: 150 });
  });

  it('throws when RPC returns failure', async () => {
    setRpcResponse('create_validated_order', { success: false, error: 'Insufficient stock' });

    const { result } = renderHook(() => useCreateValidatedOrder(), { wrapper: createWrapper() });

    await act(async () => {
      result.current.mutate({ items: [{ peptide_id: 'p1', quantity: 999 }] });
    });

    await waitFor(() => expect(result.current.isError).toBe(true));
    expect(result.current.error?.message).toContain('Insufficient stock');
  });
});

describe('useUpdateSalesOrder', () => {
  it('updates order and toasts success', async () => {
    setMockResponse('sales_orders', []);

    const { result } = renderHook(() => useUpdateSalesOrder(), { wrapper: createWrapper() });

    await act(async () => {
      result.current.mutate({ id: 'order-1', status: 'fulfilled' as const });
    });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(mockToast).toHaveBeenCalledWith(expect.objectContaining({ title: 'Order updated' }));
  });

  it('triggers commission processing when status changes to fulfilled', async () => {
    setMockResponse('sales_orders', { commission_amount: 30 });
    setRpcResponse('process_sale_commission', null);

    const { result } = renderHook(() => useUpdateSalesOrder(), { wrapper: createWrapper() });

    await act(async () => {
      result.current.mutate({ id: 'order-1', status: 'fulfilled' as const });
    });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(supabase.rpc).toHaveBeenCalledWith('process_sale_commission', { p_sale_id: 'order-1' });
  });
});

describe('useDeleteSalesOrder', () => {
  it('deletes order and toasts success', async () => {
    setMockResponse('sales_orders', []);

    const { result } = renderHook(() => useDeleteSalesOrder(), { wrapper: createWrapper() });

    await act(async () => {
      result.current.mutate('order-1');
    });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(mockToast).toHaveBeenCalledWith(expect.objectContaining({ title: 'Order deleted' }));
  });

  it('shows error when deletion fails', async () => {
    setMockResponse('sales_orders', null, { message: 'FK constraint' });

    const { result } = renderHook(() => useDeleteSalesOrder(), { wrapper: createWrapper() });

    await act(async () => {
      result.current.mutate('order-1');
    });

    await waitFor(() => expect(result.current.isError).toBe(true));
    expect(mockToast).toHaveBeenCalledWith(
      expect.objectContaining({ variant: 'destructive', title: 'Failed to delete order' })
    );
  });
});

describe('usePayWithCredit', () => {
  it('calls pay_order_with_credit RPC with profile ID', async () => {
    setMockResponse('profiles', { id: 'profile-123' });
    setRpcResponse('pay_order_with_credit', null);

    const { result } = renderHook(() => usePayWithCredit(), { wrapper: createWrapper() });

    await act(async () => {
      result.current.mutate({ orderId: 'order-1' });
    });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(supabase.rpc).toHaveBeenCalledWith('pay_order_with_credit', {
      p_order_id: 'order-1',
      p_user_id: 'profile-123',
    });
    expect(mockToast).toHaveBeenCalledWith(expect.objectContaining({ title: 'Payment Successful' }));
  });

  it('shows error when RPC fails', async () => {
    setMockResponse('profiles', { id: 'profile-123' });
    setRpcResponse('pay_order_with_credit', null, { message: 'Insufficient credit' });

    const { result } = renderHook(() => usePayWithCredit(), { wrapper: createWrapper() });

    await act(async () => {
      result.current.mutate({ orderId: 'order-1' });
    });

    await waitFor(() => expect(result.current.isError).toBe(true));
    expect(mockToast).toHaveBeenCalledWith(
      expect.objectContaining({ variant: 'destructive', title: 'Payment Failed' })
    );
  });
});
