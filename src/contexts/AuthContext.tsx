import React, { createContext, useContext, useEffect, useState, useRef, useMemo, useSyncExternalStore } from 'react';
import { User, Session } from '@supabase/supabase-js';
import * as Sentry from '@sentry/react';
import { supabase } from '@/integrations/sb_client/client';
import { logger } from '@/lib/logger';
import { hasPendingReferral } from '@/lib/link-referral';

type AppRole = 'admin' | 'staff' | 'fulfillment' | 'viewer' | 'client' | 'customer' | 'sales_rep' | 'super_admin';

interface Profile {
  id: string;
  user_id: string;
  org_id: string | null;
  full_name: string | null;
  email: string | null;
  role: AppRole;
  overhead_per_unit: number;
  credit_balance?: number;
  partner_tier?: string;
  commission_rate?: number;
  price_multiplier?: number;
  pricing_mode?: string;
  cost_plus_markup?: number;
  parent_rep_id?: string | null;
  can_recruit?: boolean | null;
}

interface UserRole {
  id: string;
  user_id: string;
  org_id: string;
  role: AppRole;
}

interface Organization {
  id: string;
  name: string;
}

interface AuthContextType {
  user: User | null;
  session: Session | null;
  profile: Profile | null;
  userRole: UserRole | null;
  organization: Organization | null;
  loading: boolean;
  authError: string | null;
  signIn: (email: string, password: string) => Promise<{ error: Error | null }>;
  signUp: (email: string, password: string, fullName: string) => Promise<{ error: Error | null; user: User | null }>;
  signOut: () => Promise<void>;
  refreshProfile: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [session, setSession] = useState<Session | null>(null);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [userRole, setUserRole] = useState<UserRole | null>(null);
  const [organization, setOrganization] = useState<Organization | null>(null);
  const [loading, setLoading] = useState(true);
  const [authError, setAuthError] = useState<string | null>(null);
  // Generation counter prevents stale fetchUserData calls from overwriting fresh data.
  // When signUp triggers onAuthStateChange (deferred via setTimeout) AND handleSignup
  // calls refreshProfile, two fetchUserData calls race. Without this, the stale one
  // (pre-linkReferral, no org_id) can overwrite the fresh one (post-linkReferral, has org_id).
  const fetchGeneration = useRef(0);

  const fetchUserData = async (userId: string) => {
    const thisGeneration = ++fetchGeneration.current;
    try {
      setAuthError(null);

      // Fetch profile
      const profileResult = await supabase
        .from('profiles')
        .select('*')
        .eq('user_id', userId)
        .maybeSingle();
      let profileData = profileResult.data;
      const profileError = profileResult.error;

      if (profileError) {
        const msg = `Failed to load user profile: ${profileError.message}`;
        logger.error('AuthProvider:', msg);
        setAuthError(msg);
        setProfile(null);
        setUserRole(null);
        setOrganization(null);
        return;
      }

      // Auto-create profile if missing (Google OAuth, failed signup insert, etc.)
      if (!profileData) {
        const { data: { user: currentUser }, error: getUserError } = await supabase.auth.getUser();
        if (getUserError) {
          logger.error('AuthProvider: getUser failed (stale session?)', getUserError.message);
          await supabase.auth.signOut();
          setProfile(null);
          setUserRole(null);
          setOrganization(null);
          return;
        }
        if (currentUser) {
          const meta = currentUser.user_metadata || {};
          const { data: newProfile } = await supabase
            .from('profiles')
            .upsert({
              user_id: userId,
              email: currentUser.email,
              full_name: meta.full_name || meta.name || null,
            }, { onConflict: 'user_id' })
            .select()
            .maybeSingle();

          if (newProfile) {
            profileData = newProfile;
          }
        }
      }

      // Auto-link: if profile has no org, check if their email matches an existing contact.
      // Uses server-side RPC (SECURITY DEFINER) to bypass RLS — new users can't read contacts table.
      // IMPORTANT: Skip this when a referral is pending — link_referral sets more fields
      // (parent_rep_id, pricing, tier, etc.) and must be the single authority.
      if (profileData && !profileData.org_id && profileData.email && !hasPendingReferral()) {
        const { data: linkResult } = await supabase.rpc('auto_link_contact_by_email', {
          p_user_id: userId,
          p_email: profileData.email,
        });

        if (linkResult?.matched) {
          // Re-fetch profile with the new org_id
          const { data: updatedProfile } = await supabase
            .from('profiles')
            .select('*')
            .eq('user_id', userId)
            .maybeSingle();

          if (updatedProfile) {
            profileData = updatedProfile;
          }
        }
      }

      // Stale-call guard: if a newer fetchUserData was started while we were awaiting,
      // discard this result to prevent overwriting fresher data (e.g. post-linkReferral
      // profile with org_id being overwritten by pre-linkReferral stale profile without it).
      if (thisGeneration !== fetchGeneration.current) {
        logger.info(`AuthProvider: Discarding stale fetchUserData (gen ${thisGeneration}, current ${fetchGeneration.current})`);
        return;
      }

      setProfile(profileData);

      if (profileData?.org_id) {
        const [roleResult, orgResult] = await Promise.all([
          supabase.from('user_roles').select('*').eq('user_id', userId).eq('org_id', profileData.org_id).maybeSingle(),
          supabase.from('organizations').select('*').eq('id', profileData.org_id).maybeSingle(),
        ]);

        // Re-check generation after second round of async fetches
        if (thisGeneration !== fetchGeneration.current) {
          logger.info(`AuthProvider: Discarding stale fetchUserData (gen ${thisGeneration}, current ${fetchGeneration.current})`);
          return;
        }

        if (roleResult.error) {
          const msg = `Failed to load user role: ${roleResult.error.message}`;
          logger.error('AuthProvider:', msg);
          setAuthError(msg);
          setUserRole(null);
        } else {
          setUserRole(roleResult.data);
        }

        if (orgResult.error) {
          const msg = `Failed to load organization: ${orgResult.error.message}`;
          logger.error('AuthProvider:', msg);
          setAuthError(msg);
          setOrganization(null);
        } else {
          setOrganization(orgResult.data);
        }
      } else {
        setUserRole(null);
        setOrganization(null);
      }

      // Attach user context to Sentry for error attribution
      Sentry.setUser({ id: userId, email: profileData?.email || profileData?.full_name || undefined });
      Sentry.setTag('user_role', profileData?.role || 'unknown');
      Sentry.setTag('org_id', profileData?.org_id || 'none');
      Sentry.setTag('partner_tier', profileData?.partner_tier || 'none');
      Sentry.setContext('app', {
        role: profileData?.role,
        org_id: profileData?.org_id,
        partner_tier: profileData?.partner_tier,
      });
    } catch (err) {
      // Don't overwrite state if a newer call has started
      if (thisGeneration !== fetchGeneration.current) return;
      const msg = (err as any)?.message || 'Unknown error loading user data';
      logger.error('AuthProvider: Unexpected error in fetchUserData:', msg);
      setAuthError(msg);
      setProfile(null);
      setUserRole(null);
      setOrganization(null);
    } finally {
      // Only set loading=false if this is still the latest call.
      // A stale call setting loading=false prematurely would cause ProtectedRoute
      // to render with no profile, bouncing the user to /onboarding.
      if (thisGeneration === fetchGeneration.current) {
        setLoading(false);
      }
    }
  };

  const refreshProfile = async () => {
    if (user) {
      await fetchUserData(user.id);
    }
  };

  useEffect(() => {
    let mounted = true;

    // Set up auth state listener FIRST
    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      (event, currentSession) => {
        if (!mounted) return;
        setSession(currentSession);
        setUser(currentSession?.user ?? null);

        // Defer Supabase calls with setTimeout to avoid auth deadlocks.
        // Set loading=true so downstream consumers (Auth.tsx) wait for profile.
        if (currentSession?.user) {
          setLoading(true);
          setTimeout(() => {
            if (mounted) fetchUserData(currentSession.user.id);
          }, 0);
        } else {
          setProfile(null);
          setUserRole(null);
          setOrganization(null);
          setLoading(false);
        }
      }
    );

    // THEN check for existing session
    supabase.auth.getSession().then(async ({ data: { session: existingSession }, error }) => {
      if (!mounted) return;
      if (error) logger.error("AuthProvider: GetSession Error", error);

      // If no existing session, check for intercepted OAuth tokens
      // (see main.tsx OAuth Hash Interceptor — stashed before HashRouter renders)
      if (!existingSession) {
        const accessToken = sessionStorage.getItem('sb_oauth_access_token');
        const refreshToken = sessionStorage.getItem('sb_oauth_refresh_token');

        if (accessToken && refreshToken) {
          sessionStorage.removeItem('sb_oauth_access_token');
          sessionStorage.removeItem('sb_oauth_refresh_token');

          const { data: restored, error: setErr } = await supabase.auth.setSession({
            access_token: accessToken,
            refresh_token: refreshToken,
          });

          if (!mounted) return;

          if (restored.session) {
            setSession(restored.session);
            setUser(restored.session.user);
            fetchUserData(restored.session.user.id)
              .catch(e => logger.error("AuthProvider: OAuth User Data Fetch Failed", e));
            return;
          }

          if (setErr) {
            logger.error("AuthProvider: Failed to restore OAuth session", setErr);
          }
        }
      }

      setSession(existingSession);
      setUser(existingSession?.user ?? null);

      if (existingSession?.user) {
        fetchUserData(existingSession.user.id)
          .catch(e => logger.error("AuthProvider: User Data Fetch Failed", e));
      } else {
        setLoading(false);
      }
    });

    return () => {
      mounted = false;
      subscription.unsubscribe();
    };
  }, []);

  const signIn = async (email: string, password: string) => {
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    return { error };
  };

  const signUp = async (email: string, password: string, fullName: string) => {
    const redirectUrl = `${window.location.origin}/`;

    const { data, error } = await supabase.auth.signUp({
      email,
      password,
      options: {
        emailRedirectTo: redirectUrl,
        data: {
          full_name: fullName,
        },
      },
    });

    if (error) return { error, user: null };

    // Profile is auto-created by the handle_new_user DB trigger (SECURITY DEFINER).
    // No client-side upsert needed — it would fail with RLS 42501 before email confirmation.

    return { error: null, user: data.user };
  };

  const signOut = async () => {
    // If impersonating, restore admin session instead of signing out
    const backup = localStorage.getItem('admin_session_backup');
    if (backup) {
      try {
        const { access_token, refresh_token } = JSON.parse(backup);
        localStorage.removeItem('admin_session_backup');
        sessionStorage.removeItem('view_as_user');
        window.dispatchEvent(new Event('impersonation-change'));
        await supabase.auth.setSession({ access_token, refresh_token });
        return; // onAuthStateChange will re-fetch admin profile
      } catch {
        localStorage.removeItem('admin_session_backup');
      }
    }

    // Use scope:'local' to skip the server call — avoids 403 when session is already expired
    await supabase.auth.signOut({ scope: 'local' });
    setProfile(null);
    setUserRole(null);
    setOrganization(null);
    Sentry.setUser(null);
    window.location.hash = '#/auth';
  };

  // Impersonation: read from sessionStorage (set by ImpersonationContext)
  // useSyncExternalStore keeps this reactive when impersonation changes
  const impersonationSnapshot = useSyncExternalStore(
    (cb) => { window.addEventListener('impersonation-change', cb); return () => window.removeEventListener('impersonation-change', cb); },
    () => (sessionStorage.getItem('impersonation') || '') + '|' + (sessionStorage.getItem('view_as_user') || ''),
  );
  const imp = useMemo(() => {
    try {
      const parts = impersonationSnapshot.split('|');
      const orgRaw = parts[0];
      const viewAsRaw = parts[1];
      return {
        org: orgRaw ? JSON.parse(orgRaw) as { orgId: string; orgName: string } : null,
        viewAs: viewAsRaw ? JSON.parse(viewAsRaw) as { userId: string; profileId: string; name: string; role: string; contactId?: string } : null,
      };
    } catch { return { org: null, viewAs: null }; }
  }, [impersonationSnapshot]);
  const isSuperAdmin = userRole?.role === 'super_admin';

  const effectiveOrg = useMemo(() => {
    if (imp.org?.orgId && isSuperAdmin) {
      return { id: imp.org.orgId, name: imp.org.orgName || 'Tenant' };
    }
    return organization;
  }, [imp.org, isSuperAdmin, organization]);

  const effectiveRole = useMemo(() => {
    // Org-level impersonation: force admin role (super_admin viewing tenant)
    if (imp.org?.orgId && isSuperAdmin && userRole) {
      return { ...userRole, org_id: imp.org.orgId, role: 'admin' as AppRole };
    }
    // User-level impersonation: JWT is swapped — userRole is already the target's role
    return userRole;
  }, [imp.org, isSuperAdmin, userRole]);

  const effectiveProfile = useMemo(() => {
    // Org-level impersonation: force admin role + swap org_id
    if (imp.org?.orgId && isSuperAdmin && profile) {
      return { ...profile, org_id: imp.org.orgId, role: 'admin' as AppRole };
    }
    // User-level impersonation: JWT is swapped — profile is already the target's profile
    return profile;
  }, [imp.org, isSuperAdmin, profile]);

  return (
    <AuthContext.Provider
      value={{
        user,
        session,
        profile: effectiveProfile,
        userRole: effectiveRole,
        organization: effectiveOrg,
        loading,
        authError,
        signIn,
        signUp,
        signOut,
        refreshProfile,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
}

export function useAuthOptional(): AuthContextType | null {
  return useContext(AuthContext) ?? null;
}
