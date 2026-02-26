import { describe, it, expect, beforeEach, vi } from 'vitest';
import { renderHook, waitFor, act } from '@testing-library/react';
import { createWrapper } from '@/test/mocks/wrapper';
import { supabase, setMockResponse, setRpcResponse, resetMockResponses, mockProfile } from '@/test/mocks/supabase';
import { mockToast, resetToast } from '@/test/mocks/toast';
import { resetAuthContext, setAuthContext } from '@/test/mocks/auth';
import {
  useMovements,
  useMovement,
  useMovementItems,
  useCreateMovement,
  useDeleteMovement,
} from '../use-movements';

// Mock non-critical helper modules
vi.mock('@/lib/supply-calculations', () => ({
  parseVialSize: vi.fn().mockReturnValue(5),
}));
vi.mock('@/lib/auto-protocol', () => ({
  autoGenerateProtocol: vi.fn().mockResolvedValue({ protocolItemMap: new Map() }),
}));

beforeEach(() => {
  vi.clearAllMocks();
  resetMockResponses();
  resetToast();
  resetAuthContext();
});

describe('useMovements', () => {
  it('fetches movements for the org', async () => {
    const movements = [
      { id: 'mv-1', org_id: 'org-123', type: 'sale', movement_date: '2025-01-01' },
    ];
    setMockResponse('movements', movements);
    setMockResponse('movement_items', []);

    const { result } = renderHook(() => useMovements(), { wrapper: createWrapper() });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(supabase.from).toHaveBeenCalledWith('movements');
  });

  it('does not fetch without org context', async () => {
    setAuthContext({ profile: { ...mockProfile, org_id: null } as any });

    const { result } = renderHook(() => useMovements(), { wrapper: createWrapper() });

    await waitFor(() => expect(result.current.fetchStatus).toBe('idle'));
  });
});

describe('useMovement', () => {
  it('fetches a single movement by ID', async () => {
    const movement = { id: 'mv-1', type: 'sale', org_id: 'org-123' };
    setMockResponse('movements', movement);
    setMockResponse('movement_items', []);

    const { result } = renderHook(() => useMovement('mv-1'), { wrapper: createWrapper() });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
  });

  it('does not fetch with empty ID', async () => {
    const { result } = renderHook(() => useMovement(''), { wrapper: createWrapper() });

    await waitFor(() => expect(result.current.fetchStatus).toBe('idle'));
  });
});

describe('useMovementItems', () => {
  it('fetches movement items and enriches with bottle data', async () => {
    setMockResponse('movement_items', [
      { id: 'mi-1', movement_id: 'mv-1', bottle_id: 'b1' },
    ]);
    setMockResponse('bottles', [
      { id: 'b1', uid: 'BTL-001', lots: { id: 'lot-1', lot_number: 'LOT001', cost_per_unit: 50 } },
    ]);

    const { result } = renderHook(() => useMovementItems('mv-1'), { wrapper: createWrapper() });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(supabase.from).toHaveBeenCalledWith('movement_items');
  });

  it('does not fetch with empty movement ID', async () => {
    const { result } = renderHook(() => useMovementItems(''), { wrapper: createWrapper() });

    await waitFor(() => expect(result.current.fetchStatus).toBe('idle'));
  });
});

describe('useCreateMovement', () => {
  it('creates movement with items and toasts success', async () => {
    const createdMovement = { id: 'mv-new', type: 'sale', org_id: 'org-123' };
    setMockResponse('profiles', { id: 'profile-123', org_id: 'org-123' });
    setMockResponse('bottles', [{ id: 'b1', uid: 'BTL-001', lots: null }]);
    setMockResponse('movements', createdMovement);
    setMockResponse('movement_items', []);

    const { result } = renderHook(() => useCreateMovement(), { wrapper: createWrapper() });

    await act(async () => {
      result.current.mutate({
        type: 'internal_use',
        items: [{ bottle_id: 'b1', price_at_sale: 100 }],
      });
    });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(mockToast).toHaveBeenCalledWith(
      expect.objectContaining({ title: 'Movement recorded' })
    );
  });

  it('shows error toast on creation failure', async () => {
    setMockResponse('profiles', { id: 'profile-123', org_id: 'org-123' });
    setMockResponse('bottles', []);
    setMockResponse('movements', null, { message: 'Insert failed' });

    const { result } = renderHook(() => useCreateMovement(), { wrapper: createWrapper() });

    await act(async () => {
      result.current.mutate({
        type: 'sale',
        items: [{ bottle_id: 'b1' }],
      });
    });

    await waitFor(() => expect(result.current.isError).toBe(true));
    expect(mockToast).toHaveBeenCalledWith(
      expect.objectContaining({ variant: 'destructive', title: 'Failed to record movement' })
    );
  });

  it('throws when user has no organization', async () => {
    setAuthContext({ profile: { ...mockProfile, org_id: null } as any });

    const { result } = renderHook(() => useCreateMovement(), { wrapper: createWrapper() });

    await act(async () => {
      result.current.mutate({
        type: 'sale',
        items: [{ bottle_id: 'b1' }],
      });
    });

    await waitFor(() => expect(result.current.isError).toBe(true));
    expect(result.current.error?.message).toContain('No organization found');
  });
});

describe('useDeleteMovement', () => {
  it('deletes movement, restores bottles, and toasts success', async () => {
    setMockResponse('movements', { type: 'sale', contact_id: 'c1', notes: '' });
    setMockResponse('movement_items', [{ bottle_id: 'b1', price_at_sale: 50 }]);
    setMockResponse('bottles', []);
    setMockResponse('client_inventory', []);
    setMockResponse('contacts', { assigned_rep_id: null });
    setMockResponse('sales_orders', []);
    setMockResponse('commissions', []);

    const { result } = renderHook(() => useDeleteMovement(), { wrapper: createWrapper() });

    await act(async () => {
      result.current.mutate('mv-1');
    });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(mockToast).toHaveBeenCalledWith(
      expect.objectContaining({ title: expect.stringContaining('reversed') })
    );
  });

  it('shows error on delete failure', async () => {
    setMockResponse('movements', null, { message: 'Delete blocked' });

    const { result } = renderHook(() => useDeleteMovement(), { wrapper: createWrapper() });

    await act(async () => {
      result.current.mutate('mv-bad');
    });

    await waitFor(() => expect(result.current.isError).toBe(true));
    expect(mockToast).toHaveBeenCalledWith(
      expect.objectContaining({ variant: 'destructive', title: 'Failed to undo sale' })
    );
  });
});
