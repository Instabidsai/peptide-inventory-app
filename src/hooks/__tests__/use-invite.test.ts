import { describe, it, expect, beforeEach, vi } from 'vitest';
import { renderHook, waitFor, act } from '@testing-library/react';
import { createWrapper } from '@/test/mocks/wrapper';
import { supabase, setMockResponse, setFunctionResponse, resetMockResponses } from '@/test/mocks/supabase';
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
  it('invokes invite-user edge function and toasts success', async () => {
    setFunctionResponse('invite-user', { success: true, user_id: 'new-user-1', new_user: true });
    setMockResponse('profiles', []);

    const { result } = renderHook(() => useInviteRep(), { wrapper: createWrapper() });

    await act(async () => {
      result.current.mutate({ email: 'newrep@test.com', fullName: 'New Rep' });
    });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(supabase.functions.invoke).toHaveBeenCalledWith('invite-user', expect.objectContaining({
      body: expect.objectContaining({ email: 'newrep@test.com', role: 'sales_rep' }),
    }));
    expect(mockToast).toHaveBeenCalledWith(expect.objectContaining({ title: 'Invitation Sent' }));
  });

  it('updates profile with parent_rep_id when provided', async () => {
    setFunctionResponse('invite-user', { success: true, user_id: 'new-user-2', new_user: true });
    setMockResponse('profiles', []);

    const { result } = renderHook(() => useInviteRep(), { wrapper: createWrapper() });

    await act(async () => {
      result.current.mutate({
        email: 'sub-rep@test.com',
        fullName: 'Sub Rep',
        parentRepId: 'parent-rep-1',
      });
    });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    // Profile update should be called for name and parent
    expect(supabase.from).toHaveBeenCalledWith('profiles');
  });

  it('shows error toast when edge function returns failure', async () => {
    setFunctionResponse('invite-user', { success: false, error: 'Email already exists' });

    const { result } = renderHook(() => useInviteRep(), { wrapper: createWrapper() });

    await act(async () => {
      result.current.mutate({ email: 'dupe@test.com', fullName: 'Dupe' });
    });

    await waitFor(() => expect(result.current.isError).toBe(true));
    expect(mockToast).toHaveBeenCalledWith(
      expect.objectContaining({ variant: 'destructive', title: 'Invite Failed' })
    );
  });

  it('shows error toast when edge function invocation fails', async () => {
    setFunctionResponse('invite-user', null, { message: 'Edge function timeout' });

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
