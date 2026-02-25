-- Super admin RLS bypass for ALL org-scoped data tables
-- Required for impersonation to work (JWT is always super_admin's, but org_id is overridden client-side)
-- The is_super_admin() function was created in 20260225_super_admin_rls_bypass.sql

-- Helper: bulk-create super_admin SELECT + INSERT + UPDATE + DELETE policies
-- We use DO blocks with exception handling so duplicate policies don't error out

DO $$
DECLARE
    tbl TEXT;
    tables TEXT[] := ARRAY[
        'peptides', 'lots', 'bottles', 'contacts', 'orders',
        'sales_orders', 'sales_order_items', 'movements', 'movement_items',
        'supplements', 'commissions', 'expenses',
        'automation_modules', 'org_features',
        'custom_fields', 'custom_entities', 'custom_entity_records',
        'custom_field_values', 'custom_dashboard_widgets', 'custom_automations',
        'admin_chat_messages', 'partner_chat_messages',
        'ai_conversations', 'ai_messages', 'ai_documents',
        'ai_health_profiles', 'ai_learned_insights',
        'client_requests', 'client_inventory',
        'protocols', 'protocol_items', 'protocol_logs',
        'protocol_supplements', 'protocol_feedback',
        'partner_suggestions', 'notifications', 'audit_log',
        'contact_notes', 'payment_email_queue', 'sender_aliases',
        'tenant_connections', 'tenant_api_keys', 'billing_events',
        'vendor_messages', 'wholesale_pricing_tiers', 'pricing_tiers',
        'tenant_subscriptions', 'subscription_plans'
    ];
BEGIN
    FOREACH tbl IN ARRAY tables
    LOOP
        -- Only create policy if table exists
        IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = tbl) THEN
            -- SELECT
            BEGIN
                EXECUTE format(
                    'CREATE POLICY "super_admin_select_%s" ON public.%I FOR SELECT TO authenticated USING (public.is_super_admin())',
                    tbl, tbl
                );
                RAISE NOTICE 'Created SELECT policy for %', tbl;
            EXCEPTION WHEN duplicate_object THEN
                RAISE NOTICE 'SELECT policy already exists for %', tbl;
            END;

            -- INSERT
            BEGIN
                EXECUTE format(
                    'CREATE POLICY "super_admin_insert_%s" ON public.%I FOR INSERT TO authenticated WITH CHECK (public.is_super_admin())',
                    tbl, tbl
                );
                RAISE NOTICE 'Created INSERT policy for %', tbl;
            EXCEPTION WHEN duplicate_object THEN
                RAISE NOTICE 'INSERT policy already exists for %', tbl;
            END;

            -- UPDATE
            BEGIN
                EXECUTE format(
                    'CREATE POLICY "super_admin_update_%s" ON public.%I FOR UPDATE TO authenticated USING (public.is_super_admin()) WITH CHECK (public.is_super_admin())',
                    tbl, tbl
                );
                RAISE NOTICE 'Created UPDATE policy for %', tbl;
            EXCEPTION WHEN duplicate_object THEN
                RAISE NOTICE 'UPDATE policy already exists for %', tbl;
            END;

            -- DELETE
            BEGIN
                EXECUTE format(
                    'CREATE POLICY "super_admin_delete_%s" ON public.%I FOR DELETE TO authenticated USING (public.is_super_admin())',
                    tbl, tbl
                );
                RAISE NOTICE 'Created DELETE policy for %', tbl;
            EXCEPTION WHEN duplicate_object THEN
                RAISE NOTICE 'DELETE policy already exists for %', tbl;
            END;
        ELSE
            RAISE NOTICE 'Table % does not exist, skipping', tbl;
        END IF;
    END LOOP;
END $$;
