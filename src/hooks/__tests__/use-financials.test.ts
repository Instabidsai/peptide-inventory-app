import { describe, it, expect, beforeEach, vi } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';
import { createWrapper } from '@/test/mocks/wrapper';
import { supabase, setMockResponse, setRpcResponse, resetMockResponses, mockProfile } from '@/test/mocks/supabase';
import { resetToast } from '@/test/mocks/toast';
import { resetAuthContext, setAuthContext } from '@/test/mocks/auth';
import { useFinancialMetrics } from '../use-financials';

beforeEach(() => {
  vi.clearAllMocks();
  resetMockResponses();
  resetToast();
  resetAuthContext();
});

describe('useFinancialMetrics', () => {
  it('aggregates all financial data into metrics', async () => {
    setRpcResponse('get_inventory_valuation', [{ total_value: 5000 }]);
    // Sales movements
    setMockResponse('movements', [
      { id: 'mv-1', amount_paid: 200 },
      { id: 'mv-2', amount_paid: 300 },
    ]);
    // Expenses
    setMockResponse('expenses', [
      { amount: 100, category: 'inventory' },
      { amount: 50, category: 'shipping' },
    ]);
    // Commissions
    setMockResponse('commissions', [
      { amount: 30, status: 'paid', sale_id: 's1' },
      { amount: 20, status: 'pending', sale_id: 's2' },
    ]);
    // Order aggregates
    setMockResponse('sales_orders', [
      { merchant_fee: 5, profit_amount: 100, cogs_amount: 50 },
    ]);
    // Movement items and bottles for COGS calculation
    setMockResponse('movement_items', []);
    setMockResponse('bottles', []);
    setMockResponse('lots', []);

    const { result } = renderHook(() => useFinancialMetrics(), { wrapper: createWrapper() });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));

    const metrics = result.current.data!;
    expect(metrics.inventoryValue).toBe(5000);
    expect(metrics.salesRevenue).toBe(500); // 200 + 300
    expect(metrics.commissionsPaid).toBe(30);
    expect(metrics.commissionsOwed).toBe(20);
  });

  it('does not fetch without org context', async () => {
    setAuthContext({ profile: { ...mockProfile, org_id: null } as any });

    const { result } = renderHook(() => useFinancialMetrics(), { wrapper: createWrapper() });

    await waitFor(() => expect(result.current.fetchStatus).toBe('idle'));
  });

  it('handles partial failures gracefully with _errors array', async () => {
    // Simulate valuation RPC failing
    setRpcResponse('get_inventory_valuation', null, { message: 'RPC not found' });
    setMockResponse('movements', []);
    setMockResponse('expenses', []);
    setMockResponse('commissions', []);
    setMockResponse('sales_orders', []);
    setMockResponse('movement_items', []);

    const { result } = renderHook(() => useFinancialMetrics(), { wrapper: createWrapper() });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));

    // Should still return metrics with zero values and log the error
    const metrics = result.current.data!;
    expect(metrics.inventoryValue).toBe(0);
    expect(metrics._errors).toContain('inventory_valuation');
  });
});
