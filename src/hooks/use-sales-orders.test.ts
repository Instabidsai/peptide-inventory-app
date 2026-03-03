import { describe, it, expect, beforeEach, vi } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';
import { setMockResponse, setRpcResponse, resetMockResponses } from '@/test/mocks/supabase';
import '@/test/mocks/auth';
import { createWrapper } from '@/test/mocks/wrapper';
import {
  useSalesOrders,
  useSalesOrder,
  useMySalesOrders,
  useCreateSalesOrder,
  useUpdateSalesOrder,
  useDeleteSalesOrder,
} from './use-sales-orders';

const mockToast = vi.fn();
vi.mock('@/hooks/use-toast', () => ({
  useToast: () => ({ toast: mockToast }),
}));

// Mock logger
vi.mock('@/lib/logger', () => ({
  logger: { debug: vi.fn(), log: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));

describe('use-sales-orders', () => {
  beforeEach(() => {
    resetMockResponses();
    mockToast.mockClear();
  });

  const sampleOrder = {
    id: 'order-1',
    org_id: 'org-123',
    client_id: 'contact-1',
    rep_id: 'profile-123',
    status: 'submitted' as const,
    payment_status: 'unpaid' as const,
    psifi_status: 'none' as const,
    total_amount: 90.00,
    commission_amount: 9.00,
    amount_paid: 0,
    shipping_address: '123 Main St',
    notes: null,
    created_at: '2026-01-20T00:00:00Z',
    updated_at: '2026-01-20T00:00:00Z',
    contacts: { id: 'contact-1', name: 'John Smith' },
    profiles: { id: 'profile-123', full_name: 'Test User' },
    sales_order_items: [
      { id: 'item-1', peptide_id: 'pep-1', quantity: 2, unit_price: 45.00, peptides: { id: 'pep-1', name: 'BPC-157 5mg' } },
    ],
  };

  describe('useSalesOrders', () => {
    it('returns orders list on success', async () => {
      setMockResponse('sales_orders', [sampleOrder]);

      const { result } = renderHook(() => useSalesOrders(), { wrapper: createWrapper() });

      await waitFor(() => expect(result.current.isSuccess).toBe(true));
      expect(result.current.data).toEqual([sampleOrder]);
    });

    it('returns empty array when no orders', async () => {
      setMockResponse('sales_orders', []);

      const { result } = renderHook(() => useSalesOrders(), { wrapper: createWrapper() });

      await waitFor(() => expect(result.current.isSuccess).toBe(true));
      expect(result.current.data).toEqual([]);
    });

    it('handles database error', async () => {
      setMockResponse('sales_orders', null, { message: 'Permission denied' });

      const { result } = renderHook(() => useSalesOrders(), { wrapper: createWrapper() });

      await waitFor(() => expect(result.current.isError).toBe(true));
      expect(result.current.error?.message).toBe('Permission denied');
    });
  });

  describe('useSalesOrder', () => {
    it('returns single order by ID', async () => {
      setMockResponse('sales_orders', sampleOrder);

      const { result } = renderHook(() => useSalesOrder('order-1'), { wrapper: createWrapper() });

      await waitFor(() => expect(result.current.isSuccess).toBe(true));
      expect(result.current.data).toEqual(sampleOrder);
    });

    it('returns null when order not found', async () => {
      setMockResponse('sales_orders', null);

      const { result } = renderHook(() => useSalesOrder('nonexistent'), { wrapper: createWrapper() });

      await waitFor(() => expect(result.current.isSuccess).toBe(true));
      expect(result.current.data).toBeNull();
    });

    it('is disabled when id is empty', () => {
      const { result } = renderHook(() => useSalesOrder(''), { wrapper: createWrapper() });
      expect(result.current.fetchStatus).toBe('idle');
    });
  });

  describe('useMySalesOrders', () => {
    it('returns orders for current user', async () => {
      setMockResponse('sales_orders', [sampleOrder]);

      const { result } = renderHook(() => useMySalesOrders(), { wrapper: createWrapper() });

      await waitFor(() => expect(result.current.isSuccess).toBe(true));
      expect(result.current.data).toBeDefined();
    });
  });

  describe('useCreateSalesOrder', () => {
    it('creates order and shows success toast', async () => {
      setMockResponse('sales_orders', sampleOrder);
      setMockResponse('sales_order_items', []);

      const { result } = renderHook(() => useCreateSalesOrder(), { wrapper: createWrapper() });

      result.current.mutate({
        client_id: 'contact-1',
        items: [{ peptide_id: 'pep-1', quantity: 2, unit_price: 45 }],
      });

      await waitFor(() => expect(result.current.isSuccess).toBe(true));
      expect(mockToast).toHaveBeenCalledWith(
        expect.objectContaining({ title: expect.stringContaining('created') })
      );
    });

    it('rejects when no org_id', async () => {
      const { setAuthContext } = await import('@/test/mocks/auth');
      setAuthContext({ profile: { id: 'profile-123', user_id: 'auth-user-123', org_id: null, role: 'admin' } });

      const { result } = renderHook(() => useCreateSalesOrder(), { wrapper: createWrapper() });

      result.current.mutate({
        client_id: 'contact-1',
        items: [{ peptide_id: 'pep-1', quantity: 2, unit_price: 45 }],
      });

      await waitFor(() => expect(result.current.isError).toBe(true));
      expect(result.current.error?.message).toBe('No organization found');

      const { resetAuthContext } = await import('@/test/mocks/auth');
      resetAuthContext();
    });

    it('shows error toast on failure', async () => {
      setMockResponse('sales_orders', null, { message: 'Insert failed' });

      const { result } = renderHook(() => useCreateSalesOrder(), { wrapper: createWrapper() });

      result.current.mutate({
        client_id: 'contact-1',
        items: [{ peptide_id: 'pep-1', quantity: 2, unit_price: 45 }],
      });

      await waitFor(() => expect(result.current.isError).toBe(true));
      expect(mockToast).toHaveBeenCalledWith(
        expect.objectContaining({ variant: 'destructive' })
      );
    });
  });

  describe('useUpdateSalesOrder', () => {
    it('updates order status', async () => {
      setMockResponse('sales_orders', { ...sampleOrder, status: 'fulfilled' });

      const { result } = renderHook(() => useUpdateSalesOrder(), { wrapper: createWrapper() });

      result.current.mutate({ id: 'order-1', status: 'fulfilled' });

      await waitFor(() => expect(result.current.isSuccess).toBe(true));
      expect(mockToast).toHaveBeenCalledWith(
        expect.objectContaining({ title: expect.stringContaining('updated') })
      );
    });

    it('shows error toast on update failure', async () => {
      setMockResponse('sales_orders', null, { message: 'Update failed' });

      const { result } = renderHook(() => useUpdateSalesOrder(), { wrapper: createWrapper() });

      result.current.mutate({ id: 'order-1', status: 'fulfilled' });

      await waitFor(() => expect(result.current.isError).toBe(true));
      expect(mockToast).toHaveBeenCalledWith(
        expect.objectContaining({ variant: 'destructive' })
      );
    });
  });

  describe('useDeleteSalesOrder', () => {
    it('cascade-deletes order and shows success toast', async () => {
      // Commission cleanup
      setMockResponse('commissions', []);
      // Items cleanup
      setMockResponse('sales_order_items', []);
      // Order delete
      setMockResponse('sales_orders', null);

      const { result } = renderHook(() => useDeleteSalesOrder(), { wrapper: createWrapper() });

      result.current.mutate('order-1');

      await waitFor(() => expect(result.current.isSuccess).toBe(true));
      expect(mockToast).toHaveBeenCalledWith(
        expect.objectContaining({ title: expect.stringContaining('deleted') })
      );
    });

    it('shows error toast on delete failure', async () => {
      // The delete function only checks error on the final sales_orders delete (line 933)
      setMockResponse('sales_orders', null, { message: 'FK constraint' });

      const { result } = renderHook(() => useDeleteSalesOrder(), { wrapper: createWrapper() });

      result.current.mutate('order-1');

      await waitFor(() => expect(result.current.isError).toBe(true));
      expect(mockToast).toHaveBeenCalledWith(
        expect.objectContaining({ variant: 'destructive' })
      );
    });
  });
});
