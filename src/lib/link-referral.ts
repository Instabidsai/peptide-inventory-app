import { supabase } from '@/integrations/sb_client/client';

/** Default partner tier settings for referral signups */
export const REFERRAL_PARTNER_DEFAULTS = {
  partner_tier: 'associate' as const,
  commission_rate: 0.075,
  price_multiplier: 0.75,
};

export type LinkReferralResult =
  | { success: true; type: 'partner' | 'customer' }
  | { success: false; error: string };

/**
 * Link a user to a partner's org via referral.
 * Creates/updates profile, user_role, and contact record.
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
  // 1. Look up referrer's profile for org_id
  const { data: referrer, error: referrerErr } = await supabase
    .from('profiles')
    .select('id, org_id')
    .eq('id', referrerProfileId)
    .maybeSingle();

  if (referrerErr || !referrer?.org_id) {
    return { success: false, error: 'Referrer not found or has no organization' };
  }

  const isPartner = role === 'partner';
  const appRole = isPartner ? 'sales_rep' : 'client';

  // 2. Update new user's profile
  const profileUpdate: Record<string, unknown> = {
    org_id: referrer.org_id,
    parent_rep_id: referrer.id,
    role: appRole,
  };
  if (isPartner) {
    profileUpdate.partner_tier = REFERRAL_PARTNER_DEFAULTS.partner_tier;
    profileUpdate.commission_rate = REFERRAL_PARTNER_DEFAULTS.commission_rate;
    profileUpdate.price_multiplier = REFERRAL_PARTNER_DEFAULTS.price_multiplier;
  }

  const { error: profileErr } = await supabase
    .from('profiles')
    .update(profileUpdate)
    .eq('user_id', userId);

  if (profileErr) {
    console.error('linkReferral: profile update failed', profileErr);
    return { success: false, error: profileErr.message };
  }

  // 3. Create user_role
  const { error: roleErr } = await supabase.from('user_roles').upsert({
    user_id: userId,
    org_id: referrer.org_id,
    role: appRole,
  }, { onConflict: 'user_id,org_id' });

  if (roleErr) {
    console.error('linkReferral: user_role upsert failed', roleErr);
  }

  // 4. Create contact record linked to referrer (idempotent)
  const { data: existingContact } = await supabase
    .from('contacts')
    .select('id')
    .eq('linked_user_id', userId)
    .eq('org_id', referrer.org_id)
    .maybeSingle();

  if (!existingContact) {
    await supabase.from('contacts').insert({
      name: fullName || email,
      email,
      type: isPartner ? 'partner' : 'customer',
      org_id: referrer.org_id,
      assigned_rep_id: referrer.id,
      linked_user_id: userId,
    });
  }

  return { success: true, type: isPartner ? 'partner' : 'customer' };
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
