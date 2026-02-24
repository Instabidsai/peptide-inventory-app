import { describe, it, expect, beforeEach, vi } from 'vitest';
import { renderHook, waitFor, act } from '@testing-library/react';
import { createWrapper } from '@/test/mocks/wrapper';
import { supabase, setMockResponse, resetMockResponses, mockProfile } from '@/test/mocks/supabase';
import { mockToast, resetToast } from '@/test/mocks/toast';
import { resetAuthContext, setAuthContext } from '@/test/mocks/auth';
import {
  useLots,
  useLot,
  useCreateLot,
  useUpdateLot,
  useDeleteLot,
} from '../use-lots';

beforeEach(() => {
  vi.clearAllMocks();
  resetMockResponses();
  resetToast();
  resetAuthContext();
});

const mockLots = [
  { id: 'lot-1', org_id: 'org-123', peptide_id: 'p1', lot_number: 'LOT001', quantity_received: 10, cost_per_unit: 50, payment_status: 'paid' },
  { id: 'lot-2', org_id: 'org-123', peptide_id: 'p2', lot_number: 'LOT002', quantity_received: 5, cost_per_unit: 75, payment_status: 'unpaid' },
];

describe('useLots', () => {
  it('fetches all lots for the org', async () => {
    setMockResponse('lots', mockLots);

    const { result } = renderHook(() => useLots(), { wrapper: createWrapper() });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(result.current.data).toEqual(mockLots);
    expect(supabase.from).toHaveBeenCalledWith('lots');
  });

  it('does not fetch when user is not authenticated', async () => {
    setAuthContext({ user: null as any, profile: null as any });

    const { result } = renderHook(() => useLots(), { wrapper: createWrapper() });

    await waitFor(() => expect(result.current.fetchStatus).toBe('idle'));
  });
});

describe('useLot', () => {
  it('fetches a single lot by ID', async () => {
    setMockResponse('lots', mockLots[0]);

    const { result } = renderHook(() => useLot('lot-1'), { wrapper: createWrapper() });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(result.current.data).toEqual(mockLots[0]);
  });

  it('does not fetch with empty ID', async () => {
    const { result } = renderHook(() => useLot(''), { wrapper: createWrapper() });

    await waitFor(() => expect(result.current.fetchStatus).toBe('idle'));
  });
});

describe('useCreateLot', () => {
  it('creates a lot and shows success toast', async () => {
    const newLot = { id: 'lot-3', lot_number: 'LOT003', quantity_received: 20 };
    setMockResponse('profiles', mockProfile);
    setMockResponse('lots', newLot);

    const { result } = renderHook(() => useCreateLot(), { wrapper: createWrapper() });

    await act(async () => {
      result.current.mutate({
        peptide_id: 'p1',
        lot_number: 'LOT003',
        quantity_received: 20,
        cost_per_unit: 40,
      });
    });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(mockToast).toHaveBeenCalledWith(
      expect.objectContaining({ title: 'Lot received successfully' })
    );
  });

  it('shows error toast on failure', async () => {
    setMockResponse('profiles', mockProfile);
    setMockResponse('lots', null, { message: 'Insert failed' });

    const { result } = renderHook(() => useCreateLot(), { wrapper: createWrapper() });

    await act(async () => {
      result.current.mutate({
        peptide_id: 'p1',
        lot_number: 'LOT_DUP',
        quantity_received: 5,
        cost_per_unit: 30,
      });
    });

    await waitFor(() => expect(result.current.isError).toBe(true));
    expect(mockToast).toHaveBeenCalledWith(
      expect.objectContaining({ variant: 'destructive', title: 'Failed to create lot' })
    );
  });
});

describe('useUpdateLot', () => {
  it('updates a lot and toasts success', async () => {
    setMockResponse('lots', { id: 'lot-1', lot_number: 'LOT001-updated' });

    const { result } = renderHook(() => useUpdateLot(), { wrapper: createWrapper() });

    await act(async () => {
      result.current.mutate({ id: 'lot-1', lot_number: 'LOT001-updated' });
    });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(mockToast).toHaveBeenCalledWith(expect.objectContaining({ title: 'Lot updated successfully' }));
  });
});

describe('useDeleteLot', () => {
  it('deletes bottles first, then lot, then toasts', async () => {
    setMockResponse('bottles', []);
    setMockResponse('lots', []);

    const { result } = renderHook(() => useDeleteLot(), { wrapper: createWrapper() });

    await act(async () => {
      result.current.mutate('lot-1');
    });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));

    // Should call from('bottles') and from('lots') for deletion
    const fromCalls = (supabase.from as any).mock.calls.map((c: any) => c[0]);
    expect(fromCalls).toContain('bottles');
    expect(fromCalls).toContain('lots');
    expect(mockToast).toHaveBeenCalledWith(expect.objectContaining({ title: 'Lot deleted successfully' }));
  });

  it('shows error if bottle deletion fails', async () => {
    setMockResponse('bottles', null, { message: 'FK constraint' });

    const { result } = renderHook(() => useDeleteLot(), { wrapper: createWrapper() });

    await act(async () => {
      result.current.mutate('lot-1');
    });

    await waitFor(() => expect(result.current.isError).toBe(true));
    expect(mockToast).toHaveBeenCalledWith(
      expect.objectContaining({ variant: 'destructive', title: 'Failed to delete lot' })
    );
  });
});
