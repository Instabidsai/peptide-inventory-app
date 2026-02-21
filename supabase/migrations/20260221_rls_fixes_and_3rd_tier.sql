-- ═══════════════════════════════════════════════════════════════════════════════
-- Migration: 20260221_rls_fixes_and_3rd_tier.sql
-- Date: 2026-02-21
-- Purpose: RLS audit fixes + 3rd tier commission support
--
-- NOTE: Fixes #1, #2, #4 were already applied to the live DB by another session.
-- They are wrapped in IF NOT EXISTS guards so this migration is safe to re-run.
-- ═══════════════════════════════════════════════════════════════════════════════


-- ═══════════════════════════════════════════════════════════════════════════════
-- FIX #1: UPDATE RLS policy on movements (idempotent — already exists in live DB)
-- ═══════════════════════════════════════════════════════════════════════════════
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE tablename = 'movements' AND policyname = 'Staff and admins can update movements'
  ) THEN
    CREATE POLICY "Staff and admins can update movements"
    ON public.movements FOR UPDATE TO authenticated
    USING (
      org_id = public.get_user_org_id(auth.uid())
      AND (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'staff'))
    );
  END IF;
END $$;


-- ═══════════════════════════════════════════════════════════════════════════════
-- FIX #2: Lots SELECT — ensure simple org_id check (not the overly-restrictive
-- customer-blocking version). Already correct in live DB.
-- ═══════════════════════════════════════════════════════════════════════════════
-- No action needed — live DB already has the correct simple org_id SELECT policy.
-- The restrictive NOT EXISTS(contacts WHERE type='customer') was never applied or reverted.


-- ═══════════════════════════════════════════════════════════════════════════════
-- FIX #3: Add Sonia to user_roles (she was promoted to sales_rep in profiles
-- but never got a user_roles entry, so has_role() returns false)
-- ═══════════════════════════════════════════════════════════════════════════════
INSERT INTO public.user_roles (user_id, org_id, role)
SELECT '5a13e1da-8575-43da-9013-557af88d7ce9', '33a18316-b0a4-4d85-a770-d1ceb762bd4f', 'staff'
WHERE NOT EXISTS (
  SELECT 1 FROM public.user_roles
  WHERE user_id = '5a13e1da-8575-43da-9013-557af88d7ce9'
    AND org_id = '33a18316-b0a4-4d85-a770-d1ceb762bd4f'
);


-- ═══════════════════════════════════════════════════════════════════════════════
-- FIX #4: Commissions RLS (idempotent — policies already exist in live DB)
-- ═══════════════════════════════════════════════════════════════════════════════
ALTER TABLE IF EXISTS public.commissions ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE tablename = 'commissions' AND policyname = 'Org members can view commissions'
  ) THEN
    CREATE POLICY "Org members can view commissions"
    ON public.commissions FOR SELECT TO authenticated
    USING (
      sale_id IN (
        SELECT id FROM public.sales_orders
        WHERE org_id = public.get_user_org_id(auth.uid())
      )
    );
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE tablename = 'commissions' AND policyname = 'Admin/rep can insert commissions'
  ) THEN
    CREATE POLICY "Admin/rep can insert commissions"
    ON public.commissions FOR INSERT TO authenticated
    WITH CHECK (
      sale_id IN (
        SELECT id FROM public.sales_orders
        WHERE org_id = public.get_user_org_id(auth.uid())
      )
      AND (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'staff'))
    );
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE tablename = 'commissions' AND policyname = 'Admin can update commissions'
  ) THEN
    CREATE POLICY "Admin can update commissions"
    ON public.commissions FOR UPDATE TO authenticated
    USING (
      sale_id IN (
        SELECT id FROM public.sales_orders
        WHERE org_id = public.get_user_org_id(auth.uid())
      )
      AND public.has_role(auth.uid(), 'admin')
    );
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE tablename = 'commissions' AND policyname = 'Admin can delete commissions'
  ) THEN
    CREATE POLICY "Admin can delete commissions"
    ON public.commissions FOR DELETE TO authenticated
    USING (
      sale_id IN (
        SELECT id FROM public.sales_orders
        WHERE org_id = public.get_user_org_id(auth.uid())
      )
      AND public.has_role(auth.uid(), 'admin')
    );
  END IF;
END $$;


-- ═══════════════════════════════════════════════════════════════════════════════
-- FIX #5: process_sale_commission — add 3rd tier (grandparent) support
-- Chain: Customer → Sonia (direct, 0%) → Danny (override) → Don (3rd tier override)
-- ═══════════════════════════════════════════════════════════════════════════════
CREATE OR REPLACE FUNCTION process_sale_commission(p_sale_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
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

    -- Skip if commissions already exist for this order
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

    IF v_rep_id IS NULL OR v_rep_rate IS NULL OR v_rep_rate <= 0 THEN
        RETURN; -- No rep or zero commission
    END IF;

    -- Calculate net sale and payment split
    v_net_sale := COALESCE(v_order.total_amount, 0);
    v_amount_paid := COALESCE(v_order.amount_paid, 0);
    v_amount_unpaid := v_net_sale - v_amount_paid;
    IF v_amount_unpaid < 0 THEN v_amount_unpaid := 0; END IF;

    -- Direct rep commission
    v_comm_paid := ROUND(v_amount_paid * v_rep_rate, 2);
    v_comm_unpaid := ROUND(v_amount_unpaid * v_rep_rate, 2);

    IF v_comm_paid > 0 THEN
        INSERT INTO public.commissions (sale_id, partner_id, amount, commission_rate, type, status)
        VALUES (p_sale_id, v_rep_id, v_comm_paid, v_rep_rate, 'direct', 'available');
    END IF;
    IF v_comm_unpaid > 0 THEN
        INSERT INTO public.commissions (sale_id, partner_id, amount, commission_rate, type, status)
        VALUES (p_sale_id, v_rep_id, v_comm_unpaid, v_rep_rate, 'direct', 'pending');
    END IF;

    -- 2nd tier: parent override
    IF v_parent_rep_id IS NOT NULL THEN
        SELECT commission_rate, parent_rep_id INTO v_parent_rate, v_grandparent_rep_id
        FROM public.profiles
        WHERE id = v_parent_rep_id;

        IF v_parent_rate IS NOT NULL AND v_parent_rate > 0 THEN
            v_override_paid := ROUND(v_amount_paid * v_parent_rate, 2);
            v_override_unpaid := ROUND(v_amount_unpaid * v_parent_rate, 2);

            IF v_override_paid > 0 THEN
                INSERT INTO public.commissions (sale_id, partner_id, amount, commission_rate, type, status)
                VALUES (p_sale_id, v_parent_rep_id, v_override_paid, v_parent_rate, 'override', 'available');
            END IF;
            IF v_override_unpaid > 0 THEN
                INSERT INTO public.commissions (sale_id, partner_id, amount, commission_rate, type, status)
                VALUES (p_sale_id, v_parent_rep_id, v_override_unpaid, v_parent_rate, 'override', 'pending');
            END IF;
        END IF;

        -- 3rd tier: grandparent override
        IF v_grandparent_rep_id IS NOT NULL THEN
            SELECT commission_rate INTO v_grandparent_rate
            FROM public.profiles
            WHERE id = v_grandparent_rep_id;

            IF v_grandparent_rate IS NOT NULL AND v_grandparent_rate > 0 THEN
                v_gp_override_paid := ROUND(v_amount_paid * v_grandparent_rate, 2);
                v_gp_override_unpaid := ROUND(v_amount_unpaid * v_grandparent_rate, 2);

                IF v_gp_override_paid > 0 THEN
                    INSERT INTO public.commissions (sale_id, partner_id, amount, commission_rate, type, status)
                    VALUES (p_sale_id, v_grandparent_rep_id, v_gp_override_paid, v_grandparent_rate, 'third_tier_override', 'available');
                END IF;
                IF v_gp_override_unpaid > 0 THEN
                    INSERT INTO public.commissions (sale_id, partner_id, amount, commission_rate, type, status)
                    VALUES (p_sale_id, v_grandparent_rep_id, v_gp_override_unpaid, v_grandparent_rate, 'third_tier_override', 'pending');
                END IF;
            END IF;
        END IF;
    END IF;
END;
$$;
