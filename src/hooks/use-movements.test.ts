import { describe, it, expect, beforeEach, vi } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';
import { setMockResponse, resetMockResponses } from '@/test/mocks/supabase';
import '@/test/mocks/auth';
import { createWrapper } from '@/test/mocks/wrapper';
import {
  useMovements,
  useMovement,
  useMovementItems,
  useCreateMovement,
  useDeleteMovement,
} from './use-movements';

const mockToast = vi.fn();
vi.mock('@/hooks/use-toast', () => ({
  useToast: () => ({ toast: mockToast }),
}));

// Mock logger to prevent console noise in tests
vi.mock('@/lib/logger', () => ({
  logger: { debug: vi.fn(), log: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));

// Mock auto-protocol (used in createMovement)
vi.mock('@/lib/auto-protocol', () => ({
  autoGenerateProtocol: vi.fn().mockResolvedValue({ protocolItemMap: new Map() }),
}));

// Mock supply-calculations
vi.mock('@/lib/supply-calculations', () => ({
  parseVialSize: vi.fn().mockReturnValue(5),
}));

describe('use-movements', () => {
  beforeEach(() => {
    resetMockResponses();
    mockToast.mockClear();
  });

  const sampleMovement = {
    id: 'mov-1',
    org_id: 'org-123',
    type: 'sale' as const,
    contact_id: 'contact-1',
    movement_date: '2026-01-20',
    notes: null,
    created_by: 'profile-123',
    created_at: '2026-01-20T00:00:00Z',
    status: 'active' as const,
    payment_status: 'paid' as const,
    amount_paid: 90.00,
    payment_method: 'cash',
    payment_date: '2026-01-20',
    discount_percent: 0,
    discount_amount: 0,
    contacts: { id: 'contact-1', name: 'John Smith' },
    profiles: { id: 'profile-123', full_name: 'Test User' },
  };

  describe('useMovements', () => {
    it('returns stitched movements with items', async () => {
      setMockResponse('movements', [sampleMovement]);
      setMockResponse('movement_items', [
        { id: 'mi-1', movement_id: 'mov-1', bottle_id: 'bottle-1', price_at_sale: 45.00 },
      ]);
      setMockResponse('bottles', [
        { id: 'bottle-1', uid: 'BTL-001', lots: { id: 'lot-1', lot_number: 'LOT-001', cost_per_unit: 22.50, peptides: { id: 'pep-1', name: 'BPC-157' } } },
      ]);

      const { result } = renderHook(() => useMovements(), { wrapper: createWrapper() });

      await waitFor(() => expect(result.current.isSuccess).toBe(true));
      expect(result.current.data).toBeDefined();
      expect(Array.isArray(result.current.data)).toBe(true);
    });

    it('returns empty array when no movements', async () => {
      setMockResponse('movements', []);

      const { result } = renderHook(() => useMovements(), { wrapper: createWrapper() });

      await waitFor(() => expect(result.current.isSuccess).toBe(true));
      expect(result.current.data).toEqual([]);
    });

    it('handles database error', async () => {
      setMockResponse('movements', null, { message: 'Query failed' });

      const { result } = renderHook(() => useMovements(), { wrapper: createWrapper() });

      await waitFor(() => expect(result.current.isError).toBe(true));
    });

    it('filters by contact ID when provided', async () => {
      setMockResponse('movements', [sampleMovement]);
      setMockResponse('movement_items', []);

      const { result } = renderHook(() => useMovements('contact-1'), { wrapper: createWrapper() });

      await waitFor(() => expect(result.current.isSuccess).toBe(true));
    });
  });

  describe('useMovement', () => {
    it('returns single movement with enriched items', async () => {
      setMockResponse('movements', sampleMovement);
      setMockResponse('movement_items', [
        { id: 'mi-1', movement_id: 'mov-1', bottle_id: 'bottle-1', price_at_sale: 45.00 },
      ]);
      setMockResponse('bottles', [
        { id: 'bottle-1', uid: 'BTL-001', lots: null },
      ]);

      const { result } = renderHook(() => useMovement('mov-1'), { wrapper: createWrapper() });

      await waitFor(() => expect(result.current.isSuccess).toBe(true));
      expect(result.current.data).toBeDefined();
    });

    it('throws when movement not found', async () => {
      setMockResponse('movements', null);

      const { result } = renderHook(() => useMovement('nonexistent'), { wrapper: createWrapper() });

      await waitFor(() => expect(result.current.isError).toBe(true));
      expect(result.current.error?.message).toBe('Movement not found');
    });

    it('is disabled when id is empty', () => {
      const { result } = renderHook(() => useMovement(''), { wrapper: createWrapper() });
      expect(result.current.fetchStatus).toBe('idle');
    });
  });

  describe('useMovementItems', () => {
    it('returns enriched movement items', async () => {
      setMockResponse('movement_items', [
        { id: 'mi-1', movement_id: 'mov-1', bottle_id: 'bottle-1', description: null, price_at_sale: 45.00 },
      ]);
      setMockResponse('bottles', [
        { id: 'bottle-1', uid: 'BTL-001', lots: { id: 'lot-1', lot_number: 'LOT-001', cost_per_unit: 22.50, peptides: { id: 'pep-1', name: 'BPC-157' } } },
      ]);

      const { result } = renderHook(() => useMovementItems('mov-1'), { wrapper: createWrapper() });

      await waitFor(() => expect(result.current.isSuccess).toBe(true));
      expect(result.current.data).toBeDefined();
    });
  });

  describe('useCreateMovement', () => {
    it('creates a sale movement and updates bottle status', async () => {
      // Pre-fetch bottle details
      setMockResponse('bottles', [
        { id: 'bottle-1', uid: 'BTL-001', lots: { id: 'lot-1', lot_number: 'LOT-001', peptide_id: 'pep-1', peptides: { id: 'pep-1', name: 'BPC-157 5mg' } } },
      ]);
      // Create movement
      setMockResponse('movements', { id: 'mov-new', type: 'sale' });
      // Create items
      setMockResponse('movement_items', []);
      // Client inventory
      setMockResponse('client_inventory', []);
      // Contacts lookup for commission
      setMockResponse('contacts', { assigned_rep_id: null, name: 'John' });
      // Sales orders
      setMockResponse('sales_orders', null);

      const { result } = renderHook(() => useCreateMovement(), { wrapper: createWrapper() });

      result.current.mutate({
        type: 'sale',
        contact_id: 'contact-1',
        items: [{ bottle_id: 'bottle-1', price_at_sale: 45.00 }],
      });

      await waitFor(() => expect(result.current.isSuccess).toBe(true));
      expect(mockToast).toHaveBeenCalledWith(
        expect.objectContaining({
          title: 'Movement recorded',
          description: expect.stringContaining('1 bottle(s)'),
        })
      );
    });

    it('rejects when no org_id', async () => {
      const { setAuthContext } = await import('@/test/mocks/auth');
      setAuthContext({ profile: { id: 'profile-123', user_id: 'auth-user-123', org_id: null, role: 'admin' } });

      const { result } = renderHook(() => useCreateMovement(), { wrapper: createWrapper() });

      result.current.mutate({
        type: 'sale',
        items: [{ bottle_id: 'bottle-1', price_at_sale: 45.00 }],
      });

      await waitFor(() => expect(result.current.isError).toBe(true));
      expect(result.current.error?.message).toBe('No organization found');

      const { resetAuthContext } = await import('@/test/mocks/auth');
      resetAuthContext();
    });

    it('handles movement creation error', async () => {
      setMockResponse('bottles', []);
      setMockResponse('movements', null, { message: 'Insert failed' });

      const { result } = renderHook(() => useCreateMovement(), { wrapper: createWrapper() });

      result.current.mutate({
        type: 'sale',
        items: [{ bottle_id: 'bottle-1', price_at_sale: 45.00 }],
      });

      await waitFor(() => expect(result.current.isError).toBe(true));
      expect(mockToast).toHaveBeenCalledWith(
        expect.objectContaining({ variant: 'destructive', title: 'Failed to record movement' })
      );
    });
  });

  describe('useDeleteMovement', () => {
    it('reverses movement and restores bottles', async () => {
      // Fetch movement
      setMockResponse('movements', { type: 'giveaway', contact_id: 'contact-1', notes: '' });
      // Fetch items
      setMockResponse('movement_items', [
        { bottle_id: 'bottle-1', price_at_sale: 0 },
      ]);
      // Restore bottles
      setMockResponse('bottles', null);
      // Delete client_inventory
      setMockResponse('client_inventory', null);

      const { result } = renderHook(() => useDeleteMovement(), { wrapper: createWrapper() });

      result.current.mutate('mov-1');

      await waitFor(() => expect(result.current.isSuccess).toBe(true));
      expect(mockToast).toHaveBeenCalledWith(
        expect.objectContaining({
          title: expect.stringContaining('reversed'),
        })
      );
    });
  });
});
