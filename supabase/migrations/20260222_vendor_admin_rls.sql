-- Vendor Admin RLS: Allow super_admin to read across all tenants
-- Required for the platform vendor dashboard support & audit pages

-- Helper: check if user is super_admin (using existing has_role function pattern)
-- partner_suggestions: add super_admin read policy
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_policies
        WHERE tablename = 'partner_suggestions' AND policyname = 'super_admin_read_all_suggestions'
    ) THEN
        CREATE POLICY super_admin_read_all_suggestions ON partner_suggestions
            FOR SELECT USING (
                EXISTS (
                    SELECT 1 FROM user_roles
                    WHERE user_roles.user_id = auth.uid()
                    AND user_roles.role = 'super_admin'
                )
            );
    END IF;
END $$;

-- client_requests: add super_admin read policy
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_policies
        WHERE tablename = 'client_requests' AND policyname = 'super_admin_read_all_client_requests'
    ) THEN
        CREATE POLICY super_admin_read_all_client_requests ON client_requests
            FOR SELECT USING (
                EXISTS (
                    SELECT 1 FROM user_roles
                    WHERE user_roles.user_id = auth.uid()
                    AND user_roles.role = 'super_admin'
                )
            );
    END IF;
END $$;

-- protocol_feedback: add super_admin read policy
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_policies
        WHERE tablename = 'protocol_feedback' AND policyname = 'super_admin_read_all_protocol_feedback'
    ) THEN
        CREATE POLICY super_admin_read_all_protocol_feedback ON protocol_feedback
            FOR SELECT USING (
                EXISTS (
                    SELECT 1 FROM user_roles
                    WHERE user_roles.user_id = auth.uid()
                    AND user_roles.role = 'super_admin'
                )
            );
    END IF;
END $$;

-- audit_log: add super_admin read policy
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_policies
        WHERE tablename = 'audit_log' AND policyname = 'super_admin_read_all_audit_log'
    ) THEN
        CREATE POLICY super_admin_read_all_audit_log ON audit_log
            FOR SELECT USING (
                EXISTS (
                    SELECT 1 FROM user_roles
                    WHERE user_roles.user_id = auth.uid()
                    AND user_roles.role = 'super_admin'
                )
            );
    END IF;
END $$;

-- billing_events: add super_admin read policy
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_policies
        WHERE tablename = 'billing_events' AND policyname = 'super_admin_read_all_billing_events'
    ) THEN
        CREATE POLICY super_admin_read_all_billing_events ON billing_events
            FOR SELECT USING (
                EXISTS (
                    SELECT 1 FROM user_roles
                    WHERE user_roles.user_id = auth.uid()
                    AND user_roles.role = 'super_admin'
                )
            );
    END IF;
END $$;
