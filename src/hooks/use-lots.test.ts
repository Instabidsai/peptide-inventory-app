import { describe, it, expect, beforeEach, vi } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';
import { setMockResponse, resetMockResponses } from '@/test/mocks/supabase';
import '@/test/mocks/auth';
import { createWrapper } from '@/test/mocks/wrapper';
import {
  useLots,
  useLot,
  useCreateLot,
  useUpdateLot,
  useDeleteLot,
} from './use-lots';

const mockToast = vi.fn();
vi.mock('@/hooks/use-toast', () => ({
  useToast: () => ({ toast: mockToast }),
}));

describe('use-lots', () => {
  beforeEach(() => {
    resetMockResponses();
    mockToast.mockClear();
  });

  const sampleLot = {
    id: 'lot-1',
    org_id: 'org-123',
    peptide_id: 'pep-1',
    lot_number: 'LOT-2026-001',
    quantity_received: 100,
    cost_per_unit: 22.50,
    received_date: '2026-01-15',
    expiry_date: '2027-01-15',
    notes: null,
    payment_status: 'paid' as const,
    payment_date: '2026-01-15',
    payment_method: 'wire',
    created_at: '2026-01-15T00:00:00Z',
    updated_at: '2026-01-15T00:00:00Z',
    peptides: { id: 'pep-1', name: 'BPC-157 5mg' },
  };

  describe('useLots', () => {
    it('returns lots list on success', async () => {
      setMockResponse('lots', [sampleLot]);

      const { result } = renderHook(() => useLots(), { wrapper: createWrapper() });

      await waitFor(() => expect(result.current.isSuccess).toBe(true));
      expect(result.current.data).toEqual([sampleLot]);
    });

    it('returns empty array when no lots', async () => {
      setMockResponse('lots', []);

      const { result } = renderHook(() => useLots(), { wrapper: createWrapper() });

      await waitFor(() => expect(result.current.isSuccess).toBe(true));
      expect(result.current.data).toEqual([]);
    });

    it('handles database error', async () => {
      setMockResponse('lots', null, { message: 'Connection timeout' });

      const { result } = renderHook(() => useLots(), { wrapper: createWrapper() });

      await waitFor(() => expect(result.current.isError).toBe(true));
      expect(result.current.error?.message).toBe('Connection timeout');
    });
  });

  describe('useLot', () => {
    it('returns single lot by ID', async () => {
      setMockResponse('lots', sampleLot);

      const { result } = renderHook(() => useLot('lot-1'), { wrapper: createWrapper() });

      await waitFor(() => expect(result.current.isSuccess).toBe(true));
      expect(result.current.data).toEqual(sampleLot);
    });

    it('throws when lot not found', async () => {
      setMockResponse('lots', null);

      const { result } = renderHook(() => useLot('nonexistent'), { wrapper: createWrapper() });

      await waitFor(() => expect(result.current.isError).toBe(true));
      expect(result.current.error?.message).toBe('Lot not found');
    });

    it('is disabled when id is empty', () => {
      const { result } = renderHook(() => useLot(''), { wrapper: createWrapper() });
      expect(result.current.fetchStatus).toBe('idle');
    });
  });

  describe('useCreateLot', () => {
    it('creates lot and shows success toast with quantity', async () => {
      setMockResponse('lots', { ...sampleLot, quantity_received: 50 });

      const { result } = renderHook(() => useCreateLot(), { wrapper: createWrapper() });

      result.current.mutate({
        peptide_id: 'pep-1',
        lot_number: 'LOT-2026-002',
        quantity_received: 50,
        cost_per_unit: 20.00,
      });

      await waitFor(() => expect(result.current.isSuccess).toBe(true));
      expect(mockToast).toHaveBeenCalledWith(
        expect.objectContaining({
          title: 'Lot received successfully',
          description: expect.stringContaining('50'),
        })
      );
    });

    it('rejects when no org_id in profile', async () => {
      // Override auth to have no org_id
      const { setAuthContext } = await import('@/test/mocks/auth');
      setAuthContext({ profile: { id: 'profile-123', user_id: 'auth-user-123', org_id: null, role: 'admin' } });

      const { result } = renderHook(() => useCreateLot(), { wrapper: createWrapper() });

      result.current.mutate({
        peptide_id: 'pep-1',
        lot_number: 'LOT-2026-002',
        quantity_received: 50,
        cost_per_unit: 20.00,
      });

      await waitFor(() => expect(result.current.isError).toBe(true));
      expect(result.current.error?.message).toBe('No organization found');

      // Restore
      const { resetAuthContext } = await import('@/test/mocks/auth');
      resetAuthContext();
    });

    it('shows error toast on failure', async () => {
      setMockResponse('lots', null, { message: 'Duplicate lot_number' });

      const { result } = renderHook(() => useCreateLot(), { wrapper: createWrapper() });

      result.current.mutate({
        peptide_id: 'pep-1',
        lot_number: 'LOT-2026-001',
        quantity_received: 50,
        cost_per_unit: 20.00,
      });

      await waitFor(() => expect(result.current.isError).toBe(true));
      expect(mockToast).toHaveBeenCalledWith(
        expect.objectContaining({ variant: 'destructive', title: 'Failed to create lot' })
      );
    });
  });

  describe('useUpdateLot', () => {
    it('updates lot and shows success toast', async () => {
      setMockResponse('lots', { ...sampleLot, payment_status: 'paid' });

      const { result } = renderHook(() => useUpdateLot(), { wrapper: createWrapper() });

      result.current.mutate({ id: 'lot-1', payment_status: 'paid' });

      await waitFor(() => expect(result.current.isSuccess).toBe(true));
      expect(mockToast).toHaveBeenCalledWith(
        expect.objectContaining({ title: 'Lot updated successfully' })
      );
    });
  });

  describe('useDeleteLot', () => {
    it('performs cascade delete (movement_items → bottles → lot)', async () => {
      // First call: get bottles for lot
      setMockResponse('bottles', [{ id: 'bottle-1' }, { id: 'bottle-2' }]);
      // Subsequent calls for delete
      setMockResponse('movement_items', []);
      setMockResponse('lots', null);

      const { result } = renderHook(() => useDeleteLot(), { wrapper: createWrapper() });

      result.current.mutate('lot-1');

      await waitFor(() => expect(result.current.isSuccess).toBe(true));
      expect(mockToast).toHaveBeenCalledWith(
        expect.objectContaining({ title: 'Lot deleted successfully' })
      );
    });

    it('shows error toast on delete failure', async () => {
      setMockResponse('bottles', [{ id: 'bottle-1' }]);
      setMockResponse('movement_items', null, { message: 'FK constraint' });

      const { result } = renderHook(() => useDeleteLot(), { wrapper: createWrapper() });

      result.current.mutate('lot-1');

      await waitFor(() => expect(result.current.isError).toBe(true));
      expect(mockToast).toHaveBeenCalledWith(
        expect.objectContaining({ variant: 'destructive' })
      );
    });
  });
});
