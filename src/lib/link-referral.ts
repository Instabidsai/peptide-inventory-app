import { supabase } from '@/integrations/sb_client/client';

/** Default partner tier settings for referral signups.
 *  NOTE: The actual pricing is set by the link_referral RPC
 *  (cost_multiplier mode, markup=2). These are display-only defaults. */
export const REFERRAL_PARTNER_DEFAULTS = {
  partner_tier: 'standard' as const,
  commission_rate: 0.10,
  price_multiplier: 2.0,
  pricing_mode: 'cost_multiplier' as const,
  cost_plus_markup: 2,
};

export type LinkReferralResult =
  | { success: true; type: 'partner' | 'preferred' | 'customer' }
  | { success: false; error: string };

/**
 * Link a user to a partner's org via referral.
 * Uses a SECURITY DEFINER RPC so the new user can read the referrer's
 * profile and create contacts regardless of RLS restrictions.
 *
 * Single source of truth — used by Auth.tsx, Onboarding.tsx, and any
 * other flow that needs to connect a new user to a referrer.
 *
 * @param orgId  Optional target org. When a super_admin impersonates a tenant
 *               and shares a referral link, the URL includes the target org_id.
 *               If provided, the RPC uses this org instead of the referrer's.
 */
export async function linkReferral(
  userId: string,
  email: string,
  fullName: string,
  referrerProfileId: string,
  role: 'customer' | 'partner' = 'customer',
  orgId?: string | null,
): Promise<LinkReferralResult> {
  const params: Record<string, unknown> = {
    p_user_id: userId,
    p_email: email,
    p_full_name: fullName,
    p_referrer_profile_id: referrerProfileId,
    p_role: role,
  };

  // Only send p_org_id if we actually have one (keeps backward compat with older RPC)
  if (orgId) {
    params.p_org_id = orgId;
  }

  const { data, error } = await supabase.rpc('link_referral', params);

  if (error) {
    return { success: false, error: `RPC: ${error.code || 'ERR'} — ${error.message}` };
  }

  if (!data?.success) {
    return { success: false, error: data?.error || 'Unknown error' };
  }

  return { success: true, type: data.type as 'partner' | 'preferred' | 'customer' };
}

const LS_KEY = 'pending_referral';
const REFERRAL_TTL = 24 * 60 * 60 * 1000; // 24 hours

interface ReferralData {
  refId: string;
  role: 'customer' | 'partner';
  orgId?: string | null;
}

/**
 * Read + clear referral params from sessionStorage (or localStorage fallback).
 * Returns null if no referral is stored.
 *
 * Falls back to localStorage to survive cross-tab email confirmation clicks.
 */
export function consumeSessionReferral(): ReferralData | null {
  let refId = sessionStorage.getItem('partner_ref');
  let role = (sessionStorage.getItem('partner_ref_role') || 'customer') as 'customer' | 'partner';
  let orgId = sessionStorage.getItem('partner_ref_org') || null;

  if (!refId) {
    // Fall back to localStorage (persists across tabs/windows)
    const backup = localStorage.getItem(LS_KEY);
    if (backup) {
      try {
        const parsed = JSON.parse(backup);
        if (parsed.refId && Date.now() - (parsed.ts || 0) < REFERRAL_TTL) {
          refId = parsed.refId;
          role = (parsed.role || 'customer') as 'customer' | 'partner';
          orgId = parsed.orgId || null;
        }
      } catch { /* ignore corrupt data */ }
      localStorage.removeItem(LS_KEY);
    }
  }

  if (!refId) return null;

  sessionStorage.removeItem('partner_ref');
  sessionStorage.removeItem('partner_ref_role');
  sessionStorage.removeItem('partner_ref_org');
  localStorage.removeItem(LS_KEY);

  return { refId, role, orgId };
}

/**
 * Persist referral params to sessionStorage AND localStorage backup.
 * sessionStorage survives page reload / OAuth redirect within the same tab.
 * localStorage survives cross-tab navigation (email confirmation in new tab).
 */
export function storeSessionReferral(refId: string, role: 'customer' | 'partner', orgId?: string | null) {
  sessionStorage.setItem('partner_ref', refId);
  sessionStorage.setItem('partner_ref_role', role);
  if (orgId) {
    sessionStorage.setItem('partner_ref_org', orgId);
  } else {
    sessionStorage.removeItem('partner_ref_org');
  }
  // Backup to localStorage for cross-tab persistence (with TTL)
  localStorage.setItem(LS_KEY, JSON.stringify({ refId, role, orgId: orgId || null, ts: Date.now() }));
}

/**
 * Check if there's a pending referral in either storage.
 * Used by AuthContext to skip auto_link_contact_by_email when a referral is pending.
 */
export function hasPendingReferral(): boolean {
  if (sessionStorage.getItem('partner_ref')) return true;
  const backup = localStorage.getItem(LS_KEY);
  if (backup) {
    try {
      const parsed = JSON.parse(backup);
      return !!(parsed.refId && Date.now() - (parsed.ts || 0) < REFERRAL_TTL);
    } catch { return false; }
  }
  return false;
}

/**
 * Non-destructive read of pending referral from sessionStorage + localStorage.
 * Unlike consumeSessionReferral, this does NOT remove the data.
 * Used by Auth.tsx and ProtectedRoute to detect referrals without consuming them.
 */
export function peekPendingReferral(): ReferralData | null {
  const ss = sessionStorage.getItem('partner_ref');
  if (ss) {
    return {
      refId: ss,
      role: (sessionStorage.getItem('partner_ref_role') || 'customer') as 'customer' | 'partner',
      orgId: sessionStorage.getItem('partner_ref_org') || null,
    };
  }
  const backup = localStorage.getItem(LS_KEY);
  if (backup) {
    try {
      const parsed = JSON.parse(backup);
      if (parsed.refId && Date.now() - (parsed.ts || 0) < REFERRAL_TTL) {
        return {
          refId: parsed.refId,
          role: (parsed.role || 'customer') as 'customer' | 'partner',
          orgId: parsed.orgId || null,
        };
      }
    } catch { /* ignore */ }
  }
  return null;
}
