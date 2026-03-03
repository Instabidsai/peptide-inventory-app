-- Fix HTTP 300 (Multiple Choices) on create_validated_order RPC.
-- The 5-param overload from 20260226_fix_partner_self_order_commission.sql
-- was never dropped when the 6-param version was added in 20260227_fix_checkout_contact_id.sql.
-- PostgREST can't disambiguate between the two → HTTP 300.

DROP FUNCTION IF EXISTS public.create_validated_order(JSONB, TEXT, TEXT, TEXT, UUID);
