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
 */
export async function linkReferral(
  userId: string,
  email: string,
  fullName: string,
  referrerProfileId: string,
  role: 'customer' | 'partner' = 'customer',
): Promise<LinkReferralResult> {
  const { data, error } = await supabase.rpc('link_referral', {
    p_user_id: userId,
    p_email: email,
    p_full_name: fullName,
    p_referrer_profile_id: referrerProfileId,
    p_role: role,
  });

  if (error) {
    return { success: false, error: `RPC: ${error.code || 'ERR'} — ${error.message}` };
  }

  if (!data?.success) {
    return { success: false, error: data?.error || 'Unknown error' };
  }

  return { success: true, type: data.type as 'partner' | 'preferred' | 'customer' };
}

/**
 * Read + clear referral params from sessionStorage.
 * Returns null if no referral is stored.
 */
export function consumeSessionReferral(): { refId: string; role: 'customer' | 'partner' } | null {
  const refId = sessionStorage.getItem('partner_ref');
  if (!refId) return null;

  const role = (sessionStorage.getItem('partner_ref_role') || 'customer') as 'customer' | 'partner';
  sessionStorage.removeItem('partner_ref');
  sessionStorage.removeItem('partner_ref_role');

  return { refId, role };
}

/**
 * Persist referral params to sessionStorage (survives page reload / OAuth redirect).
 */
export function storeSessionReferral(refId: string, role: 'customer' | 'partner') {
  sessionStorage.setItem('partner_ref', refId);
  sessionStorage.setItem('partner_ref_role', role);
}
