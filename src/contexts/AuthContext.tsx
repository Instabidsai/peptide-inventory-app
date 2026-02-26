import React, { createContext, useContext, useEffect, useState, useMemo, useSyncExternalStore } from 'react';
import { User, Session } from '@supabase/supabase-js';
import * as Sentry from '@sentry/react';
import { supabase } from '@/integrations/sb_client/client';
import { logger } from '@/lib/logger';

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
  signUp: (email: string, password: string, fullName: string) => Promise<{ error: Error | null }>;
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

  const fetchUserData = async (userId: string) => {
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
        const { data: { user: currentUser } } = await supabase.auth.getUser();
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

      // Auto-link: if profile has no org, check if their email matches an existing contact
      // Uses server-side RPC (SECURITY DEFINER) to bypass RLS — new users can't read contacts table
      if (profileData && !profileData.org_id && profileData.email) {
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

      setProfile(profileData);

      if (profileData?.org_id) {
        // Fetch user role
        const { data: roleData, error: roleError } = await supabase
          .from('user_roles')
          .select('*')
          .eq('user_id', userId)
          .eq('org_id', profileData.org_id)
          .maybeSingle();

        if (roleError) {
          const msg = `Failed to load user role: ${roleError.message}`;
          logger.error('AuthProvider:', msg);
          setAuthError(msg);
          setUserRole(null);
        } else {
          setUserRole(roleData);
        }

        // Fetch organization
        const { data: orgData, error: orgError } = await supabase
          .from('organizations')
          .select('*')
          .eq('id', profileData.org_id)
          .maybeSingle();

        if (orgError) {
          const msg = `Failed to load organization: ${orgError.message}`;
          logger.error('AuthProvider:', msg);
          setAuthError(msg);
          setOrganization(null);
        } else {
          setOrganization(orgData);
        }
      } else {
        setUserRole(null);
        setOrganization(null);
      }

      // Attach user context to Sentry for error attribution
      Sentry.setUser({ id: userId, email: profileData?.full_name || undefined });
      Sentry.setContext('app', {
        role: profileData?.role,
        org_id: profileData?.org_id,
        partner_tier: profileData?.partner_tier,
      });
    } catch (err) {
      const msg = (err as any)?.message || 'Unknown error loading user data';
      logger.error('AuthProvider: Unexpected error in fetchUserData:', msg);
      setAuthError(msg);
      setProfile(null);
      setUserRole(null);
      setOrganization(null);
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

        // Defer Supabase calls with setTimeout
        if (currentSession?.user) {
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
              .catch(e => logger.error("AuthProvider: OAuth User Data Fetch Failed", e))
              .finally(() => { if (mounted) setLoading(false); });
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
          .catch(e => logger.error("AuthProvider: User Data Fetch Failed", e))
          .finally(() => {
            if (mounted) setLoading(false);
          });
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

    if (error) return { error };

    // Create initial profile if signup successful
    if (data.user) {
      const { error: profileError } = await supabase
        .from('profiles')
        .upsert({
          user_id: data.user.id,
          email: email,
          full_name: fullName,
        }, { onConflict: 'user_id' });

      if (profileError) {
        logger.error('Error creating profile:', profileError);
      }
    }

    return { error: null };
  };

  const signOut = async () => {
    await supabase.auth.signOut();
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
    () => sessionStorage.getItem('impersonation') || '',
  );
  const imp = useMemo(() => {
    try { return impersonationSnapshot ? JSON.parse(impersonationSnapshot) as { orgId: string; orgName: string } : null; } catch { return null; }
  }, [impersonationSnapshot]);
  const isSuperAdmin = userRole?.role === 'super_admin';

  const effectiveOrg = useMemo(() => {
    if (imp?.orgId && isSuperAdmin) {
      return { id: imp.orgId, name: imp.orgName || 'Tenant' };
    }
    return organization;
  }, [imp, isSuperAdmin, organization]);

  const effectiveRole = useMemo(() => {
    if (imp?.orgId && isSuperAdmin && userRole) {
      return { ...userRole, org_id: imp.orgId, role: 'admin' as AppRole };
    }
    return userRole;
  }, [imp, isSuperAdmin, userRole]);

  const effectiveProfile = useMemo(() => {
    if (imp?.orgId && isSuperAdmin && profile) {
      return { ...profile, org_id: imp.orgId, role: 'admin' as AppRole };
    }
    return profile;
  }, [imp, isSuperAdmin, profile]);

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
