-- Migration: Fix 6 remaining RLS policy gaps for multi-tenant isolation
-- Date: 2026-03-02
-- Tables: circuit_breaker_events, partner_chat_messages, admin_ai_logs,
--         resource_themes, profiles, protocol_supplements

BEGIN;

-- ============================================================
-- 1. circuit_breaker_events — org-scope the admin SELECT policy
-- ============================================================
DROP POLICY IF EXISTS "admin_read_circuit_breaker_events" ON circuit_breaker_events;
CREATE POLICY "admin_read_circuit_breaker_events" ON circuit_breaker_events
  FOR SELECT TO public
  USING (
    EXISTS (
      SELECT 1 FROM user_roles
      WHERE user_roles.user_id = auth.uid()
        AND user_roles.role IN ('admin', 'super_admin')
        AND (user_roles.role = 'super_admin' OR user_roles.org_id = circuit_breaker_events.org_id)
    )
  );

-- ============================================================
-- 2. partner_chat_messages — add org_id to own_messages policy
-- ============================================================
DROP POLICY IF EXISTS "own_messages" ON partner_chat_messages;
CREATE POLICY "own_messages" ON partner_chat_messages
  FOR ALL TO public
  USING (
    user_id = auth.uid()
    AND org_id = get_user_org_id(auth.uid())
  )
  WITH CHECK (
    user_id = auth.uid()
    AND org_id = get_user_org_id(auth.uid())
  );

-- ============================================================
-- 3. admin_ai_logs — restrict INSERT to authenticated admins only
--    (service_role bypasses RLS anyway, so this just closes the public hole)
-- ============================================================
DROP POLICY IF EXISTS "Service role can insert logs" ON admin_ai_logs;
CREATE POLICY "Admins can insert logs" ON admin_ai_logs
  FOR INSERT TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM user_roles
      WHERE user_roles.user_id = auth.uid()
        AND user_roles.role IN ('admin', 'super_admin')
    )
  );

-- ============================================================
-- 4. resource_themes — add org_id column and scope policies
-- ============================================================

-- Add org_id column (nullable initially for backfill)
ALTER TABLE resource_themes ADD COLUMN IF NOT EXISTS org_id uuid REFERENCES organizations(id);

-- Backfill: set org_id from the first organization (single-tenant for now)
UPDATE resource_themes
SET org_id = (SELECT id FROM organizations LIMIT 1)
WHERE org_id IS NULL;

-- Make NOT NULL after backfill
ALTER TABLE resource_themes ALTER COLUMN org_id SET NOT NULL;

-- Create index for performance
CREATE INDEX IF NOT EXISTS idx_resource_themes_org_id ON resource_themes(org_id);

-- Drop overly permissive policies
DROP POLICY IF EXISTS "Themes are viewable by everyone" ON resource_themes;
DROP POLICY IF EXISTS "Authenticated users can manage themes" ON resource_themes;

-- New org-scoped policies
CREATE POLICY "Users can view themes in their org" ON resource_themes
  FOR SELECT TO authenticated
  USING (org_id = get_user_org_id(auth.uid()));

CREATE POLICY "Admins can manage themes in their org" ON resource_themes
  FOR ALL TO authenticated
  USING (
    org_id = get_user_org_id(auth.uid())
    AND EXISTS (
      SELECT 1 FROM user_roles
      WHERE user_roles.user_id = auth.uid()
        AND user_roles.role IN ('admin', 'super_admin')
        AND user_roles.org_id = resource_themes.org_id
    )
  )
  WITH CHECK (
    org_id = get_user_org_id(auth.uid())
    AND EXISTS (
      SELECT 1 FROM user_roles
      WHERE user_roles.user_id = auth.uid()
        AND user_roles.role IN ('admin', 'super_admin')
        AND user_roles.org_id = resource_themes.org_id
    )
  );

-- Super admin bypass for resource_themes
CREATE POLICY "super_admin_select_resource_themes" ON resource_themes
  FOR SELECT TO authenticated USING (is_super_admin());
CREATE POLICY "super_admin_insert_resource_themes" ON resource_themes
  FOR INSERT TO authenticated WITH CHECK (is_super_admin());
CREATE POLICY "super_admin_update_resource_themes" ON resource_themes
  FOR UPDATE TO authenticated USING (is_super_admin()) WITH CHECK (is_super_admin());
CREATE POLICY "super_admin_delete_resource_themes" ON resource_themes
  FOR DELETE TO authenticated USING (is_super_admin());

-- ============================================================
-- 5. profiles — fix admin update policy to scope by org_id
--    Also clean up duplicate "Users can update" policies
-- ============================================================

-- Drop the unsafe admin policy
DROP POLICY IF EXISTS "Admins can update any profile" ON profiles;

-- Create org-scoped admin update policy
CREATE POLICY "Admins can update profiles in their org" ON profiles
  FOR UPDATE TO authenticated
  USING (
    org_id = get_user_org_id(auth.uid())
    AND EXISTS (
      SELECT 1 FROM user_roles
      WHERE user_roles.user_id = auth.uid()
        AND user_roles.role IN ('admin', 'super_admin')
        AND user_roles.org_id = profiles.org_id
    )
  )
  WITH CHECK (
    org_id = get_user_org_id(auth.uid())
    AND EXISTS (
      SELECT 1 FROM user_roles
      WHERE user_roles.user_id = auth.uid()
        AND user_roles.role IN ('admin', 'super_admin')
        AND user_roles.org_id = profiles.org_id
    )
  );

-- Clean up duplicate user update policies (keep one)
DROP POLICY IF EXISTS "Users can update own profile" ON profiles;
-- "Users can update their own profile" remains

-- ============================================================
-- 6. protocol_supplements — fix admin policy (wrong column + no org scope)
-- ============================================================

-- Drop the broken admin policy (uses profiles.id instead of profiles.user_id)
DROP POLICY IF EXISTS "Admins can manage all protocol supplements" ON protocol_supplements;

-- Create org-scoped admin policy via protocol -> contacts -> org_id chain
CREATE POLICY "Admins can manage protocol supplements in their org" ON protocol_supplements
  FOR ALL TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM protocols p
      JOIN contacts c ON c.id = p.contact_id
      JOIN user_roles ur ON ur.user_id = auth.uid() AND ur.org_id = c.org_id
      WHERE p.id = protocol_supplements.protocol_id
        AND ur.role IN ('admin', 'super_admin')
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM protocols p
      JOIN contacts c ON c.id = p.contact_id
      JOIN user_roles ur ON ur.user_id = auth.uid() AND ur.org_id = c.org_id
      WHERE p.id = protocol_supplements.protocol_id
        AND ur.role IN ('admin', 'super_admin')
    )
  );

COMMIT;
