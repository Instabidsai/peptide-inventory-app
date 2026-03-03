import { describe, it, expect, beforeEach, vi } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';
import { setMockResponse, setRpcResponse, resetMockResponses } from '@/test/mocks/supabase';
import '@/test/mocks/auth';
import { createWrapper } from '@/test/mocks/wrapper';
import {
  useBottles,
  useBottle,
  useBottleByUid,
  useUpdateBottle,
  useUpdateBottles,
  useBottleStats,
  useDeleteBottle,
} from './use-bottles';

// Mock useToast
const mockToast = vi.fn();
vi.mock('@/hooks/use-toast', () => ({
  useToast: () => ({ toast: mockToast }),
}));

describe('use-bottles', () => {
  beforeEach(() => {
    resetMockResponses();
    mockToast.mockClear();
  });

  const sampleBottle = {
    id: 'bottle-1',
    uid: 'BTL-001',
    org_id: 'org-123',
    lot_id: 'lot-1',
    status: 'in_stock',
    created_at: '2026-01-01T00:00:00Z',
    updated_at: '2026-01-01T00:00:00Z',
    lots: { id: 'lot-1', lot_number: 'LOT-001', peptides: { id: 'pep-1', name: 'BPC-157' } },
  };

  describe('useBottles', () => {
    it('returns bottles list on success', async () => {
      setMockResponse('bottles', [sampleBottle]);

      const { result } = renderHook(() => useBottles(), { wrapper: createWrapper() });

      await waitFor(() => expect(result.current.isSuccess).toBe(true));
      expect(result.current.data).toEqual([sampleBottle]);
    });

    it('returns empty array when no bottles', async () => {
      setMockResponse('bottles', []);

      const { result } = renderHook(() => useBottles(), { wrapper: createWrapper() });

      await waitFor(() => expect(result.current.isSuccess).toBe(true));
      expect(result.current.data).toEqual([]);
    });

    it('handles database error', async () => {
      setMockResponse('bottles', null, { message: 'DB connection failed' });

      const { result } = renderHook(() => useBottles(), { wrapper: createWrapper() });

      await waitFor(() => expect(result.current.isError).toBe(true));
      expect(result.current.error?.message).toBe('DB connection failed');
    });
  });

  describe('useBottle', () => {
    it('returns single bottle by ID', async () => {
      setMockResponse('bottles', sampleBottle);

      const { result } = renderHook(() => useBottle('bottle-1'), { wrapper: createWrapper() });

      await waitFor(() => expect(result.current.isSuccess).toBe(true));
      expect(result.current.data).toEqual(sampleBottle);
    });

    it('throws when bottle not found', async () => {
      setMockResponse('bottles', null);

      const { result } = renderHook(() => useBottle('nonexistent'), { wrapper: createWrapper() });

      await waitFor(() => expect(result.current.isError).toBe(true));
      expect(result.current.error?.message).toBe('Bottle not found');
    });

    it('is disabled when id is empty', () => {
      const { result } = renderHook(() => useBottle(''), { wrapper: createWrapper() });
      expect(result.current.fetchStatus).toBe('idle');
    });
  });

  describe('useBottleByUid', () => {
    it('returns bottle by UID', async () => {
      setMockResponse('bottles', sampleBottle);

      const { result } = renderHook(() => useBottleByUid('BTL-001'), { wrapper: createWrapper() });

      await waitFor(() => expect(result.current.isSuccess).toBe(true));
      expect(result.current.data).toEqual(sampleBottle);
    });

    it('returns null when bottle not found by UID', async () => {
      setMockResponse('bottles', null);

      const { result } = renderHook(() => useBottleByUid('INVALID-UID'), { wrapper: createWrapper() });

      await waitFor(() => expect(result.current.isSuccess).toBe(true));
      expect(result.current.data).toBeNull();
    });

    it('is disabled when UID is too short', () => {
      const { result } = renderHook(() => useBottleByUid('AB'), { wrapper: createWrapper() });
      expect(result.current.fetchStatus).toBe('idle');
    });
  });

  describe('useUpdateBottle', () => {
    it('updates bottle and shows success toast', async () => {
      setMockResponse('bottles', { ...sampleBottle, status: 'sold' });

      const { result } = renderHook(() => useUpdateBottle(), { wrapper: createWrapper() });

      result.current.mutate({ id: 'bottle-1', status: 'sold' });

      await waitFor(() => expect(result.current.isSuccess).toBe(true));
      expect(mockToast).toHaveBeenCalledWith(expect.objectContaining({ title: 'Bottle updated successfully' }));
    });

    it('shows error toast on failure', async () => {
      setMockResponse('bottles', null, { message: 'Update failed' });

      const { result } = renderHook(() => useUpdateBottle(), { wrapper: createWrapper() });

      result.current.mutate({ id: 'bottle-1', status: 'sold' });

      await waitFor(() => expect(result.current.isError).toBe(true));
      expect(mockToast).toHaveBeenCalledWith(
        expect.objectContaining({ variant: 'destructive', title: 'Failed to update bottle' })
      );
    });
  });

  describe('useUpdateBottles (bulk)', () => {
    it('updates multiple bottles', async () => {
      setMockResponse('bottles', [{ id: 'bottle-1' }, { id: 'bottle-2' }]);

      const { result } = renderHook(() => useUpdateBottles(), { wrapper: createWrapper() });

      result.current.mutate({ ids: ['bottle-1', 'bottle-2'], status: 'sold' });

      await waitFor(() => expect(result.current.isSuccess).toBe(true));
      expect(mockToast).toHaveBeenCalledWith(
        expect.objectContaining({ title: '2 bottles updated successfully' })
      );
    });
  });

  describe('useBottleStats', () => {
    it('returns stats from RPC as computed object', async () => {
      // RPC returns rows of { status, count }
      const rpcRows = [
        { status: 'in_stock', count: 50 },
        { status: 'sold', count: 30 },
        { status: 'given_away', count: 5 },
      ];
      setRpcResponse('get_bottle_stats', rpcRows);

      const { result } = renderHook(() => useBottleStats(), { wrapper: createWrapper() });

      await waitFor(() => expect(result.current.isSuccess).toBe(true));
      expect(result.current.data).toEqual({
        total: 85,
        in_stock: 50,
        sold: 30,
        given_away: 5,
        internal_use: 0,
        lost: 0,
        returned: 0,
        expired: 0,
      });
    });
  });

  describe('useDeleteBottle', () => {
    it('deletes bottle and associated movement_items', async () => {
      // movement_items delete
      setMockResponse('movement_items', []);
      // bottle delete
      setMockResponse('bottles', null);

      const { result } = renderHook(() => useDeleteBottle(), { wrapper: createWrapper() });

      result.current.mutate('bottle-1');

      await waitFor(() => expect(result.current.isSuccess).toBe(true));
      expect(mockToast).toHaveBeenCalledWith(
        expect.objectContaining({ title: 'Bottle deleted successfully' })
      );
    });
  });
});
