import { describe, it, expect, beforeEach, vi } from 'vitest';
import { renderHook, waitFor, act } from '@testing-library/react';
import { createWrapper } from '@/test/mocks/wrapper';
import { supabase, setMockResponse, setRpcResponse, resetMockResponses, mockProfile } from '@/test/mocks/supabase';
import { mockToast, resetToast } from '@/test/mocks/toast';
import { resetAuthContext, setAuthContext } from '@/test/mocks/auth';
import {
  useBottles,
  useBottle,
  useBottleByUid,
  useUpdateBottle,
  useUpdateBottles,
  useBottleStats,
  useDeleteBottle,
} from '../use-bottles';

beforeEach(() => {
  vi.clearAllMocks();
  resetMockResponses();
  resetToast();
  resetAuthContext();
});

const mockBottles = [
  { id: 'b1', org_id: 'org-123', lot_id: 'lot-1', uid: 'BTL-001', status: 'in_stock' },
  { id: 'b2', org_id: 'org-123', lot_id: 'lot-2', uid: 'BTL-002', status: 'sold' },
];

describe('useBottles', () => {
  it('fetches all bottles for the org', async () => {
    setMockResponse('bottles', mockBottles);

    const { result } = renderHook(() => useBottles(), { wrapper: createWrapper() });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(result.current.data).toEqual(mockBottles);
    expect(supabase.from).toHaveBeenCalledWith('bottles');
  });

  it('does not fetch without auth', async () => {
    setAuthContext({ user: null as any, profile: null as any });

    const { result } = renderHook(() => useBottles(), { wrapper: createWrapper() });

    await waitFor(() => expect(result.current.fetchStatus).toBe('idle'));
  });

  it('passes filters through to query', async () => {
    setMockResponse('bottles', [mockBottles[0]]);

    const { result } = renderHook(() => useBottles({ status: 'in_stock' }), { wrapper: createWrapper() });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(supabase.from).toHaveBeenCalledWith('bottles');
  });
});

describe('useBottle', () => {
  it('fetches a single bottle by ID', async () => {
    setMockResponse('bottles', mockBottles[0]);

    const { result } = renderHook(() => useBottle('b1'), { wrapper: createWrapper() });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(result.current.data).toEqual(mockBottles[0]);
  });

  it('does not fetch with empty ID', async () => {
    const { result } = renderHook(() => useBottle(''), { wrapper: createWrapper() });

    await waitFor(() => expect(result.current.fetchStatus).toBe('idle'));
  });
});

describe('useBottleByUid', () => {
  it('fetches a bottle by its UID', async () => {
    setMockResponse('bottles', mockBottles[0]);

    const { result } = renderHook(() => useBottleByUid('BTL-001'), { wrapper: createWrapper() });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
  });

  it('does not fetch with short UID', async () => {
    const { result } = renderHook(() => useBottleByUid('AB'), { wrapper: createWrapper() });

    await waitFor(() => expect(result.current.fetchStatus).toBe('idle'));
  });
});

describe('useUpdateBottle', () => {
  it('updates a bottle and shows success toast', async () => {
    setMockResponse('bottles', { id: 'b1', status: 'sold' });

    const { result } = renderHook(() => useUpdateBottle(), { wrapper: createWrapper() });

    await act(async () => {
      result.current.mutate({ id: 'b1', status: 'sold' });
    });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(mockToast).toHaveBeenCalledWith(expect.objectContaining({ title: 'Bottle updated successfully' }));
  });

  it('shows error when no org context', async () => {
    setAuthContext({ profile: { ...mockProfile, org_id: null } as any });

    const { result } = renderHook(() => useUpdateBottle(), { wrapper: createWrapper() });

    await act(async () => {
      result.current.mutate({ id: 'b1', status: 'sold' });
    });

    await waitFor(() => expect(result.current.isError).toBe(true));
    expect(result.current.error?.message).toContain('No organization found');
  });
});

describe('useUpdateBottles', () => {
  it('bulk updates bottles and toasts count', async () => {
    setMockResponse('bottles', [{ id: 'b1' }, { id: 'b2' }]);

    const { result } = renderHook(() => useUpdateBottles(), { wrapper: createWrapper() });

    await act(async () => {
      result.current.mutate({ ids: ['b1', 'b2'], status: 'expired' });
    });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(mockToast).toHaveBeenCalledWith(expect.objectContaining({ title: '2 bottles updated successfully' }));
  });

  it('shows error on bulk update failure', async () => {
    setMockResponse('bottles', null, { message: 'Bulk update failed' });

    const { result } = renderHook(() => useUpdateBottles(), { wrapper: createWrapper() });

    await act(async () => {
      result.current.mutate({ ids: ['b1'], status: 'lost' });
    });

    await waitFor(() => expect(result.current.isError).toBe(true));
    expect(mockToast).toHaveBeenCalledWith(
      expect.objectContaining({ variant: 'destructive', title: 'Failed to update bottles' })
    );
  });
});

describe('useBottleStats', () => {
  it('calls get_bottle_stats RPC and aggregates results', async () => {
    setRpcResponse('get_bottle_stats', [
      { status: 'in_stock', count: 10 },
      { status: 'sold', count: 5 },
    ]);

    const { result } = renderHook(() => useBottleStats(), { wrapper: createWrapper() });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(supabase.rpc).toHaveBeenCalledWith('get_bottle_stats', { p_org_id: 'org-123' });
    expect(result.current.data?.total).toBe(15);
    expect(result.current.data?.in_stock).toBe(10);
    expect(result.current.data?.sold).toBe(5);
  });

  it('does not fetch without auth', async () => {
    setAuthContext({ user: null as any, profile: null as any });

    const { result } = renderHook(() => useBottleStats(), { wrapper: createWrapper() });

    await waitFor(() => expect(result.current.fetchStatus).toBe('idle'));
  });
});

describe('useDeleteBottle', () => {
  it('deletes a bottle and toasts success', async () => {
    setMockResponse('bottles', []);

    const { result } = renderHook(() => useDeleteBottle(), { wrapper: createWrapper() });

    await act(async () => {
      result.current.mutate('b1');
    });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(mockToast).toHaveBeenCalledWith(expect.objectContaining({ title: 'Bottle deleted successfully' }));
  });

  it('shows error on delete failure', async () => {
    setMockResponse('bottles', null, { message: 'FK constraint' });

    const { result } = renderHook(() => useDeleteBottle(), { wrapper: createWrapper() });

    await act(async () => {
      result.current.mutate('b1');
    });

    await waitFor(() => expect(result.current.isError).toBe(true));
    expect(mockToast).toHaveBeenCalledWith(
      expect.objectContaining({ variant: 'destructive', title: 'Failed to delete bottle' })
    );
  });

  it('throws when no org context', async () => {
    setAuthContext({ profile: { ...mockProfile, org_id: null } as any });

    const { result } = renderHook(() => useDeleteBottle(), { wrapper: createWrapper() });

    await act(async () => {
      result.current.mutate('b1');
    });

    await waitFor(() => expect(result.current.isError).toBe(true));
    expect(result.current.error?.message).toContain('No organization found');
  });
});
