-- ============================================================================
-- RLS HARDENING MIGRATION
-- ============================================================================
-- Fixes 3 critical "Authenticated Read USING(true)" data leaks on:
--   contacts, profiles, peptides
-- Enables RLS + adds org_id or user_id policies on ~35 unprotected tables.
-- All operations are idempotent (IF NOT EXISTS / DO $$ guards).
-- ============================================================================

-- Helper: reusable org_id check expression
-- org_id IN (SELECT p.org_id FROM public.profiles p WHERE p.user_id = auth.uid())

-- ============================================================================
-- PART 1: FIX CRITICAL DATA LEAKS (P0)
-- Drop the 3 "Authenticated Read USING(true)" policies that let any
-- authenticated user read ALL rows across ALL orgs.
-- ============================================================================

-- 1a. contacts — drop open read, ensure org-scoped read exists
DROP POLICY IF EXISTS "Authenticated Read Contacts" ON public.contacts;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE tablename = 'contacts' AND policyname = 'contacts_org_read'
  ) THEN
    CREATE POLICY contacts_org_read ON public.contacts
      FOR SELECT TO authenticated
      USING (
        org_id IN (SELECT p.org_id FROM public.profiles p WHERE p.user_id = auth.uid())
      );
  END IF;
END $$;

-- 1b. profiles — drop open read, replace with org-scoped read
DROP POLICY IF EXISTS "Authenticated Read Profiles" ON public.profiles;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE tablename = 'profiles' AND policyname = 'profiles_org_read'
  ) THEN
    CREATE POLICY profiles_org_read ON public.profiles
      FOR SELECT TO authenticated
      USING (
        org_id IN (SELECT p.org_id FROM public.profiles p WHERE p.user_id = auth.uid())
        OR user_id = auth.uid()  -- always allow reading own profile
      );
  END IF;
END $$;

-- 1c. peptides — drop open read, replace with org-scoped read
DROP POLICY IF EXISTS "Authenticated Read Peptides" ON public.peptides;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE tablename = 'peptides' AND policyname = 'peptides_org_read'
  ) THEN
    CREATE POLICY peptides_org_read ON public.peptides
      FOR SELECT TO authenticated
      USING (
        org_id IN (SELECT p.org_id FROM public.profiles p WHERE p.user_id = auth.uid())
      );
  END IF;
END $$;


-- ============================================================================
-- PART 2: ENABLE RLS + ADD POLICIES ON UNPROTECTED TABLES
-- ============================================================================

-- -------------------------------------------------------
-- 2a. ORG-SCOPED TABLES (have org_id column)
-- -------------------------------------------------------

-- expenses
ALTER TABLE IF EXISTS public.expenses ENABLE ROW LEVEL SECURITY;
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE tablename = 'expenses' AND policyname = 'expenses_org_isolation'
  ) THEN
    CREATE POLICY expenses_org_isolation ON public.expenses
      FOR ALL TO authenticated
      USING (org_id IN (SELECT p.org_id FROM public.profiles p WHERE p.user_id = auth.uid()))
      WITH CHECK (org_id IN (SELECT p.org_id FROM public.profiles p WHERE p.user_id = auth.uid()));
  END IF;
END $$;

-- protocols
ALTER TABLE IF EXISTS public.protocols ENABLE ROW LEVEL SECURITY;
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE tablename = 'protocols' AND policyname = 'protocols_org_isolation'
  ) THEN
    CREATE POLICY protocols_org_isolation ON public.protocols
      FOR ALL TO authenticated
      USING (org_id IN (SELECT p.org_id FROM public.profiles p WHERE p.user_id = auth.uid()))
      WITH CHECK (org_id IN (SELECT p.org_id FROM public.profiles p WHERE p.user_id = auth.uid()));
  END IF;
END $$;

-- protocol_items (FK to protocols — scope via join)
ALTER TABLE IF EXISTS public.protocol_items ENABLE ROW LEVEL SECURITY;
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE tablename = 'protocol_items' AND policyname = 'protocol_items_org_isolation'
  ) THEN
    CREATE POLICY protocol_items_org_isolation ON public.protocol_items
      FOR ALL TO authenticated
      USING (
        protocol_id IN (
          SELECT id FROM public.protocols
          WHERE org_id IN (SELECT p.org_id FROM public.profiles p WHERE p.user_id = auth.uid())
        )
      )
      WITH CHECK (
        protocol_id IN (
          SELECT id FROM public.protocols
          WHERE org_id IN (SELECT p.org_id FROM public.profiles p WHERE p.user_id = auth.uid())
        )
      );
  END IF;
END $$;

-- protocol_logs
ALTER TABLE IF EXISTS public.protocol_logs ENABLE ROW LEVEL SECURITY;
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE tablename = 'protocol_logs' AND policyname = 'protocol_logs_org_isolation'
  ) THEN
    CREATE POLICY protocol_logs_org_isolation ON public.protocol_logs
      FOR ALL TO authenticated
      USING (
        protocol_id IN (
          SELECT id FROM public.protocols
          WHERE org_id IN (SELECT p.org_id FROM public.profiles p WHERE p.user_id = auth.uid())
        )
      )
      WITH CHECK (
        protocol_id IN (
          SELECT id FROM public.protocols
          WHERE org_id IN (SELECT p.org_id FROM public.profiles p WHERE p.user_id = auth.uid())
        )
      );
  END IF;
END $$;

-- protocol_supplements
ALTER TABLE IF EXISTS public.protocol_supplements ENABLE ROW LEVEL SECURITY;
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE tablename = 'protocol_supplements' AND policyname = 'protocol_supplements_org_isolation'
  ) THEN
    CREATE POLICY protocol_supplements_org_isolation ON public.protocol_supplements
      FOR ALL TO authenticated
      USING (
        protocol_id IN (
          SELECT id FROM public.protocols
          WHERE org_id IN (SELECT p.org_id FROM public.profiles p WHERE p.user_id = auth.uid())
        )
      )
      WITH CHECK (
        protocol_id IN (
          SELECT id FROM public.protocols
          WHERE org_id IN (SELECT p.org_id FROM public.profiles p WHERE p.user_id = auth.uid())
        )
      );
  END IF;
END $$;

-- protocol_feedback
ALTER TABLE IF EXISTS public.protocol_feedback ENABLE ROW LEVEL SECURITY;
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE tablename = 'protocol_feedback' AND policyname = 'protocol_feedback_org_isolation'
  ) THEN
    CREATE POLICY protocol_feedback_org_isolation ON public.protocol_feedback
      FOR ALL TO authenticated
      USING (
        protocol_id IN (
          SELECT id FROM public.protocols
          WHERE org_id IN (SELECT p.org_id FROM public.profiles p WHERE p.user_id = auth.uid())
        )
      )
      WITH CHECK (
        protocol_id IN (
          SELECT id FROM public.protocols
          WHERE org_id IN (SELECT p.org_id FROM public.profiles p WHERE p.user_id = auth.uid())
        )
      );
  END IF;
END $$;

-- contact_notes (has org_id column)
ALTER TABLE IF EXISTS public.contact_notes ENABLE ROW LEVEL SECURITY;
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE tablename = 'contact_notes' AND policyname = 'contact_notes_org_isolation'
  ) THEN
    CREATE POLICY contact_notes_org_isolation ON public.contact_notes
      FOR ALL TO authenticated
      USING (org_id IN (SELECT p.org_id FROM public.profiles p WHERE p.user_id = auth.uid()))
      WITH CHECK (org_id IN (SELECT p.org_id FROM public.profiles p WHERE p.user_id = auth.uid()));
  END IF;
END $$;

-- resources
ALTER TABLE IF EXISTS public.resources ENABLE ROW LEVEL SECURITY;
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE tablename = 'resources' AND policyname = 'resources_org_isolation'
  ) THEN
    CREATE POLICY resources_org_isolation ON public.resources
      FOR ALL TO authenticated
      USING (org_id IN (SELECT p.org_id FROM public.profiles p WHERE p.user_id = auth.uid()))
      WITH CHECK (org_id IN (SELECT p.org_id FROM public.profiles p WHERE p.user_id = auth.uid()));
  END IF;
END $$;

-- supplements (may not have org_id — if not, use global read + admin write)
-- Supplements are global reference data within an org. If table has org_id, scope it.
-- If not, allow authenticated read (they're shared reference data).
ALTER TABLE IF EXISTS public.supplements ENABLE ROW LEVEL SECURITY;
DO $$
BEGIN
  -- Check if org_id column exists on supplements
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'supplements' AND column_name = 'org_id'
  ) THEN
    IF NOT EXISTS (
      SELECT 1 FROM pg_policies WHERE tablename = 'supplements' AND policyname = 'supplements_org_isolation'
    ) THEN
      EXECUTE 'CREATE POLICY supplements_org_isolation ON public.supplements
        FOR ALL TO authenticated
        USING (org_id IN (SELECT p.org_id FROM public.profiles p WHERE p.user_id = auth.uid()))
        WITH CHECK (org_id IN (SELECT p.org_id FROM public.profiles p WHERE p.user_id = auth.uid()))';
    END IF;
  ELSE
    -- No org_id — allow authenticated read (global reference data)
    IF NOT EXISTS (
      SELECT 1 FROM pg_policies WHERE tablename = 'supplements' AND policyname = 'supplements_authenticated_read'
    ) THEN
      EXECUTE 'CREATE POLICY supplements_authenticated_read ON public.supplements
        FOR SELECT TO authenticated USING (true)';
    END IF;
    IF NOT EXISTS (
      SELECT 1 FROM pg_policies WHERE tablename = 'supplements' AND policyname = 'supplements_admin_write'
    ) THEN
      EXECUTE 'CREATE POLICY supplements_admin_write ON public.supplements
        FOR ALL TO authenticated
        USING (
          EXISTS (
            SELECT 1 FROM public.profiles p
            WHERE p.user_id = auth.uid() AND p.role IN (''admin'', ''staff'')
          )
        )
        WITH CHECK (
          EXISTS (
            SELECT 1 FROM public.profiles p
            WHERE p.user_id = auth.uid() AND p.role IN (''admin'', ''staff'')
          )
        )';
    END IF;
  END IF;
END $$;

-- custom_automations
ALTER TABLE IF EXISTS public.custom_automations ENABLE ROW LEVEL SECURITY;
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE tablename = 'custom_automations' AND policyname = 'custom_automations_org_isolation'
  ) THEN
    CREATE POLICY custom_automations_org_isolation ON public.custom_automations
      FOR ALL TO authenticated
      USING (org_id IN (SELECT p.org_id FROM public.profiles p WHERE p.user_id = auth.uid()))
      WITH CHECK (org_id IN (SELECT p.org_id FROM public.profiles p WHERE p.user_id = auth.uid()));
  END IF;
END $$;

-- custom_fields
ALTER TABLE IF EXISTS public.custom_fields ENABLE ROW LEVEL SECURITY;
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE tablename = 'custom_fields' AND policyname = 'custom_fields_org_isolation'
  ) THEN
    CREATE POLICY custom_fields_org_isolation ON public.custom_fields
      FOR ALL TO authenticated
      USING (org_id IN (SELECT p.org_id FROM public.profiles p WHERE p.user_id = auth.uid()))
      WITH CHECK (org_id IN (SELECT p.org_id FROM public.profiles p WHERE p.user_id = auth.uid()));
  END IF;
END $$;

-- custom_field_values
ALTER TABLE IF EXISTS public.custom_field_values ENABLE ROW LEVEL SECURITY;
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE tablename = 'custom_field_values' AND policyname = 'custom_field_values_org_isolation'
  ) THEN
    CREATE POLICY custom_field_values_org_isolation ON public.custom_field_values
      FOR ALL TO authenticated
      USING (org_id IN (SELECT p.org_id FROM public.profiles p WHERE p.user_id = auth.uid()))
      WITH CHECK (org_id IN (SELECT p.org_id FROM public.profiles p WHERE p.user_id = auth.uid()));
  END IF;
END $$;

-- custom_entities
ALTER TABLE IF EXISTS public.custom_entities ENABLE ROW LEVEL SECURITY;
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE tablename = 'custom_entities' AND policyname = 'custom_entities_org_isolation'
  ) THEN
    CREATE POLICY custom_entities_org_isolation ON public.custom_entities
      FOR ALL TO authenticated
      USING (org_id IN (SELECT p.org_id FROM public.profiles p WHERE p.user_id = auth.uid()))
      WITH CHECK (org_id IN (SELECT p.org_id FROM public.profiles p WHERE p.user_id = auth.uid()));
  END IF;
END $$;

-- custom_entity_records
ALTER TABLE IF EXISTS public.custom_entity_records ENABLE ROW LEVEL SECURITY;
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE tablename = 'custom_entity_records' AND policyname = 'custom_entity_records_org_isolation'
  ) THEN
    CREATE POLICY custom_entity_records_org_isolation ON public.custom_entity_records
      FOR ALL TO authenticated
      USING (org_id IN (SELECT p.org_id FROM public.profiles p WHERE p.user_id = auth.uid()))
      WITH CHECK (org_id IN (SELECT p.org_id FROM public.profiles p WHERE p.user_id = auth.uid()));
  END IF;
END $$;

-- custom_dashboard_widgets
ALTER TABLE IF EXISTS public.custom_dashboard_widgets ENABLE ROW LEVEL SECURITY;
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE tablename = 'custom_dashboard_widgets' AND policyname = 'custom_dashboard_widgets_org_isolation'
  ) THEN
    CREATE POLICY custom_dashboard_widgets_org_isolation ON public.custom_dashboard_widgets
      FOR ALL TO authenticated
      USING (org_id IN (SELECT p.org_id FROM public.profiles p WHERE p.user_id = auth.uid()))
      WITH CHECK (org_id IN (SELECT p.org_id FROM public.profiles p WHERE p.user_id = auth.uid()));
  END IF;
END $$;

-- custom_reports
ALTER TABLE IF EXISTS public.custom_reports ENABLE ROW LEVEL SECURITY;
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE tablename = 'custom_reports' AND policyname = 'custom_reports_org_isolation'
  ) THEN
    CREATE POLICY custom_reports_org_isolation ON public.custom_reports
      FOR ALL TO authenticated
      USING (org_id IN (SELECT p.org_id FROM public.profiles p WHERE p.user_id = auth.uid()))
      WITH CHECK (org_id IN (SELECT p.org_id FROM public.profiles p WHERE p.user_id = auth.uid()));
  END IF;
END $$;

-- orders (legacy — has org_id)
ALTER TABLE IF EXISTS public.orders ENABLE ROW LEVEL SECURITY;
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE tablename = 'orders' AND policyname = 'orders_org_isolation'
  ) THEN
    CREATE POLICY orders_org_isolation ON public.orders
      FOR ALL TO authenticated
      USING (org_id IN (SELECT p.org_id FROM public.profiles p WHERE p.user_id = auth.uid()))
      WITH CHECK (org_id IN (SELECT p.org_id FROM public.profiles p WHERE p.user_id = auth.uid()));
  END IF;
END $$;

-- tenant_config (has org_id)
ALTER TABLE IF EXISTS public.tenant_config ENABLE ROW LEVEL SECURITY;
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE tablename = 'tenant_config' AND policyname = 'tenant_config_org_isolation'
  ) THEN
    CREATE POLICY tenant_config_org_isolation ON public.tenant_config
      FOR ALL TO authenticated
      USING (org_id IN (SELECT p.org_id FROM public.profiles p WHERE p.user_id = auth.uid()))
      WITH CHECK (org_id IN (SELECT p.org_id FROM public.profiles p WHERE p.user_id = auth.uid()));
  END IF;
END $$;

-- tenant_api_keys (has org_id)
ALTER TABLE IF EXISTS public.tenant_api_keys ENABLE ROW LEVEL SECURITY;
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE tablename = 'tenant_api_keys' AND policyname = 'tenant_api_keys_org_isolation'
  ) THEN
    CREATE POLICY tenant_api_keys_org_isolation ON public.tenant_api_keys
      FOR ALL TO authenticated
      USING (org_id IN (SELECT p.org_id FROM public.profiles p WHERE p.user_id = auth.uid()))
      WITH CHECK (org_id IN (SELECT p.org_id FROM public.profiles p WHERE p.user_id = auth.uid()));
  END IF;
END $$;

-- tenant_subscriptions (has org_id)
ALTER TABLE IF EXISTS public.tenant_subscriptions ENABLE ROW LEVEL SECURITY;
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE tablename = 'tenant_subscriptions' AND policyname = 'tenant_subscriptions_org_isolation'
  ) THEN
    CREATE POLICY tenant_subscriptions_org_isolation ON public.tenant_subscriptions
      FOR ALL TO authenticated
      USING (org_id IN (SELECT p.org_id FROM public.profiles p WHERE p.user_id = auth.uid()))
      WITH CHECK (org_id IN (SELECT p.org_id FROM public.profiles p WHERE p.user_id = auth.uid()));
  END IF;
END $$;

-- tenant_connections (has org_id)
ALTER TABLE IF EXISTS public.tenant_connections ENABLE ROW LEVEL SECURITY;
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE tablename = 'tenant_connections' AND policyname = 'tenant_connections_org_isolation'
  ) THEN
    CREATE POLICY tenant_connections_org_isolation ON public.tenant_connections
      FOR ALL TO authenticated
      USING (org_id IN (SELECT p.org_id FROM public.profiles p WHERE p.user_id = auth.uid()))
      WITH CHECK (org_id IN (SELECT p.org_id FROM public.profiles p WHERE p.user_id = auth.uid()));
  END IF;
END $$;

-- billing_events (has org_id)
ALTER TABLE IF EXISTS public.billing_events ENABLE ROW LEVEL SECURITY;
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE tablename = 'billing_events' AND policyname = 'billing_events_org_isolation'
  ) THEN
    CREATE POLICY billing_events_org_isolation ON public.billing_events
      FOR ALL TO authenticated
      USING (org_id IN (SELECT p.org_id FROM public.profiles p WHERE p.user_id = auth.uid()))
      WITH CHECK (org_id IN (SELECT p.org_id FROM public.profiles p WHERE p.user_id = auth.uid()));
  END IF;
END $$;

-- admin_chat_messages (scoped by user_id in hooks, but should also have org_id)
ALTER TABLE IF EXISTS public.admin_chat_messages ENABLE ROW LEVEL SECURITY;
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'admin_chat_messages' AND column_name = 'org_id'
  ) THEN
    IF NOT EXISTS (
      SELECT 1 FROM pg_policies WHERE tablename = 'admin_chat_messages' AND policyname = 'admin_chat_messages_org_isolation'
    ) THEN
      EXECUTE 'CREATE POLICY admin_chat_messages_org_isolation ON public.admin_chat_messages
        FOR ALL TO authenticated
        USING (org_id IN (SELECT p.org_id FROM public.profiles p WHERE p.user_id = auth.uid()))
        WITH CHECK (org_id IN (SELECT p.org_id FROM public.profiles p WHERE p.user_id = auth.uid()))';
    END IF;
  ELSE
    -- Fall back to user_id scoping
    IF NOT EXISTS (
      SELECT 1 FROM pg_policies WHERE tablename = 'admin_chat_messages' AND policyname = 'admin_chat_messages_user_isolation'
    ) THEN
      EXECUTE 'CREATE POLICY admin_chat_messages_user_isolation ON public.admin_chat_messages
        FOR ALL TO authenticated
        USING (user_id = auth.uid())
        WITH CHECK (user_id = auth.uid())';
    END IF;
  END IF;
END $$;

-- wholesale_pricing_tiers (global reference — read-only for all authenticated)
ALTER TABLE IF EXISTS public.wholesale_pricing_tiers ENABLE ROW LEVEL SECURITY;
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE tablename = 'wholesale_pricing_tiers' AND policyname = 'wholesale_pricing_tiers_read'
  ) THEN
    CREATE POLICY wholesale_pricing_tiers_read ON public.wholesale_pricing_tiers
      FOR SELECT TO authenticated USING (true);
  END IF;
  -- Admin-only write
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE tablename = 'wholesale_pricing_tiers' AND policyname = 'wholesale_pricing_tiers_admin_write'
  ) THEN
    CREATE POLICY wholesale_pricing_tiers_admin_write ON public.wholesale_pricing_tiers
      FOR ALL TO authenticated
      USING (
        EXISTS (
          SELECT 1 FROM public.profiles p
          WHERE p.user_id = auth.uid() AND p.role IN ('admin', 'staff')
        )
      )
      WITH CHECK (
        EXISTS (
          SELECT 1 FROM public.profiles p
          WHERE p.user_id = auth.uid() AND p.role IN ('admin', 'staff')
        )
      );
  END IF;
END $$;

-- -------------------------------------------------------
-- 2b. USER-SCOPED TABLES (have user_id column, personal data)
-- -------------------------------------------------------

-- notifications (scoped by user_id)
ALTER TABLE IF EXISTS public.notifications ENABLE ROW LEVEL SECURITY;
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE tablename = 'notifications' AND policyname = 'notifications_user_isolation'
  ) THEN
    CREATE POLICY notifications_user_isolation ON public.notifications
      FOR ALL TO authenticated
      USING (user_id = auth.uid())
      WITH CHECK (user_id = auth.uid());
  END IF;
END $$;

-- ai_conversations (scoped by user_id)
ALTER TABLE IF EXISTS public.ai_conversations ENABLE ROW LEVEL SECURITY;
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE tablename = 'ai_conversations' AND policyname = 'ai_conversations_user_isolation'
  ) THEN
    CREATE POLICY ai_conversations_user_isolation ON public.ai_conversations
      FOR ALL TO authenticated
      USING (user_id = auth.uid())
      WITH CHECK (user_id = auth.uid());
  END IF;
END $$;

-- ai_messages (scoped via conversation -> user_id)
ALTER TABLE IF EXISTS public.ai_messages ENABLE ROW LEVEL SECURITY;
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE tablename = 'ai_messages' AND policyname = 'ai_messages_user_isolation'
  ) THEN
    CREATE POLICY ai_messages_user_isolation ON public.ai_messages
      FOR ALL TO authenticated
      USING (
        conversation_id IN (
          SELECT id FROM public.ai_conversations WHERE user_id = auth.uid()
        )
      )
      WITH CHECK (
        conversation_id IN (
          SELECT id FROM public.ai_conversations WHERE user_id = auth.uid()
        )
      );
  END IF;
END $$;

-- ai_documents (scoped by user_id)
ALTER TABLE IF EXISTS public.ai_documents ENABLE ROW LEVEL SECURITY;
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE tablename = 'ai_documents' AND policyname = 'ai_documents_user_isolation'
  ) THEN
    CREATE POLICY ai_documents_user_isolation ON public.ai_documents
      FOR ALL TO authenticated
      USING (user_id = auth.uid())
      WITH CHECK (user_id = auth.uid());
  END IF;
END $$;

-- ai_health_profiles (scoped by user_id)
ALTER TABLE IF EXISTS public.ai_health_profiles ENABLE ROW LEVEL SECURITY;
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE tablename = 'ai_health_profiles' AND policyname = 'ai_health_profiles_user_isolation'
  ) THEN
    CREATE POLICY ai_health_profiles_user_isolation ON public.ai_health_profiles
      FOR ALL TO authenticated
      USING (user_id = auth.uid())
      WITH CHECK (user_id = auth.uid());
  END IF;
END $$;

-- ai_learned_insights (scoped by user_id)
ALTER TABLE IF EXISTS public.ai_learned_insights ENABLE ROW LEVEL SECURITY;
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE tablename = 'ai_learned_insights' AND policyname = 'ai_learned_insights_user_isolation'
  ) THEN
    CREATE POLICY ai_learned_insights_user_isolation ON public.ai_learned_insights
      FOR ALL TO authenticated
      USING (user_id = auth.uid())
      WITH CHECK (user_id = auth.uid());
  END IF;
END $$;

-- favorite_foods (scoped by user_id)
ALTER TABLE IF EXISTS public.favorite_foods ENABLE ROW LEVEL SECURITY;
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE tablename = 'favorite_foods' AND policyname = 'favorite_foods_user_isolation'
  ) THEN
    CREATE POLICY favorite_foods_user_isolation ON public.favorite_foods
      FOR ALL TO authenticated
      USING (user_id = auth.uid())
      WITH CHECK (user_id = auth.uid());
  END IF;
END $$;

-- client_daily_logs (scoped by user_id)
ALTER TABLE IF EXISTS public.client_daily_logs ENABLE ROW LEVEL SECURITY;
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE tablename = 'client_daily_logs' AND policyname = 'client_daily_logs_user_isolation'
  ) THEN
    CREATE POLICY client_daily_logs_user_isolation ON public.client_daily_logs
      FOR ALL TO authenticated
      USING (user_id = auth.uid())
      WITH CHECK (user_id = auth.uid());
  END IF;
END $$;

-- daily_hours (scoped by user_id)
ALTER TABLE IF EXISTS public.daily_hours ENABLE ROW LEVEL SECURITY;
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE tablename = 'daily_hours' AND policyname = 'daily_hours_user_isolation'
  ) THEN
    CREATE POLICY daily_hours_user_isolation ON public.daily_hours
      FOR ALL TO authenticated
      USING (user_id = auth.uid())
      WITH CHECK (user_id = auth.uid());
  END IF;
END $$;

-- -------------------------------------------------------
-- 2c. REFERENCE / GLOBAL TABLES (read-only for all authenticated)
-- -------------------------------------------------------

-- subscription_plans (global pricing reference)
ALTER TABLE IF EXISTS public.subscription_plans ENABLE ROW LEVEL SECURITY;
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE tablename = 'subscription_plans' AND policyname = 'subscription_plans_read'
  ) THEN
    CREATE POLICY subscription_plans_read ON public.subscription_plans
      FOR SELECT TO authenticated USING (true);
  END IF;
END $$;

-- scraped_peptides (global reference data)
ALTER TABLE IF EXISTS public.scraped_peptides ENABLE ROW LEVEL SECURITY;
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE tablename = 'scraped_peptides' AND policyname = 'scraped_peptides_read'
  ) THEN
    CREATE POLICY scraped_peptides_read ON public.scraped_peptides
      FOR SELECT TO authenticated USING (true);
  END IF;
END $$;

-- peptide_suggested_supplements (FK to peptides — scope via peptide org_id)
ALTER TABLE IF EXISTS public.peptide_suggested_supplements ENABLE ROW LEVEL SECURITY;
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE tablename = 'peptide_suggested_supplements' AND policyname = 'peptide_suggested_supplements_org_isolation'
  ) THEN
    CREATE POLICY peptide_suggested_supplements_org_isolation ON public.peptide_suggested_supplements
      FOR ALL TO authenticated
      USING (
        peptide_id IN (
          SELECT id FROM public.peptides
          WHERE org_id IN (SELECT p.org_id FROM public.profiles p WHERE p.user_id = auth.uid())
        )
      )
      WITH CHECK (
        peptide_id IN (
          SELECT id FROM public.peptides
          WHERE org_id IN (SELECT p.org_id FROM public.profiles p WHERE p.user_id = auth.uid())
        )
      );
  END IF;
END $$;


-- ============================================================================
-- PART 3: ENSURE SERVICE_ROLE BYPASS
-- ============================================================================
-- Supabase service_role key bypasses RLS by default (it uses the postgres role).
-- Edge functions using service_role_key are unaffected by these policies.
-- No action needed — this is built into Supabase.


-- ============================================================================
-- PART 4: INDEX SUPPORT FOR RLS PERFORMANCE
-- ============================================================================
-- The subquery `SELECT p.org_id FROM profiles p WHERE p.user_id = auth.uid()`
-- runs on every row check. Ensure we have an index on profiles(user_id).
CREATE INDEX IF NOT EXISTS idx_profiles_user_id ON public.profiles(user_id);

-- org_id indexes on tables that didn't have them
CREATE INDEX IF NOT EXISTS idx_expenses_org_id ON public.expenses(org_id);
CREATE INDEX IF NOT EXISTS idx_protocols_org_id ON public.protocols(org_id);
CREATE INDEX IF NOT EXISTS idx_contact_notes_org_id ON public.contact_notes(org_id);
CREATE INDEX IF NOT EXISTS idx_resources_org_id ON public.resources(org_id);
CREATE INDEX IF NOT EXISTS idx_custom_automations_org_id ON public.custom_automations(org_id);
CREATE INDEX IF NOT EXISTS idx_custom_fields_org_id ON public.custom_fields(org_id);
CREATE INDEX IF NOT EXISTS idx_custom_field_values_org_id ON public.custom_field_values(org_id);
CREATE INDEX IF NOT EXISTS idx_custom_entities_org_id ON public.custom_entities(org_id);
CREATE INDEX IF NOT EXISTS idx_custom_entity_records_org_id ON public.custom_entity_records(org_id);
CREATE INDEX IF NOT EXISTS idx_custom_dashboard_widgets_org_id ON public.custom_dashboard_widgets(org_id);
CREATE INDEX IF NOT EXISTS idx_custom_reports_org_id ON public.custom_reports(org_id);
CREATE INDEX IF NOT EXISTS idx_orders_org_id ON public.orders(org_id);
CREATE INDEX IF NOT EXISTS idx_tenant_config_org_id ON public.tenant_config(org_id);
CREATE INDEX IF NOT EXISTS idx_tenant_api_keys_org_id ON public.tenant_api_keys(org_id);
CREATE INDEX IF NOT EXISTS idx_tenant_subscriptions_org_id ON public.tenant_subscriptions(org_id);
CREATE INDEX IF NOT EXISTS idx_tenant_connections_org_id ON public.tenant_connections(org_id);
CREATE INDEX IF NOT EXISTS idx_billing_events_org_id ON public.billing_events(org_id);
CREATE INDEX IF NOT EXISTS idx_notifications_user_id ON public.notifications(user_id);
CREATE INDEX IF NOT EXISTS idx_ai_conversations_user_id ON public.ai_conversations(user_id);
CREATE INDEX IF NOT EXISTS idx_ai_documents_user_id ON public.ai_documents(user_id);
CREATE INDEX IF NOT EXISTS idx_ai_health_profiles_user_id ON public.ai_health_profiles(user_id);
CREATE INDEX IF NOT EXISTS idx_ai_learned_insights_user_id ON public.ai_learned_insights(user_id);
CREATE INDEX IF NOT EXISTS idx_favorite_foods_user_id ON public.favorite_foods(user_id);
CREATE INDEX IF NOT EXISTS idx_client_daily_logs_user_id ON public.client_daily_logs(user_id);
CREATE INDEX IF NOT EXISTS idx_daily_hours_user_id ON public.daily_hours(user_id);
