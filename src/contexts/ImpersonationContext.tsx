import React, { createContext, useContext, useState, useCallback } from 'react';

interface ImpersonationState {
  /** The org_id being impersonated, or null if not impersonating */
  orgId: string | null;
  /** The org name for display in the banner */
  orgName: string | null;
}

interface ImpersonationContextType extends ImpersonationState {
  /** Start impersonating a tenant */
  startImpersonation: (orgId: string, orgName: string) => void;
  /** Stop impersonating — return to super_admin view */
  stopImpersonation: () => void;
  /** Whether we're currently impersonating */
  isImpersonating: boolean;
}

const ImpersonationContext = createContext<ImpersonationContextType | undefined>(undefined);

const STORAGE_KEY = 'impersonation';

function loadFromSession(): ImpersonationState {
  try {
    const raw = sessionStorage.getItem(STORAGE_KEY);
    if (raw) return JSON.parse(raw);
  } catch { /* ignore */ }
  return { orgId: null, orgName: null };
}

function saveToSession(state: ImpersonationState) {
  if (state.orgId) {
    sessionStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  } else {
    sessionStorage.removeItem(STORAGE_KEY);
  }
  // Notify AuthContext (uses useSyncExternalStore on this event)
  window.dispatchEvent(new Event('impersonation-change'));
}

export function ImpersonationProvider({ children }: { children: React.ReactNode }) {
  const [state, setState] = useState<ImpersonationState>(loadFromSession);

  const startImpersonation = useCallback((orgId: string, orgName: string) => {
    const next = { orgId, orgName };
    setState(next);
    saveToSession(next);
  }, []);

  const stopImpersonation = useCallback(() => {
    const next = { orgId: null, orgName: null };
    setState(next);
    saveToSession(next);
  }, []);

  return (
    <ImpersonationContext.Provider value={{
      ...state,
      startImpersonation,
      stopImpersonation,
      isImpersonating: !!state.orgId,
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
