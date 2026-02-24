import { describe, it, expect, beforeEach, vi } from 'vitest';
import { renderHook, waitFor, act } from '@testing-library/react';
import { createWrapper } from '@/test/mocks/wrapper';
import { supabase, setMockResponse, resetMockResponses, mockProfile } from '@/test/mocks/supabase';
import { mockToast, resetToast } from '@/test/mocks/toast';
import { resetAuthContext, setAuthContext } from '@/test/mocks/auth';
import {
  useProfile,
  useReps,
  useRepProfile,
  useTeamMembers,
  useUpdateProfile,
} from '../use-profiles';

beforeEach(() => {
  vi.clearAllMocks();
  resetMockResponses();
  resetToast();
  resetAuthContext();
});

describe('useProfile', () => {
  it('fetches the current user profile', async () => {
    setMockResponse('profiles', mockProfile);

    const { result } = renderHook(() => useProfile(), { wrapper: createWrapper() });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(result.current.data).toEqual(mockProfile);
    expect(supabase.from).toHaveBeenCalledWith('profiles');
  });

  it('does not fetch when user is not authenticated', async () => {
    setAuthContext({ user: null as any });

    const { result } = renderHook(() => useProfile(), { wrapper: createWrapper() });

    await waitFor(() => expect(result.current.fetchStatus).toBe('idle'));
  });
});

describe('useReps', () => {
  it('fetches all sales reps for the org', async () => {
    const reps = [
      { ...mockProfile, id: 'rep-1', role: 'sales_rep', full_name: 'Rep One' },
      { ...mockProfile, id: 'rep-2', role: 'sales_rep', full_name: 'Rep Two' },
    ];
    setMockResponse('profiles', reps);

    const { result } = renderHook(() => useReps(), { wrapper: createWrapper() });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(result.current.data).toEqual(reps);
  });

  it('does not fetch without auth or org', async () => {
    setAuthContext({ user: null as any, profile: null as any });

    const { result } = renderHook(() => useReps(), { wrapper: createWrapper() });

    await waitFor(() => expect(result.current.fetchStatus).toBe('idle'));
  });
});

describe('useRepProfile', () => {
  it('fetches a specific rep profile by ID', async () => {
    const repProfile = { ...mockProfile, id: 'rep-1', role: 'sales_rep' };
    setMockResponse('profiles', repProfile);

    const { result } = renderHook(() => useRepProfile('rep-1'), { wrapper: createWrapper() });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(result.current.data).toEqual(repProfile);
  });

  it('does not fetch with null rep ID', async () => {
    const { result } = renderHook(() => useRepProfile(null), { wrapper: createWrapper() });

    await waitFor(() => expect(result.current.fetchStatus).toBe('idle'));
  });
});

describe('useTeamMembers', () => {
  it('fetches non-rep, non-admin profiles', async () => {
    const staff = [{ ...mockProfile, id: 'staff-1', role: 'staff' }];
    setMockResponse('profiles', staff);

    const { result } = renderHook(() => useTeamMembers(), { wrapper: createWrapper() });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(result.current.data).toEqual(staff);
  });
});

describe('useUpdateProfile', () => {
  it('updates a profile and toasts success', async () => {
    setMockResponse('profiles', [{ id: 'profile-123', full_name: 'Updated Name' }]);

    const { result } = renderHook(() => useUpdateProfile(), { wrapper: createWrapper() });

    await act(async () => {
      result.current.mutate({ id: 'profile-123', full_name: 'Updated Name' });
    });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(mockToast).toHaveBeenCalledWith(expect.objectContaining({ title: 'Profile updated' }));
  });

  it('throws when RLS blocks update (empty data returned)', async () => {
    setMockResponse('profiles', []);

    const { result } = renderHook(() => useUpdateProfile(), { wrapper: createWrapper() });

    await act(async () => {
      result.current.mutate({ id: 'blocked-id', full_name: 'Hacked' });
    });

    await waitFor(() => expect(result.current.isError).toBe(true));
    expect(result.current.error?.message).toContain('Update blocked');
  });

  it('shows error toast on failure', async () => {
    setMockResponse('profiles', null, { message: 'Constraint violation' });

    const { result } = renderHook(() => useUpdateProfile(), { wrapper: createWrapper() });

    await act(async () => {
      result.current.mutate({ id: 'profile-123', full_name: '' });
    });

    await waitFor(() => expect(result.current.isError).toBe(true));
    expect(mockToast).toHaveBeenCalledWith(
      expect.objectContaining({ variant: 'destructive', title: 'Update failed' })
    );
  });
});
