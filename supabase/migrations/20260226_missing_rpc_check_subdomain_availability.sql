-- Migration: check_subdomain_availability RPC
-- Source: scripts/20260223_business_in_a_box.sql lines 169-174
-- Called from: src/hooks/use-wholesale-pricing.ts line 123
-- Purpose: Check if a given subdomain is not yet taken in the tenant_config table.
--          Returns TRUE if available, FALSE if already claimed.

CREATE OR REPLACE FUNCTION public.check_subdomain_availability(p_subdomain TEXT)
 RETURNS BOOLEAN
 LANGUAGE sql
 SECURITY DEFINER
AS $$
  SELECT NOT EXISTS (
    SELECT 1 FROM tenant_config WHERE subdomain = lower(trim(p_subdomain))
  );
$$;
