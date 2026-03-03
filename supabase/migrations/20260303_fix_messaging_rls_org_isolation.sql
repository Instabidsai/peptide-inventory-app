-- ============================================================================
-- FIX: Cross-org data leaks in client_requests + request_replies RLS
-- ============================================================================
-- PROBLEM: Admin/staff RLS policies use has_role() which checks user_roles
-- WITHOUT org_id scoping. An admin from Org B could read/modify/delete
-- ALL client_requests and request_replies from Org A.
--
-- FIX: Replace role-only checks with org_id-scoped checks.
-- Also add missing client DELETE policy (frontend has delete button but
-- no RLS policy allows it, causing silent failures).
-- ============================================================================

-- ═══════════════════════════════════════════════════════════
-- 1. FIX client_requests — Add org-scoped admin policies
-- ═══════════════════════════════════════════════════════════

-- Drop the unscoped admin policies
DROP POLICY IF EXISTS "Admins view all" ON public.client_requests;
DROP POLICY IF EXISTS "Admins manage all" ON public.client_requests;

-- Create org-scoped admin SELECT
CREATE POLICY "admins_view_org_requests" ON public.client_requests
  FOR SELECT TO authenticated
  USING (
    org_id IN (SELECT p.org_id FROM public.profiles p WHERE p.user_id = auth.uid())
    AND EXISTS (
      SELECT 1 FROM public.profiles p
      WHERE p.user_id = auth.uid() AND p.role IN ('admin', 'staff')
    )
  );

-- Create org-scoped admin UPDATE (for status changes, admin_notes, etc.)
CREATE POLICY "admins_update_org_requests" ON public.client_requests
  FOR UPDATE TO authenticated
  USING (
    org_id IN (SELECT p.org_id FROM public.profiles p WHERE p.user_id = auth.uid())
    AND EXISTS (
      SELECT 1 FROM public.profiles p
      WHERE p.user_id = auth.uid() AND p.role IN ('admin', 'staff')
    )
  )
  WITH CHECK (
    org_id IN (SELECT p.org_id FROM public.profiles p WHERE p.user_id = auth.uid())
    AND EXISTS (
      SELECT 1 FROM public.profiles p
      WHERE p.user_id = auth.uid() AND p.role IN ('admin', 'staff')
    )
  );

-- Create org-scoped admin DELETE (for archiving/cleanup)
CREATE POLICY "admins_delete_org_requests" ON public.client_requests
  FOR DELETE TO authenticated
  USING (
    org_id IN (SELECT p.org_id FROM public.profiles p WHERE p.user_id = auth.uid())
    AND EXISTS (
      SELECT 1 FROM public.profiles p
      WHERE p.user_id = auth.uid() AND p.role IN ('admin', 'staff')
    )
  );

-- Add client DELETE policy (clients can delete their own pending requests)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE tablename = 'client_requests' AND policyname = 'clients_delete_own_pending'
  ) THEN
    CREATE POLICY "clients_delete_own_pending" ON public.client_requests
      FOR DELETE TO authenticated
      USING (user_id = auth.uid() AND status = 'pending');
  END IF;
END $$;


-- ═══════════════════════════════════════════════════════════
-- 2. FIX request_replies — Add org-scoped admin policies
-- ═══════════════════════════════════════════════════════════

-- Drop the unscoped policies
DROP POLICY IF EXISTS "View request replies" ON public.request_replies;
DROP POLICY IF EXISTS "Insert request replies" ON public.request_replies;
DROP POLICY IF EXISTS "Admin update replies" ON public.request_replies;

-- SELECT: clients see replies on their own requests; admin/staff see replies for their org
CREATE POLICY "view_request_replies_scoped" ON public.request_replies
  FOR SELECT TO authenticated
  USING (
    -- Client: can see replies on their own requests
    request_id IN (SELECT id FROM public.client_requests WHERE user_id = auth.uid())
    OR
    -- Admin/staff: can see replies on requests in their org
    (
      request_id IN (
        SELECT id FROM public.client_requests
        WHERE org_id IN (SELECT p.org_id FROM public.profiles p WHERE p.user_id = auth.uid())
      )
      AND EXISTS (
        SELECT 1 FROM public.profiles p
        WHERE p.user_id = auth.uid() AND p.role IN ('admin', 'staff')
      )
    )
  );

-- INSERT: clients reply to their own requests; admin/staff reply to requests in their org
CREATE POLICY "insert_request_replies_scoped" ON public.request_replies
  FOR INSERT TO authenticated
  WITH CHECK (
    user_id = auth.uid()
    AND (
      -- Client: can reply to their own requests
      request_id IN (SELECT id FROM public.client_requests WHERE user_id = auth.uid())
      OR
      -- Admin/staff: can reply to requests in their org
      (
        request_id IN (
          SELECT id FROM public.client_requests
          WHERE org_id IN (SELECT p.org_id FROM public.profiles p WHERE p.user_id = auth.uid())
        )
        AND EXISTS (
          SELECT 1 FROM public.profiles p
          WHERE p.user_id = auth.uid() AND p.role IN ('admin', 'staff')
        )
      )
    )
  );

-- UPDATE: admin/staff can update replies in their org (for moderation)
CREATE POLICY "admin_update_replies_scoped" ON public.request_replies
  FOR UPDATE TO authenticated
  USING (
    request_id IN (
      SELECT id FROM public.client_requests
      WHERE org_id IN (SELECT p.org_id FROM public.profiles p WHERE p.user_id = auth.uid())
    )
    AND EXISTS (
      SELECT 1 FROM public.profiles p
      WHERE p.user_id = auth.uid() AND p.role IN ('admin', 'staff')
    )
  );

-- DELETE: admin/staff can delete replies in their org (for moderation)
CREATE POLICY "admin_delete_replies_scoped" ON public.request_replies
  FOR DELETE TO authenticated
  USING (
    request_id IN (
      SELECT id FROM public.client_requests
      WHERE org_id IN (SELECT p.org_id FROM public.profiles p WHERE p.user_id = auth.uid())
    )
    AND EXISTS (
      SELECT 1 FROM public.profiles p
      WHERE p.user_id = auth.uid() AND p.role IN ('admin', 'staff')
    )
  );
