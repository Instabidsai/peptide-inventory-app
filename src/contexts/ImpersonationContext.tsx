import React, { createContext, useContext, useState, useCallback, useEffect } from 'react';
import { supabase } from '@/integrations/sb_client/client';
import { invokeEdgeFunction } from '@/lib/edge-functions';
import { useQueryClient } from '@tanstack/react-query';

interface ViewAsUser {
  /** The target user's auth user_id (from profiles.user_id / contacts.linked_user_id) */
  userId: string;
  /** The target user's profile.id (PK of profiles table) */
  profileId: string;
  /** Display name for banner */
  name: string;
  /** The target user's role */
  role: string;
  /** The contact ID that triggered this (for "back" navigation) */
  contactId?: string;
}

interface AdminSessionBackup {
  access_token: string;
  refresh_token: string;
  viewAsUser: ViewAsUser;
}

interface ImpersonationState {
  /** The org_id being impersonated, or null if not impersonating */
  orgId: string | null;
  /** The org name for display in the banner */
  orgName: string | null;
  /** User-level impersonation: admin viewing as a specific customer/partner */
  viewAsUser: ViewAsUser | null;
}

interface ImpersonationContextType extends ImpersonationState {
  /** Start impersonating a tenant (super_admin only) */
  startImpersonation: (orgId: string, orgName: string) => void;
  /** Stop impersonating — return to super_admin view */
  stopImpersonation: () => void;
  /** Whether we're currently impersonating an org */
  isImpersonating: boolean;
  /** Start viewing as a specific user (admin only) — swaps JWT session */
  startViewAsUser: (user: ViewAsUser) => Promise<void>;
  /** Stop viewing as user — restores admin JWT session */
  stopViewAsUser: () => Promise<void>;
  /** Whether we're currently viewing as a specific user */
  isViewingAsUser: boolean;
  /** Whether a session swap is in progress */
  isSwapping: boolean;
}

const ImpersonationContext = createContext<ImpersonationContextType | undefined>(undefined);

const STORAGE_KEY = 'impersonation';
const VIEW_AS_STORAGE_KEY = 'view_as_user';
const ADMIN_BACKUP_KEY = 'admin_session_backup';

function loadFromSession(): ImpersonationState {
  let orgState = { orgId: null as string | null, orgName: null as string | null };
  let viewAsUser: ViewAsUser | null = null;
  try {
    const raw = sessionStorage.getItem(STORAGE_KEY);
    if (raw) orgState = JSON.parse(raw);
  } catch { /* ignore */ }
  try {
    const raw = sessionStorage.getItem(VIEW_AS_STORAGE_KEY);
    if (raw) viewAsUser = JSON.parse(raw);
  } catch { /* ignore */ }
  return { ...orgState, viewAsUser };
}

function saveOrgToSession(orgId: string | null, orgName: string | null) {
  if (orgId) {
    sessionStorage.setItem(STORAGE_KEY, JSON.stringify({ orgId, orgName }));
  } else {
    sessionStorage.removeItem(STORAGE_KEY);
  }
  window.dispatchEvent(new Event('impersonation-change'));
}

function saveViewAsToSession(viewAsUser: ViewAsUser | null) {
  if (viewAsUser) {
    sessionStorage.setItem(VIEW_AS_STORAGE_KEY, JSON.stringify(viewAsUser));
  } else {
    sessionStorage.removeItem(VIEW_AS_STORAGE_KEY);
  }
  window.dispatchEvent(new Event('impersonation-change'));
}

export function ImpersonationProvider({ children }: { children: React.ReactNode }) {
  const [state, setState] = useState<ImpersonationState>(loadFromSession);
  const [isSwapping, setIsSwapping] = useState(false);
  const queryClient = useQueryClient();

  // Orphan detection: if we have a backup but no active viewAs, restore admin session
  useEffect(() => {
    const raw = localStorage.getItem(ADMIN_BACKUP_KEY);
    if (!raw) return;
    const viewAsRaw = sessionStorage.getItem(VIEW_AS_STORAGE_KEY);
    if (viewAsRaw) return; // Active impersonation — don't restore

    // Orphaned backup — restore admin session silently
    try {
      const backup: AdminSessionBackup = JSON.parse(raw);
      supabase.auth.setSession({
        access_token: backup.access_token,
        refresh_token: backup.refresh_token,
      }).then(() => {
        localStorage.removeItem(ADMIN_BACKUP_KEY);
        queryClient.clear();
      });
    } catch {
      localStorage.removeItem(ADMIN_BACKUP_KEY);
    }
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const startImpersonation = useCallback((orgId: string, orgName: string) => {
    // Clear any user-level impersonation when switching orgs
    saveViewAsToSession(null);
    const next = { orgId, orgName, viewAsUser: null };
    setState(next);
    saveOrgToSession(orgId, orgName);
  }, []);

  const stopImpersonation = useCallback(() => {
    saveViewAsToSession(null);
    const next = { orgId: null, orgName: null, viewAsUser: null };
    setState(next);
    saveOrgToSession(null, null);
  }, []);

  const startViewAsUser = useCallback(async (user: ViewAsUser) => {
    setIsSwapping(true);
    try {
      // 1. Get current admin session to back up
      const { data: { session: adminSession } } = await supabase.auth.getSession();
      if (!adminSession) throw new Error('No active session — please sign in first');

      // 2. Call edge function to mint target user's session
      const { data, error } = await invokeEdgeFunction<{
        access_token: string;
        refresh_token: string;
      }>('admin-impersonate', { targetUserId: user.userId });

      if (error || !data) {
        throw new Error(error?.message || 'Failed to impersonate user');
      }

      // 3. Back up admin session to localStorage (survives tab close)
      const backup: AdminSessionBackup = {
        access_token: adminSession.access_token,
        refresh_token: adminSession.refresh_token,
        viewAsUser: user,
      };
      localStorage.setItem(ADMIN_BACKUP_KEY, JSON.stringify(backup));

      // 4. Clear TanStack Query cache BEFORE swapping (prevents stale admin data)
      queryClient.clear();

      // 5. Swap to target user's session — triggers onAuthStateChange in AuthContext
      const { error: setErr } = await supabase.auth.setSession({
        access_token: data.access_token,
        refresh_token: data.refresh_token,
      });

      if (setErr) throw new Error(`Session swap failed: ${setErr.message}`);

      // 6. Update impersonation state + sessionStorage
      setState(prev => ({ ...prev, viewAsUser: user }));
      saveViewAsToSession(user);
    } finally {
      setIsSwapping(false);
    }
  }, [queryClient]);

  const stopViewAsUser = useCallback(async () => {
    setIsSwapping(true);
    try {
      // 1. Read admin session backup
      const raw = localStorage.getItem(ADMIN_BACKUP_KEY);
      if (!raw) throw new Error('No admin session backup found');

      const backup: AdminSessionBackup = JSON.parse(raw);

      // 2. Clear TanStack Query cache BEFORE swapping
      queryClient.clear();

      // 3. Restore admin session
      const { error: setErr } = await supabase.auth.setSession({
        access_token: backup.access_token,
        refresh_token: backup.refresh_token,
      });

      if (setErr) throw new Error(`Session restore failed: ${setErr.message}`);

      // 4. Clean up backup + state
      localStorage.removeItem(ADMIN_BACKUP_KEY);
      setState(prev => ({ ...prev, viewAsUser: null }));
      saveViewAsToSession(null);
    } finally {
      setIsSwapping(false);
    }
  }, [queryClient]);

  return (
    <ImpersonationContext.Provider value={{
      ...state,
      startImpersonation,
      stopImpersonation,
      isImpersonating: !!state.orgId,
      startViewAsUser,
      stopViewAsUser,
      isViewingAsUser: !!state.viewAsUser,
      isSwapping,
    }}>
      {children}
    </ImpersonationContext.Provider>
  );
}

export function useImpersonation() {
  const ctx = useContext(ImpersonationContext);
  if (!ctx) throw new Error('useImpersonation must be used within ImpersonationProvider');
  return ctx;
}
