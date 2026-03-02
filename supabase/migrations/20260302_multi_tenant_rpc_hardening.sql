-- ═══════════════════════════════════════════════════════════════════════════════
-- Migration: 20260302_multi_tenant_rpc_hardening.sql
-- Date: 2026-03-02
-- Purpose: Harden all SECURITY DEFINER RPCs for multi-tenant (per-org) isolation.
--
-- Fixes:
--   1. get_partner_downline — add org_id guard to recursive CTE
--   2. apply_commissions_to_owed — add org_id filter on commissions + movements
--   3. convert_commission_to_credit — add ownership/org verification + fix status check
--   4. process_sale_commission — merge 3rd-tier support + org_id on INSERT
-- ═══════════════════════════════════════════════════════════════════════════════


-- ═══════════════════════════════════════════════════════════════════════════════
-- FIX #1: get_partner_downline — constrain to root profile's org_id
-- Without this, a corrupted parent pointer could leak cross-org profiles.
-- ═══════════════════════════════════════════════════════════════════════════════
CREATE OR REPLACE FUNCTION public.get_partner_downline(root_id uuid)
 RETURNS TABLE(id uuid, full_name text, email text, partner_tier text, total_sales numeric, depth integer, path uuid[])
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path = public
AS $function$
DECLARE
    resolved_profile_id uuid;
    v_org_id uuid;
BEGIN
    -- Resolve auth user_id to profiles.id (the hook passes user?.id which is auth user_id)
    SELECT p.id, p.org_id INTO resolved_profile_id, v_org_id
    FROM profiles p
    WHERE p.user_id = root_id;

    -- If no profile found, try using root_id directly as profile_id (backwards compat)
    IF resolved_profile_id IS NULL THEN
        SELECT p.org_id INTO v_org_id
        FROM profiles p
        WHERE p.id = root_id;

        resolved_profile_id := root_id;
    END IF;

    -- Safety: if we can't determine org, return empty
    IF v_org_id IS NULL THEN
        RETURN;
    END IF;

    RETURN QUERY
    WITH RECURSIVE downline AS (
        -- Base case: direct children (check both parent columns) — CONSTRAINED to same org
        SELECT
            p.id,
            p.full_name,
            p.email,
            p.partner_tier,
            1 as depth,
            ARRAY[p.id] as path
        FROM profiles p
        WHERE (p.parent_partner_id = resolved_profile_id
               OR p.parent_rep_id = resolved_profile_id)
          AND p.org_id = v_org_id

        UNION ALL

        -- Recursive case: children of children — CONSTRAINED to same org
        SELECT
            p.id,
            p.full_name,
            p.email,
            p.partner_tier,
            d.depth + 1,
            d.path || p.id
        FROM profiles p
        JOIN downline d ON (p.parent_partner_id = d.id OR p.parent_rep_id = d.id)
        WHERE d.depth < 5
          AND NOT (p.id = ANY(d.path))  -- prevent cycles
          AND p.org_id = v_org_id
    ),
    -- Calculate total sales per partner from sales_orders — CONSTRAINED to same org
    partner_sales AS (
        SELECT
            so.rep_id,
            COALESCE(SUM(so.total_amount), 0) as vol
        FROM sales_orders so
        WHERE so.rep_id IN (SELECT dl.id FROM downline dl)
          AND so.status != 'cancelled'
          AND so.org_id = v_org_id
        GROUP BY so.rep_id
    )
    SELECT
        d.id,
        d.full_name,
        d.email,
        d.partner_tier,
        COALESCE(ps.vol, 0.00)::numeric as total_sales,
        d.depth,
        d.path
    FROM downline d
    LEFT JOIN partner_sales ps ON ps.rep_id = d.id;
END;
$function$;


-- ═══════════════════════════════════════════════════════════════════════════════
-- FIX #2: apply_commissions_to_owed — derive org_id from partner profile,
-- filter commissions + movements to same org. Prevents cross-org credit leakage.
-- ═══════════════════════════════════════════════════════════════════════════════
CREATE OR REPLACE FUNCTION apply_commissions_to_owed(partner_profile_id uuid)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_org_id uuid;
  v_total_applied decimal := 0;
  v_remaining decimal := 0;
  v_movement record;
  v_contact_id uuid;
  v_apply decimal;
  v_movements_paid int := 0;
BEGIN
  -- Derive org_id from the partner's profile — all subsequent queries scoped to this org
  SELECT org_id INTO v_org_id
  FROM profiles
  WHERE id = partner_profile_id;

  IF v_org_id IS NULL THEN
    RETURN json_build_object('applied', 0, 'movements_paid', 0, 'remaining_credit', 0);
  END IF;

  -- Sum available commissions for this partner within their org
  SELECT COALESCE(SUM(amount), 0) INTO v_remaining
  FROM commissions
  WHERE partner_id = partner_profile_id
    AND status = 'available'
    AND org_id = v_org_id;

  IF v_remaining <= 0 THEN
    RETURN json_build_object('applied', 0, 'movements_paid', 0, 'remaining_credit', 0);
  END IF;

  -- Mark all available commissions as paid (org-scoped)
  UPDATE commissions
  SET status = 'paid'
  WHERE partner_id = partner_profile_id
    AND status = 'available'
    AND org_id = v_org_id;

  -- Find the partner's linked contact within the same org
  SELECT c.id INTO v_contact_id
  FROM contacts c
  JOIN profiles p ON p.user_id = c.linked_user_id
  WHERE p.id = partner_profile_id
    AND c.org_id = v_org_id
  LIMIT 1;

  IF v_contact_id IS NULL THEN
    -- No contact found — add remaining as store credit
    UPDATE profiles SET credit_balance = COALESCE(credit_balance, 0) + v_remaining
    WHERE id = partner_profile_id;
    RETURN json_build_object('applied', 0, 'movements_paid', 0, 'remaining_credit', v_remaining);
  END IF;

  -- Apply to unpaid movements (org-scoped via contact's org)
  FOR v_movement IN
    SELECT m.id,
           COALESCE(SUM(mi.price_at_sale), 0) - COALESCE(m.discount_amount, 0) - COALESCE(m.amount_paid, 0) as owed,
           m.amount_paid
    FROM movements m
    JOIN movement_items mi ON mi.movement_id = m.id
    WHERE m.contact_id = v_contact_id
      AND m.org_id = v_org_id
      AND m.payment_status IN ('unpaid', 'partial')
    GROUP BY m.id, m.discount_amount, m.amount_paid
    HAVING COALESCE(SUM(mi.price_at_sale), 0) - COALESCE(m.discount_amount, 0) - COALESCE(m.amount_paid, 0) > 0
    ORDER BY m.created_at ASC
  LOOP
    EXIT WHEN v_remaining <= 0;
    v_apply := LEAST(v_remaining, v_movement.owed);

    UPDATE movements
    SET amount_paid = COALESCE(amount_paid, 0) + v_apply,
        payment_status = CASE
          WHEN COALESCE(amount_paid, 0) + v_apply >= (
            SELECT COALESCE(SUM(mi2.price_at_sale), 0) FROM movement_items mi2 WHERE mi2.movement_id = movements.id
          ) - COALESCE(discount_amount, 0) THEN 'paid'
          ELSE 'partial'
        END,
        notes = COALESCE(notes, '') || E'\nCommission applied: $' || v_apply::text || ' on ' || NOW()::date::text
    WHERE id = v_movement.id;

    v_remaining := v_remaining - v_apply;
    v_total_applied := v_total_applied + v_apply;
    v_movements_paid := v_movements_paid + 1;
  END LOOP;

  -- Remaining goes to store credit
  IF v_remaining > 0 THEN
    UPDATE profiles SET credit_balance = COALESCE(credit_balance, 0) + v_remaining
    WHERE id = partner_profile_id;
  END IF;

  RETURN json_build_object(
    'applied', v_total_applied,
    'movements_paid', v_movements_paid,
    'remaining_credit', v_remaining
  );
END;
$$;


-- ═══════════════════════════════════════════════════════════════════════════════
-- FIX #3: convert_commission_to_credit — add ownership verification + fix
-- status check to accept 'available' (not just 'pending').
-- The frontend already filters to 'available', but the old RPC only accepted 'pending'.
-- ═══════════════════════════════════════════════════════════════════════════════
CREATE OR REPLACE FUNCTION convert_commission_to_credit(commission_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_amount decimal;
  v_partner_id uuid;
  v_status text;
  v_commission_org_id uuid;
  v_caller_org_id uuid;
BEGIN
  -- 1. Get commission details and lock the row
  SELECT amount, partner_id, status, org_id
  INTO v_amount, v_partner_id, v_status, v_commission_org_id
  FROM commissions
  WHERE id = commission_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Commission not found';
  END IF;

  -- 2. Verify caller owns this commission (partner_id matches their profile)
  --    OR caller is in the same org (admin converting on behalf)
  SELECT org_id INTO v_caller_org_id
  FROM profiles
  WHERE user_id = auth.uid();

  IF v_caller_org_id IS NULL OR (v_commission_org_id IS NOT NULL AND v_caller_org_id != v_commission_org_id) THEN
    RAISE EXCEPTION 'Not authorized to convert this commission';
  END IF;

  -- 3. Only 'available' commissions can be converted (paid portion of the sale)
  --    'pending' commissions are for the unpaid portion and should not be converted.
  --    'paid' commissions have already been converted.
  IF v_status = 'paid' THEN
    RAISE EXCEPTION 'Commission already converted';
  END IF;

  IF v_status != 'available' THEN
    RAISE EXCEPTION 'Only available commissions can be converted to credit';
  END IF;

  -- 4. Update commission status to 'paid'
  UPDATE commissions
  SET status = 'paid'
  WHERE id = commission_id;

  -- 5. Update profile credit balance
  UPDATE profiles
  SET credit_balance = COALESCE(credit_balance, 0) + v_amount
  WHERE id = v_partner_id;
END;
$$;


-- ═══════════════════════════════════════════════════════════════════════════════
-- FIX #4: process_sale_commission — merge 3rd-tier support (from 20260221)
-- with org_id on INSERT (from 20260224). This is the definitive version.
-- ═══════════════════════════════════════════════════════════════════════════════
CREATE OR REPLACE FUNCTION process_sale_commission(p_sale_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_order record;
    v_rep_id uuid;
    v_parent_rep_id uuid;
    v_grandparent_rep_id uuid;
    v_rep_rate numeric;
    v_parent_rate numeric;
    v_grandparent_rate numeric;
    v_net_sale numeric;
    v_amount_paid numeric;
    v_amount_unpaid numeric;
    v_comm_paid numeric;
    v_comm_unpaid numeric;
    v_override_paid numeric;
    v_override_unpaid numeric;
    v_gp_override_paid numeric;
    v_gp_override_unpaid numeric;
BEGIN
    SELECT * INTO v_order FROM public.sales_orders WHERE id = p_sale_id;
    IF NOT FOUND THEN RAISE EXCEPTION 'Order not found'; END IF;

    -- Idempotent: skip if commissions already exist for this order
    IF EXISTS (SELECT 1 FROM public.commissions WHERE sale_id = p_sale_id) THEN
        RETURN;
    END IF;

    v_rep_id := v_order.rep_id;

    -- If no rep on the order, try to find one from the client's profile
    IF v_rep_id IS NULL THEN
        SELECT id, parent_rep_id, commission_rate INTO v_rep_id, v_parent_rep_id, v_rep_rate
        FROM public.profiles
        WHERE id = v_order.client_id AND role IN ('sales_rep', 'admin', 'staff');
    ELSE
        SELECT parent_rep_id, commission_rate INTO v_parent_rep_id, v_rep_rate
        FROM public.profiles
        WHERE id = v_rep_id;
    END IF;

    -- No rep or zero commission — skip
    IF v_rep_id IS NULL OR v_rep_rate IS NULL OR v_rep_rate <= 0 THEN
        RETURN;
    END IF;

    -- Calculate net sale (after discounts) and payment split
    v_net_sale := COALESCE(v_order.total_amount, 0);

    DECLARE
        v_discount numeric := 0;
    BEGIN
        SELECT COALESCE(m.discount_amount, 0) INTO v_discount
        FROM public.movements m
        WHERE m.notes LIKE '%' || LEFT(p_sale_id::text, 8) || '%'
        LIMIT 1;
        v_net_sale := v_net_sale - v_discount;
    EXCEPTION WHEN OTHERS THEN
        NULL; -- No linked movement, that's fine
    END;

    v_amount_paid := LEAST(COALESCE(v_order.amount_paid, 0), v_net_sale);
    v_amount_unpaid := GREATEST(v_net_sale - v_amount_paid, 0);

    -- ── TIER 1: Direct rep commission ──────────────────────────────────────
    v_comm_paid := ROUND(v_amount_paid * v_rep_rate, 2);
    v_comm_unpaid := ROUND(v_amount_unpaid * v_rep_rate, 2);

    IF v_comm_paid > 0 THEN
        INSERT INTO public.commissions (sale_id, partner_id, amount, commission_rate, type, status, org_id)
        VALUES (p_sale_id, v_rep_id, v_comm_paid, v_rep_rate, 'direct', 'available', v_order.org_id);
    END IF;
    IF v_comm_unpaid > 0 THEN
        INSERT INTO public.commissions (sale_id, partner_id, amount, commission_rate, type, status, org_id)
        VALUES (p_sale_id, v_rep_id, v_comm_unpaid, v_rep_rate, 'direct', 'pending', v_order.org_id);
    END IF;

    -- ── TIER 2: Parent override ────────────────────────────────────────────
    IF v_parent_rep_id IS NOT NULL THEN
        SELECT commission_rate, parent_rep_id INTO v_parent_rate, v_grandparent_rep_id
        FROM public.profiles
        WHERE id = v_parent_rep_id;

        IF v_parent_rate IS NOT NULL AND v_parent_rate > 0 THEN
            v_override_paid := ROUND(v_amount_paid * v_parent_rate, 2);
            v_override_unpaid := ROUND(v_amount_unpaid * v_parent_rate, 2);

            IF v_override_paid > 0 THEN
                INSERT INTO public.commissions (sale_id, partner_id, amount, commission_rate, type, status, org_id)
                VALUES (p_sale_id, v_parent_rep_id, v_override_paid, v_parent_rate, 'override', 'available', v_order.org_id);
            END IF;
            IF v_override_unpaid > 0 THEN
                INSERT INTO public.commissions (sale_id, partner_id, amount, commission_rate, type, status, org_id)
                VALUES (p_sale_id, v_parent_rep_id, v_override_unpaid, v_parent_rate, 'override', 'pending', v_order.org_id);
            END IF;
        END IF;

        -- ── TIER 3: Grandparent override ───────────────────────────────────
        IF v_grandparent_rep_id IS NOT NULL THEN
            SELECT commission_rate INTO v_grandparent_rate
            FROM public.profiles
            WHERE id = v_grandparent_rep_id;

            IF v_grandparent_rate IS NOT NULL AND v_grandparent_rate > 0 THEN
                v_gp_override_paid := ROUND(v_amount_paid * v_grandparent_rate, 2);
                v_gp_override_unpaid := ROUND(v_amount_unpaid * v_grandparent_rate, 2);

                IF v_gp_override_paid > 0 THEN
                    INSERT INTO public.commissions (sale_id, partner_id, amount, commission_rate, type, status, org_id)
                    VALUES (p_sale_id, v_grandparent_rep_id, v_gp_override_paid, v_grandparent_rate, 'third_tier_override', 'available', v_order.org_id);
                END IF;
                IF v_gp_override_unpaid > 0 THEN
                    INSERT INTO public.commissions (sale_id, partner_id, amount, commission_rate, type, status, org_id)
                    VALUES (p_sale_id, v_grandparent_rep_id, v_gp_override_unpaid, v_grandparent_rate, 'third_tier_override', 'pending', v_order.org_id);
                END IF;
            END IF;
        END IF;
    END IF;

    -- Update order's commission_amount total
    UPDATE public.sales_orders
    SET commission_amount = (SELECT COALESCE(SUM(amount), 0) FROM public.commissions WHERE sale_id = p_sale_id)
    WHERE id = p_sale_id;
END;
$$;
