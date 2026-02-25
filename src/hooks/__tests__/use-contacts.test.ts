import { describe, it, expect, beforeEach, vi } from 'vitest';
import { renderHook, waitFor, act } from '@testing-library/react';
import { createWrapper } from '@/test/mocks/wrapper';
import { supabase, setMockResponse, setRpcResponse, resetMockResponses, mockProfile } from '@/test/mocks/supabase';
import { mockToast, resetToast } from '@/test/mocks/toast';
import { resetAuthContext, setAuthContext } from '@/test/mocks/auth';
import {
  useContacts,
  useContact,
  useCreateContact,
  useUpdateContact,
  useDeleteContact,
} from '../use-contacts';

beforeEach(() => {
  vi.clearAllMocks();
  resetMockResponses();
  resetToast();
  resetAuthContext();
});

describe('useContacts', () => {
  it('fetches contacts list for the org', async () => {
    const mockContacts = [
      { id: 'c1', name: 'Alice', email: 'alice@test.com', org_id: 'org-123' },
      { id: 'c2', name: 'Bob', email: 'bob@test.com', org_id: 'org-123' },
    ];
    setMockResponse('contacts', mockContacts);

    const { result } = renderHook(() => useContacts(), { wrapper: createWrapper() });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(result.current.data).toEqual(mockContacts);
    expect(supabase.from).toHaveBeenCalledWith('contacts');
  });

  it('returns empty when user is not authenticated', async () => {
    setAuthContext({ user: null as any, profile: null as any });

    const { result } = renderHook(() => useContacts(), { wrapper: createWrapper() });

    // Query should not fire (enabled: false)
    await waitFor(() => expect(result.current.fetchStatus).toBe('idle'));
    expect(supabase.from).not.toHaveBeenCalled();
  });

  it('filters by contact type when provided', async () => {
    setMockResponse('contacts', []);

    const { result } = renderHook(() => useContacts('customer'), { wrapper: createWrapper() });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(supabase.from).toHaveBeenCalledWith('contacts');
  });

  it('restricts to rep network when user is sales_rep', async () => {
    setAuthContext({
      profile: { ...mockProfile, role: 'sales_rep' } as any,
    });
    setMockResponse('contacts', []);
    setRpcResponse('get_partner_downline', [{ id: 'downline-1' }]);

    const { result } = renderHook(() => useContacts(), { wrapper: createWrapper() });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(supabase.rpc).toHaveBeenCalledWith('get_partner_downline', { root_id: 'auth-user-123' });
  });
});

describe('useContact', () => {
  it('fetches a single contact by ID', async () => {
    const mockContact = { id: 'c1', name: 'Alice', email: 'alice@test.com', org_id: 'org-123' };
    setMockResponse('contacts', mockContact);

    const { result } = renderHook(() => useContact('c1'), { wrapper: createWrapper() });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(result.current.data).toEqual(mockContact);
  });

  it('does not fetch with empty ID', async () => {
    const { result } = renderHook(() => useContact(''), { wrapper: createWrapper() });

    await waitFor(() => expect(result.current.fetchStatus).toBe('idle'));
    expect(supabase.from).not.toHaveBeenCalled();
  });
});

describe('useCreateContact', () => {
  it('creates a contact and shows success toast', async () => {
    const newContact = { id: 'c3', name: 'Charlie', org_id: 'org-123' };
    setMockResponse('profiles', mockProfile);
    setMockResponse('contacts', newContact);

    const { result } = renderHook(() => useCreateContact(), { wrapper: createWrapper() });

    await act(async () => {
      result.current.mutate({ name: 'Charlie' });
    });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(mockToast).toHaveBeenCalledWith(expect.objectContaining({ title: 'Customer created successfully' }));
  });

  it('shows error toast on failure', async () => {
    setMockResponse('profiles', mockProfile);
    setMockResponse('contacts', null, { message: 'Duplicate email' });

    const { result } = renderHook(() => useCreateContact(), { wrapper: createWrapper() });

    await act(async () => {
      result.current.mutate({ name: 'Charlie', email: 'dupe@test.com' });
    });

    await waitFor(() => expect(result.current.isError).toBe(true));
    expect(mockToast).toHaveBeenCalledWith(
      expect.objectContaining({ variant: 'destructive', title: 'Failed to create customer' })
    );
  });
});

describe('useUpdateContact', () => {
  it('updates a contact and shows success toast', async () => {
    const updated = { id: 'c1', name: 'Alice Updated' };
    setMockResponse('contacts', updated);

    const { result } = renderHook(() => useUpdateContact(), { wrapper: createWrapper() });

    await act(async () => {
      result.current.mutate({ id: 'c1', name: 'Alice Updated' });
    });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(mockToast).toHaveBeenCalledWith(expect.objectContaining({ title: 'Customer updated successfully' }));
  });
});

describe('useDeleteContact', () => {
  it('calls delete_contact_cascade RPC', async () => {
    setRpcResponse('delete_contact_cascade', { success: true });

    const { result } = renderHook(() => useDeleteContact(), { wrapper: createWrapper() });

    await act(async () => {
      result.current.mutate('c1');
    });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(supabase.rpc).toHaveBeenCalledWith('delete_contact_cascade', {
      p_contact_id: 'c1',
      p_org_id: 'org-123',
    });
    expect(mockToast).toHaveBeenCalledWith(expect.objectContaining({ title: 'Customer deleted successfully' }));
  });

  it('shows error when RPC returns failure', async () => {
    setRpcResponse('delete_contact_cascade', { success: false, error: 'Contact not found' });

    const { result } = renderHook(() => useDeleteContact(), { wrapper: createWrapper() });

    await act(async () => {
      result.current.mutate('bad-id');
    });

    await waitFor(() => expect(result.current.isError).toBe(true));
    expect(mockToast).toHaveBeenCalledWith(
      expect.objectContaining({ variant: 'destructive', title: 'Failed to delete customer' })
    );
  });

  it('throws when no org context', async () => {
    setAuthContext({ profile: { ...mockProfile, org_id: null } as any });

    const { result } = renderHook(() => useDeleteContact(), { wrapper: createWrapper() });

    await act(async () => {
      result.current.mutate('c1');
    });

    await waitFor(() => expect(result.current.isError).toBe(true));
    expect(result.current.error?.message).toContain('No organization context');
  });
});
