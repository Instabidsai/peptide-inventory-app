-- Vendor Messages: Communication from platform admin to tenants

CREATE TABLE IF NOT EXISTS vendor_messages (
    id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    from_user_id    uuid REFERENCES auth.users(id),
    to_org_id       uuid REFERENCES organizations(id),  -- NULL = broadcast to all
    subject         text NOT NULL,
    body            text NOT NULL,
    message_type    text NOT NULL DEFAULT 'announcement'
                    CHECK (message_type IN ('announcement', 'direct', 'maintenance', 'billing')),
    is_read         boolean DEFAULT false,
    read_at         timestamptz,
    created_at      timestamptz DEFAULT now()
);

-- Enable RLS
ALTER TABLE vendor_messages ENABLE ROW LEVEL SECURITY;

-- Super admin can do everything with vendor messages
CREATE POLICY vendor_messages_super_admin_all ON vendor_messages
    FOR ALL USING (
        EXISTS (
            SELECT 1 FROM user_roles
            WHERE user_roles.user_id = auth.uid()
            AND user_roles.role = 'super_admin'
        )
    );

-- Tenant admins can read messages sent to their org or broadcast messages
CREATE POLICY vendor_messages_tenant_read ON vendor_messages
    FOR SELECT USING (
        to_org_id IS NULL  -- broadcasts visible to all
        OR to_org_id IN (
            SELECT org_id FROM user_roles WHERE user_id = auth.uid()
        )
    );

-- Index for quick lookups
CREATE INDEX IF NOT EXISTS idx_vendor_messages_org ON vendor_messages(to_org_id);
CREATE INDEX IF NOT EXISTS idx_vendor_messages_created ON vendor_messages(created_at DESC);
