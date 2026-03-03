import { describe, it, expect, beforeEach, vi } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';
import { setMockResponse, setRpcResponse, resetMockResponses } from '@/test/mocks/supabase';
import '@/test/mocks/auth';
import { createWrapper } from '@/test/mocks/wrapper';
import {
  usePeptides,
  usePeptide,
  useCreatePeptide,
  useUpdatePeptide,
  useDeletePeptide,
} from './use-peptides';

const mockToast = vi.fn();
vi.mock('@/hooks/use-toast', () => ({
  useToast: () => ({ toast: mockToast }),
}));

describe('use-peptides', () => {
  beforeEach(() => {
    resetMockResponses();
    mockToast.mockClear();
  });

  const samplePeptide = {
    id: 'pep-1',
    org_id: 'org-123',
    name: 'BPC-157 5mg',
    description: 'Body Protection Compound',
    base_price: 45.00,
    store_visible: true,
    created_at: '2026-01-01T00:00:00Z',
    updated_at: '2026-01-01T00:00:00Z',
    stock_count: 50,
    avg_cost: 22.50,
  };

  describe('usePeptides', () => {
    it('returns peptides list on success', async () => {
      setMockResponse('peptides', [samplePeptide]);
      setRpcResponse('get_peptide_stock_counts', [{ peptide_id: 'pep-1', count: 50 }]);

      const { result } = renderHook(() => usePeptides(), { wrapper: createWrapper() });

      await waitFor(() => expect(result.current.isSuccess).toBe(true));
      expect(result.current.data).toBeDefined();
      expect(Array.isArray(result.current.data)).toBe(true);
    });

    it('returns empty array when no peptides', async () => {
      setMockResponse('peptides', []);
      setRpcResponse('get_peptide_stock_counts', []);

      const { result } = renderHook(() => usePeptides(), { wrapper: createWrapper() });

      await waitFor(() => expect(result.current.isSuccess).toBe(true));
      expect(result.current.data).toEqual([]);
    });

    it('handles database error', async () => {
      setMockResponse('peptides', null, { message: 'Permission denied' });

      const { result } = renderHook(() => usePeptides(), { wrapper: createWrapper() });

      await waitFor(() => expect(result.current.isError).toBe(true));
      expect(result.current.error?.message).toBe('Permission denied');
    });
  });

  describe('usePeptide', () => {
    it('returns single peptide by ID', async () => {
      setMockResponse('peptides', samplePeptide);

      const { result } = renderHook(() => usePeptide('pep-1'), { wrapper: createWrapper() });

      await waitFor(() => expect(result.current.isSuccess).toBe(true));
      expect(result.current.data).toEqual(samplePeptide);
    });

    it('throws when peptide not found', async () => {
      setMockResponse('peptides', null);

      const { result } = renderHook(() => usePeptide('nonexistent'), { wrapper: createWrapper() });

      await waitFor(() => expect(result.current.isError).toBe(true));
      expect(result.current.error?.message).toBe('Peptide not found');
    });

    it('is disabled when id is empty', () => {
      const { result } = renderHook(() => usePeptide(''), { wrapper: createWrapper() });
      expect(result.current.fetchStatus).toBe('idle');
    });
  });

  describe('useCreatePeptide', () => {
    it('creates peptide and shows success toast', async () => {
      setMockResponse('peptides', samplePeptide);

      const { result } = renderHook(() => useCreatePeptide(), { wrapper: createWrapper() });

      result.current.mutate({
        name: 'BPC-157 5mg',
        base_price: 45.00,
      });

      await waitFor(() => expect(result.current.isSuccess).toBe(true));
      expect(mockToast).toHaveBeenCalledWith(
        expect.objectContaining({ title: 'Peptide created successfully' })
      );
    });

    it('shows error toast on creation failure', async () => {
      setMockResponse('peptides', null, { message: 'Duplicate name' });

      const { result } = renderHook(() => useCreatePeptide(), { wrapper: createWrapper() });

      result.current.mutate({
        name: 'BPC-157 5mg',
        base_price: 45.00,
      });

      await waitFor(() => expect(result.current.isError).toBe(true));
      expect(mockToast).toHaveBeenCalledWith(
        expect.objectContaining({ variant: 'destructive', title: 'Failed to create peptide' })
      );
    });
  });

  describe('useUpdatePeptide', () => {
    it('updates peptide and shows success toast', async () => {
      setMockResponse('peptides', { ...samplePeptide, base_price: 50.00 });

      const { result } = renderHook(() => useUpdatePeptide(), { wrapper: createWrapper() });

      result.current.mutate({ id: 'pep-1', base_price: 50.00 });

      await waitFor(() => expect(result.current.isSuccess).toBe(true));
      expect(mockToast).toHaveBeenCalledWith(
        expect.objectContaining({ title: 'Peptide updated successfully' })
      );
    });

    it('shows error toast on update failure', async () => {
      setMockResponse('peptides', null, { message: 'RLS violation' });

      const { result } = renderHook(() => useUpdatePeptide(), { wrapper: createWrapper() });

      result.current.mutate({ id: 'pep-1', base_price: 50.00 });

      await waitFor(() => expect(result.current.isError).toBe(true));
      expect(mockToast).toHaveBeenCalledWith(
        expect.objectContaining({ variant: 'destructive' })
      );
    });
  });

  describe('useDeletePeptide', () => {
    it('deletes peptide and shows success toast', async () => {
      setMockResponse('peptides', null);

      const { result } = renderHook(() => useDeletePeptide(), { wrapper: createWrapper() });

      result.current.mutate('pep-1');

      await waitFor(() => expect(result.current.isSuccess).toBe(true));
      expect(mockToast).toHaveBeenCalledWith(
        expect.objectContaining({ title: 'Peptide deleted successfully' })
      );
    });

    it('shows error toast on delete failure (FK constraint)', async () => {
      setMockResponse('peptides', null, { message: 'violates foreign key constraint' });

      const { result } = renderHook(() => useDeletePeptide(), { wrapper: createWrapper() });

      result.current.mutate('pep-1');

      await waitFor(() => expect(result.current.isError).toBe(true));
      expect(mockToast).toHaveBeenCalledWith(
        expect.objectContaining({ variant: 'destructive' })
      );
    });
  });
});
