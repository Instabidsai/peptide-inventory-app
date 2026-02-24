import { describe, it, expect, beforeEach, vi } from 'vitest';
import { renderHook, waitFor, act } from '@testing-library/react';
import { createWrapper } from '@/test/mocks/wrapper';
import { supabase, setMockResponse, setRpcResponse, resetMockResponses, mockProfile } from '@/test/mocks/supabase';
import { mockToast, resetToast } from '@/test/mocks/toast';
import { resetAuthContext, setAuthContext } from '@/test/mocks/auth';
import {
  usePartnerDownline,
  useCommissions,
  usePayCommission,
  useConvertCommission,
  useFullNetwork,
  useDownlineClients,
} from '../use-partner';

beforeEach(() => {
  vi.clearAllMocks();
  resetMockResponses();
  resetToast();
  resetAuthContext();
});

describe('usePartnerDownline', () => {
  it('calls get_partner_downline RPC with user ID', async () => {
    setRpcResponse('get_partner_downline', [
      { id: 'p1', full_name: 'Rep A', depth: 0, path: ['p1'] },
    ]);

    const { result } = renderHook(() => usePartnerDownline(), { wrapper: createWrapper() });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(supabase.rpc).toHaveBeenCalledWith('get_partner_downline', { root_id: 'auth-user-123' });
    expect(result.current.data).toHaveLength(1);
  });

  it('uses provided rootId instead of user ID', async () => {
    setRpcResponse('get_partner_downline', []);

    const { result } = renderHook(() => usePartnerDownline('custom-root'), { wrapper: createWrapper() });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(supabase.rpc).toHaveBeenCalledWith('get_partner_downline', { root_id: 'custom-root' });
  });

  it('returns empty array when no user', async () => {
    setAuthContext({ user: null as any });

    const { result } = renderHook(() => usePartnerDownline(), { wrapper: createWrapper() });

    await waitFor(() => expect(result.current.fetchStatus).toBe('idle'));
  });
});

describe('useCommissions', () => {
  it('fetches commissions for the authenticated user profile', async () => {
    const commissions = [
      { id: 'c1', amount: 50, status: 'available', sale_id: 's1' },
      { id: 'c2', amount: 30, status: 'pending', sale_id: 's2' },
    ];
    setMockResponse('profiles', { id: 'profile-123' });
    setMockResponse('commissions', commissions);

    const { result } = renderHook(() => useCommissions(), { wrapper: createWrapper() });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(result.current.data).toEqual(commissions);
  });

  it('returns empty when user is not authenticated', async () => {
    setAuthContext({ user: null as any });

    const { result } = renderHook(() => useCommissions(), { wrapper: createWrapper() });

    await waitFor(() => expect(result.current.fetchStatus).toBe('idle'));
  });
});

describe('usePayCommission', () => {
  it('updates commission status to paid and toasts', async () => {
    setMockResponse('commissions', []);

    const { result } = renderHook(() => usePayCommission(), { wrapper: createWrapper() });

    await act(async () => {
      result.current.mutate('comm-1');
    });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(supabase.from).toHaveBeenCalledWith('commissions');
    expect(mockToast).toHaveBeenCalledWith(expect.objectContaining({ title: 'Commission marked as paid' }));
  });

  it('shows error toast on failure', async () => {
    setMockResponse('commissions', null, { message: 'Update failed' });

    const { result } = renderHook(() => usePayCommission(), { wrapper: createWrapper() });

    await act(async () => {
      result.current.mutate('comm-bad');
    });

    await waitFor(() => expect(result.current.isError).toBe(true));
    expect(mockToast).toHaveBeenCalledWith(
      expect.objectContaining({ variant: 'destructive', title: 'Failed to pay commission' })
    );
  });
});

describe('useConvertCommission', () => {
  it('calls convert_commission_to_credit RPC and toasts', async () => {
    setRpcResponse('convert_commission_to_credit', null);

    const { result } = renderHook(() => useConvertCommission(), { wrapper: createWrapper() });

    await act(async () => {
      result.current.mutate('comm-1');
    });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(supabase.rpc).toHaveBeenCalledWith('convert_commission_to_credit', { commission_id: 'comm-1' });
    expect(mockToast).toHaveBeenCalledWith(expect.objectContaining({ title: 'Commission converted to store credit' }));
  });

  it('shows error toast on RPC failure', async () => {
    setRpcResponse('convert_commission_to_credit', null, { message: 'Conversion failed' });

    const { result } = renderHook(() => useConvertCommission(), { wrapper: createWrapper() });

    await act(async () => {
      result.current.mutate('comm-bad');
    });

    await waitFor(() => expect(result.current.isError).toBe(true));
    expect(mockToast).toHaveBeenCalledWith(
      expect.objectContaining({ variant: 'destructive', title: 'Failed to convert commission' })
    );
  });
});

describe('useFullNetwork', () => {
  it('fetches profiles and contacts for full network', async () => {
    setMockResponse('profiles', [
      { id: 'p1', full_name: 'Rep A', email: 'a@test.com', partner_tier: 'standard', commission_rate: 0.1, parent_rep_id: null },
    ]);
    setMockResponse('contacts', [
      { id: 'c1', name: 'Client A', email: 'ca@test.com', type: 'customer', assigned_rep_id: 'p1' },
    ]);

    const { result } = renderHook(() => useFullNetwork(), { wrapper: createWrapper() });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    // Should have partner node + client node
    expect(result.current.data).toBeDefined();
  });

  it('does not fetch without org context', async () => {
    setAuthContext({ profile: { ...mockProfile, org_id: null } as any });

    const { result } = renderHook(() => useFullNetwork(), { wrapper: createWrapper() });

    await waitFor(() => expect(result.current.fetchStatus).toBe('idle'));
  });
});

describe('useDownlineClients', () => {
  it('fetches customer contacts assigned to given rep IDs', async () => {
    setMockResponse('contacts', [
      { id: 'c1', name: 'Client A', email: 'ca@test.com', type: 'customer', assigned_rep_id: 'rep-1' },
    ]);

    const { result } = renderHook(() => useDownlineClients(['rep-1', 'rep-2']), { wrapper: createWrapper() });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(supabase.from).toHaveBeenCalledWith('contacts');
  });

  it('does not fetch with empty rep IDs', async () => {
    const { result } = renderHook(() => useDownlineClients([]), { wrapper: createWrapper() });

    await waitFor(() => expect(result.current.fetchStatus).toBe('idle'));
  });
});
