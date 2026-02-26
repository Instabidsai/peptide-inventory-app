import { describe, it, expect, beforeEach, vi } from 'vitest';
import { renderHook, waitFor, act } from '@testing-library/react';
import { createWrapper } from '@/test/mocks/wrapper';
import { supabase, setRpcResponse, resetMockResponses } from '@/test/mocks/supabase';
import { mockToast, resetToast } from '@/test/mocks/toast';
import { resetAuthContext } from '@/test/mocks/auth';
import { useInviteRep } from '../use-invite';

beforeEach(() => {
  vi.clearAllMocks();
  resetMockResponses();
  resetToast();
  resetAuthContext();
});

describe('useInviteRep', () => {
  it('calls invite_new_rep RPC and toasts success', async () => {
    setRpcResponse('invite_new_rep', { success: true, new_user: true, contact_id: 'c-1', action_link: '', message: 'ok' });

    const { result } = renderHook(() => useInviteRep(), { wrapper: createWrapper() });

    await act(async () => {
      result.current.mutate({ email: 'newrep@test.com', fullName: 'New Rep' });
    });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(supabase.rpc).toHaveBeenCalledWith('invite_new_rep', expect.objectContaining({
      p_email: 'newrep@test.com',
      p_full_name: 'New Rep',
    }));
    expect(mockToast).toHaveBeenCalledWith(expect.objectContaining({ title: 'Invitation Sent' }));
  });

  it('passes parent_rep_id when provided', async () => {
    setRpcResponse('invite_new_rep', { success: true, new_user: true, contact_id: 'c-2', action_link: '', message: 'ok' });

    const { result } = renderHook(() => useInviteRep(), { wrapper: createWrapper() });

    await act(async () => {
      result.current.mutate({
        email: 'sub-rep@test.com',
        fullName: 'Sub Rep',
        parentRepId: 'parent-rep-1',
      });
    });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(supabase.rpc).toHaveBeenCalledWith('invite_new_rep', expect.objectContaining({
      p_parent_rep_id: 'parent-rep-1',
    }));
  });

  it('shows error toast when RPC returns failure', async () => {
    setRpcResponse('invite_new_rep', { success: false, message: 'Email already exists' });

    const { result } = renderHook(() => useInviteRep(), { wrapper: createWrapper() });

    await act(async () => {
      result.current.mutate({ email: 'dupe@test.com', fullName: 'Dupe' });
    });

    await waitFor(() => expect(result.current.isError).toBe(true));
    expect(mockToast).toHaveBeenCalledWith(
      expect.objectContaining({ variant: 'destructive', title: 'Invite Failed' })
    );
  });

  it('shows error toast when RPC invocation fails', async () => {
    setRpcResponse('invite_new_rep', null, { message: 'RPC timeout' });

    const { result } = renderHook(() => useInviteRep(), { wrapper: createWrapper() });

    await act(async () => {
      result.current.mutate({ email: 'fail@test.com', fullName: 'Fail' });
    });

    await waitFor(() => expect(result.current.isError).toBe(true));
    expect(mockToast).toHaveBeenCalledWith(
      expect.objectContaining({ variant: 'destructive', title: 'Invite Failed' })
    );
  });
});
