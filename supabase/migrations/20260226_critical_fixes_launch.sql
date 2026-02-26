-- CRITICAL LAUNCH FIXES (Feb 26, 2026)
-- 1. Add missing created_by column to contacts (invite_new_rep crashes without it)
-- 2. Fix convert_commission_to_credit to accept 'available' status (UI allows it, RPC rejects it)
-- 3. Drop old create_validated_order overload that has stale commission logic

-- ═══════════════════════════════════════════
-- FIX 1: contacts.created_by column missing
-- ═══════════════════════════════════════════
ALTER TABLE public.contacts ADD COLUMN IF NOT EXISTS created_by UUID;

-- ═══════════════════════════════════════════
-- FIX 2: convert_commission_to_credit status mismatch
-- UI checks status !== 'available' (allows 'available' through)
-- RPC checked status != 'pending' (rejects 'available')
-- Fix: accept both 'pending' and 'available'
-- ═══════════════════════════════════════════
CREATE OR REPLACE FUNCTION public.convert_commission_to_credit(commission_id UUID)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    v_amount DECIMAL;
    v_partner_id UUID;
    v_status TEXT;
BEGIN
    -- 1. Get commission details and lock the row
    SELECT amount, partner_id, status
    INTO v_amount, v_partner_id, v_status
    FROM public.commissions
    WHERE id = commission_id
    FOR UPDATE;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'Commission not found';
    END IF;

    IF v_status NOT IN ('pending', 'available') THEN
        RAISE EXCEPTION 'Commission is not available for conversion (status: %)', v_status;
    END IF;

    -- 2. Update commission status to 'paid'
    UPDATE public.commissions
    SET status = 'paid'
    WHERE id = commission_id;

    -- 3. Update profile credit balance
    UPDATE public.profiles
    SET credit_balance = COALESCE(credit_balance, 0) + v_amount
    WHERE id = v_partner_id;
END;
$$;

-- ═══════════════════════════════════════════
-- FIX 3: Drop old create_validated_order overload
-- Old signature: (p_items, p_shipping_address, p_notes, p_payment_method, p_delivery_method)
-- New signature: (p_items, p_shipping_address, p_notes, p_delivery_method, p_contact_id)
-- The old overload has stale commission logic (no partner self-order fix)
-- ═══════════════════════════════════════════
DROP FUNCTION IF EXISTS public.create_validated_order(JSONB, TEXT, TEXT, TEXT, TEXT);
