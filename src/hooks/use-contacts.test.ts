import { describe, it, expect, beforeEach, vi } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';
import { setMockResponse, setRpcResponse, resetMockResponses } from '@/test/mocks/supabase';
import '@/test/mocks/auth';
import { createWrapper } from '@/test/mocks/wrapper';
import {
  useContacts,
  useContact,
  useCreateContact,
  useUpdateContact,
  useDeleteContact,
} from './use-contacts';

const mockToast = vi.fn();
vi.mock('@/hooks/use-toast', () => ({
  useToast: () => ({ toast: mockToast }),
}));

describe('use-contacts', () => {
  beforeEach(() => {
    resetMockResponses();
    mockToast.mockClear();
  });

  const sampleContact = {
    id: 'contact-1',
    org_id: 'org-123',
    name: 'John Smith',
    email: 'john@example.com',
    phone: '+15551234567',
    type: 'customer' as const,
    company: 'Acme Corp',
    address: '123 Main St, Austin TX',
    notes: null,
    source: 'manual' as const,
    created_at: '2026-01-01T00:00:00Z',
    updated_at: '2026-01-01T00:00:00Z',
    assigned_rep: null,
    sales_orders: [],
  };

  describe('useContacts', () => {
    it('returns contacts list on success', async () => {
      setMockResponse('contacts', [sampleContact]);

      const { result } = renderHook(() => useContacts(), { wrapper: createWrapper() });

      await waitFor(() => expect(result.current.isSuccess).toBe(true));
      expect(result.current.data).toEqual([sampleContact]);
    });

    it('returns empty array when no contacts', async () => {
      setMockResponse('contacts', []);

      const { result } = renderHook(() => useContacts(), { wrapper: createWrapper() });

      await waitFor(() => expect(result.current.isSuccess).toBe(true));
      expect(result.current.data).toEqual([]);
    });

    it('filters by contact type', async () => {
      setMockResponse('contacts', [sampleContact]);

      const { result } = renderHook(() => useContacts('customer'), { wrapper: createWrapper() });

      await waitFor(() => expect(result.current.isSuccess).toBe(true));
      expect(result.current.data).toEqual([sampleContact]);
    });

    it('handles database error', async () => {
      setMockResponse('contacts', null, { message: 'RLS policy violation' });

      const { result } = renderHook(() => useContacts(), { wrapper: createWrapper() });

      await waitFor(() => expect(result.current.isError).toBe(true));
      expect(result.current.error?.message).toBe('RLS policy violation');
    });
  });

  describe('useContact', () => {
    it('returns single contact by ID', async () => {
      setMockResponse('contacts', sampleContact);

      const { result } = renderHook(() => useContact('contact-1'), { wrapper: createWrapper() });

      await waitFor(() => expect(result.current.isSuccess).toBe(true));
      expect(result.current.data).toEqual(sampleContact);
    });

    it('throws when contact not found', async () => {
      setMockResponse('contacts', null);

      const { result } = renderHook(() => useContact('nonexistent'), { wrapper: createWrapper() });

      await waitFor(() => expect(result.current.isError).toBe(true));
      expect(result.current.error?.message).toBe('Contact not found');
    });

    it('is disabled when id is empty', () => {
      const { result } = renderHook(() => useContact(''), { wrapper: createWrapper() });
      expect(result.current.fetchStatus).toBe('idle');
    });
  });

  describe('useCreateContact', () => {
    it('creates contact and shows success toast', async () => {
      setMockResponse('contacts', sampleContact);

      const { result } = renderHook(() => useCreateContact(), { wrapper: createWrapper() });

      result.current.mutate({ name: 'John Smith', email: 'john@example.com' });

      await waitFor(() => expect(result.current.isSuccess).toBe(true));
      expect(mockToast).toHaveBeenCalledWith(
        expect.objectContaining({ title: 'Customer created successfully' })
      );
    });

    it('rejects when no org_id', async () => {
      const { setAuthContext } = await import('@/test/mocks/auth');
      setAuthContext({ profile: { id: 'profile-123', user_id: 'auth-user-123', org_id: null, role: 'admin' } });

      const { result } = renderHook(() => useCreateContact(), { wrapper: createWrapper() });

      result.current.mutate({ name: 'Test' });

      await waitFor(() => expect(result.current.isError).toBe(true));
      expect(result.current.error?.message).toBe('No organization found');

      const { resetAuthContext } = await import('@/test/mocks/auth');
      resetAuthContext();
    });

    it('shows error toast on failure', async () => {
      setMockResponse('contacts', null, { message: 'Insert failed' });

      const { result } = renderHook(() => useCreateContact(), { wrapper: createWrapper() });

      result.current.mutate({ name: 'Test' });

      await waitFor(() => expect(result.current.isError).toBe(true));
      expect(mockToast).toHaveBeenCalledWith(
        expect.objectContaining({ variant: 'destructive', title: 'Failed to create customer' })
      );
    });
  });

  describe('useUpdateContact', () => {
    it('updates contact and shows success toast', async () => {
      setMockResponse('contacts', { ...sampleContact, name: 'Jane Smith' });
      setMockResponse('profiles', null); // For the sync

      const { result } = renderHook(() => useUpdateContact(), { wrapper: createWrapper() });

      result.current.mutate({ id: 'contact-1', name: 'Jane Smith' });

      await waitFor(() => expect(result.current.isSuccess).toBe(true));
      expect(mockToast).toHaveBeenCalledWith(
        expect.objectContaining({ title: 'Customer updated successfully' })
      );
    });

    it('syncs name to linked profile when linked_user_id exists', async () => {
      setMockResponse('contacts', { ...sampleContact, linked_user_id: 'linked-user-1' });
      setMockResponse('profiles', null);

      const { result } = renderHook(() => useUpdateContact(), { wrapper: createWrapper() });

      result.current.mutate({ id: 'contact-1', name: 'Updated Name' });

      await waitFor(() => expect(result.current.isSuccess).toBe(true));
    });
  });

  describe('useDeleteContact', () => {
    it('calls cascade delete RPC and shows success toast', async () => {
      setRpcResponse('delete_contact_cascade', { success: true });

      const { result } = renderHook(() => useDeleteContact(), { wrapper: createWrapper() });

      result.current.mutate('contact-1');

      await waitFor(() => expect(result.current.isSuccess).toBe(true));
      expect(mockToast).toHaveBeenCalledWith(
        expect.objectContaining({ title: 'Customer deleted successfully' })
      );
    });

    it('throws on RPC failure', async () => {
      setRpcResponse('delete_contact_cascade', null, { message: 'Transaction failed' });

      const { result } = renderHook(() => useDeleteContact(), { wrapper: createWrapper() });

      result.current.mutate('contact-1');

      await waitFor(() => expect(result.current.isError).toBe(true));
    });

    it('throws when RPC returns success=false', async () => {
      setRpcResponse('delete_contact_cascade', { success: false, error: 'Contact has active orders' });

      const { result } = renderHook(() => useDeleteContact(), { wrapper: createWrapper() });

      result.current.mutate('contact-1');

      await waitFor(() => expect(result.current.isError).toBe(true));
      expect(result.current.error?.message).toContain('Contact has active orders');
    });
  });
});
