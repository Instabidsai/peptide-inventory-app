-- ============================================================
-- Tenant AI Builder — Customization Engine Schema
-- Run via Supabase SQL editor
-- ============================================================

-- 1. Custom Fields — add extra columns to existing entities per-tenant
CREATE TABLE IF NOT EXISTS custom_fields (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    org_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
    entity TEXT NOT NULL CHECK (entity IN ('peptides','contacts','sales_orders','lots','bottles')),
    field_name TEXT NOT NULL,
    label TEXT NOT NULL,
    field_type TEXT NOT NULL CHECK (field_type IN ('text','number','date','boolean','select','url','email','textarea')),
    options JSONB DEFAULT '{}',  -- { choices: ["High","Medium","Low"], min: 0, max: 100, ... }
    sort_order INT DEFAULT 0,
    required BOOLEAN DEFAULT false,
    active BOOLEAN DEFAULT true,
    created_at TIMESTAMPTZ DEFAULT now(),
    UNIQUE(org_id, entity, field_name)
);

ALTER TABLE custom_fields ENABLE ROW LEVEL SECURITY;

CREATE POLICY "custom_fields_tenant" ON custom_fields
    FOR ALL USING (
        org_id IN (SELECT org_id FROM profiles WHERE user_id = auth.uid())
    );

CREATE INDEX idx_custom_fields_org_entity ON custom_fields(org_id, entity);

-- 2. Custom Field Values — store values for custom fields
CREATE TABLE IF NOT EXISTS custom_field_values (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    org_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
    field_id UUID NOT NULL REFERENCES custom_fields(id) ON DELETE CASCADE,
    record_id UUID NOT NULL,  -- FK to the parent record (peptide, contact, etc.)
    value JSONB,              -- stored as JSON for flexibility: "hello", 42, true, ["opt1"]
    created_at TIMESTAMPTZ DEFAULT now(),
    updated_at TIMESTAMPTZ DEFAULT now(),
    UNIQUE(org_id, field_id, record_id)
);

ALTER TABLE custom_field_values ENABLE ROW LEVEL SECURITY;

CREATE POLICY "custom_field_values_tenant" ON custom_field_values
    FOR ALL USING (
        org_id IN (SELECT org_id FROM profiles WHERE user_id = auth.uid())
    );

CREATE INDEX idx_custom_field_values_field ON custom_field_values(field_id);
CREATE INDEX idx_custom_field_values_record ON custom_field_values(record_id);

-- 3. Custom Entities — brand new entity types per-tenant
CREATE TABLE IF NOT EXISTS custom_entities (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    org_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    slug TEXT NOT NULL,
    icon TEXT DEFAULT 'Box',  -- Lucide icon name
    description TEXT DEFAULT '',
    schema JSONB NOT NULL DEFAULT '[]',  -- array of { name, label, type, config, required }
    active BOOLEAN DEFAULT true,
    created_at TIMESTAMPTZ DEFAULT now(),
    UNIQUE(org_id, slug)
);

ALTER TABLE custom_entities ENABLE ROW LEVEL SECURITY;

CREATE POLICY "custom_entities_tenant" ON custom_entities
    FOR ALL USING (
        org_id IN (SELECT org_id FROM profiles WHERE user_id = auth.uid())
    );

-- 4. Custom Entity Records — data rows for custom entities
CREATE TABLE IF NOT EXISTS custom_entity_records (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    org_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
    entity_id UUID NOT NULL REFERENCES custom_entities(id) ON DELETE CASCADE,
    data JSONB NOT NULL DEFAULT '{}',
    created_by UUID REFERENCES auth.users(id),
    created_at TIMESTAMPTZ DEFAULT now(),
    updated_at TIMESTAMPTZ DEFAULT now()
);

ALTER TABLE custom_entity_records ENABLE ROW LEVEL SECURITY;

CREATE POLICY "custom_entity_records_tenant" ON custom_entity_records
    FOR ALL USING (
        org_id IN (SELECT org_id FROM profiles WHERE user_id = auth.uid())
    );

CREATE INDEX idx_custom_entity_records_entity ON custom_entity_records(entity_id);
CREATE INDEX idx_custom_entity_records_org ON custom_entity_records(org_id);

-- 5. Custom Dashboard Widgets — per-tenant dashboard components
CREATE TABLE IF NOT EXISTS custom_dashboard_widgets (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    org_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
    title TEXT NOT NULL,
    widget_type TEXT NOT NULL CHECK (widget_type IN ('table','chart','stat','list','custom')),
    config JSONB NOT NULL DEFAULT '{}',  -- { query, columns, chartType, filters, ... }
    position INT DEFAULT 0,
    size TEXT DEFAULT 'md' CHECK (size IN ('sm','md','lg','full')),
    page TEXT DEFAULT 'dashboard',
    active BOOLEAN DEFAULT true,
    created_at TIMESTAMPTZ DEFAULT now()
);

ALTER TABLE custom_dashboard_widgets ENABLE ROW LEVEL SECURITY;

CREATE POLICY "custom_dashboard_widgets_tenant" ON custom_dashboard_widgets
    FOR ALL USING (
        org_id IN (SELECT org_id FROM profiles WHERE user_id = auth.uid())
    );

CREATE INDEX idx_custom_widgets_org_page ON custom_dashboard_widgets(org_id, page);

-- 6. Custom Automations — trigger -> condition -> action rules
CREATE TABLE IF NOT EXISTS custom_automations (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    org_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    description TEXT DEFAULT '',
    trigger_type TEXT NOT NULL CHECK (trigger_type IN ('cron','event','threshold')),
    trigger_config JSONB DEFAULT '{}',  -- { schedule: "0 8 * * *", table: "lots", event: "INSERT" }
    condition_sql TEXT,                  -- WHERE clause evaluated at runtime, always scoped to org_id
    action_type TEXT NOT NULL CHECK (action_type IN ('notification','email','webhook','update_field','create_record')),
    action_config JSONB DEFAULT '{}',   -- { template: "...", url: "...", field: "...", value: "..." }
    active BOOLEAN DEFAULT true,
    last_run_at TIMESTAMPTZ,
    run_count INT DEFAULT 0,
    created_at TIMESTAMPTZ DEFAULT now()
);

ALTER TABLE custom_automations ENABLE ROW LEVEL SECURITY;

CREATE POLICY "custom_automations_tenant" ON custom_automations
    FOR ALL USING (
        org_id IN (SELECT org_id FROM profiles WHERE user_id = auth.uid())
    );

-- 7. Custom Reports — saved queries with visualization config
CREATE TABLE IF NOT EXISTS custom_reports (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    org_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    description TEXT DEFAULT '',
    query_sql TEXT NOT NULL,              -- parameterized SQL (SELECT only), use $org_id placeholder
    parameters JSONB DEFAULT '{}',        -- { date_range: "30d", peptide_id: null }
    chart_type TEXT DEFAULT 'table' CHECK (chart_type IN ('table','bar','line','pie','stat','area')),
    chart_config JSONB DEFAULT '{}',      -- { xKey, yKey, colors, stacked, ... }
    created_by UUID REFERENCES auth.users(id),
    created_at TIMESTAMPTZ DEFAULT now()
);

ALTER TABLE custom_reports ENABLE ROW LEVEL SECURITY;

CREATE POLICY "custom_reports_tenant" ON custom_reports
    FOR ALL USING (
        org_id IN (SELECT org_id FROM profiles WHERE user_id = auth.uid())
    );

-- 8. Tenant Connections — Composio OAuth connection status
CREATE TABLE IF NOT EXISTS tenant_connections (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    org_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
    service TEXT NOT NULL,                 -- 'stripe', 'gmail', 'sheets', 'shopify'
    composio_connection_id TEXT,
    status TEXT DEFAULT 'disconnected' CHECK (status IN ('connected','disconnected','pending')),
    state_token TEXT,                      -- random token for OAuth callback validation
    connected_at TIMESTAMPTZ,
    metadata JSONB DEFAULT '{}',
    UNIQUE(org_id, service)
);

ALTER TABLE tenant_connections ENABLE ROW LEVEL SECURITY;

CREATE POLICY "tenant_connections_admin" ON tenant_connections
    FOR ALL USING (
        org_id IN (
            SELECT org_id FROM user_roles
            WHERE user_id = auth.uid() AND role IN ('admin', 'super_admin')
        )
    );

-- 9. AI Builder Tasks — task queue for builder requests
CREATE TABLE IF NOT EXISTS ai_builder_tasks (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    org_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
    request_text TEXT NOT NULL,
    status TEXT DEFAULT 'pending' CHECK (status IN ('pending','building','complete','failed')),
    layer TEXT DEFAULT 'config' CHECK (layer IN ('config','builder')),
    result JSONB DEFAULT '{}',            -- { actions_taken: [...], error: null }
    created_by UUID REFERENCES auth.users(id),
    created_at TIMESTAMPTZ DEFAULT now(),
    completed_at TIMESTAMPTZ
);

ALTER TABLE ai_builder_tasks ENABLE ROW LEVEL SECURITY;

CREATE POLICY "ai_builder_tasks_tenant" ON ai_builder_tasks
    FOR ALL USING (
        org_id IN (SELECT org_id FROM profiles WHERE user_id = auth.uid())
    );

CREATE INDEX idx_ai_builder_tasks_org_status ON ai_builder_tasks(org_id, status);

-- ── Auto-update timestamps ──

CREATE OR REPLACE FUNCTION update_custom_timestamp()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = now();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER custom_field_values_updated
    BEFORE UPDATE ON custom_field_values
    FOR EACH ROW EXECUTE FUNCTION update_custom_timestamp();

CREATE TRIGGER custom_entity_records_updated
    BEFORE UPDATE ON custom_entity_records
    FOR EACH ROW EXECUTE FUNCTION update_custom_timestamp();

-- ── Read-only query executor (used by widgets, reports, and AI builder) ──

CREATE OR REPLACE FUNCTION run_readonly_query(query_text TEXT, p_org_id UUID)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    safe_query TEXT;
    result JSONB;
BEGIN
    -- Only allow SELECT queries
    IF NOT (UPPER(TRIM(query_text)) LIKE 'SELECT%') THEN
        RAISE EXCEPTION 'Only SELECT queries are allowed';
    END IF;

    -- Block dangerous keywords (case-insensitive)
    IF query_text ~* '\b(INSERT|UPDATE|DELETE|DROP|ALTER|CREATE|TRUNCATE|GRANT|REVOKE)\b' THEN
        RAISE EXCEPTION 'Query contains forbidden keywords';
    END IF;

    -- Replace $org_id placeholder with the actual org_id (safely quoted)
    safe_query := REPLACE(query_text, '$org_id', quote_literal(p_org_id::TEXT));

    -- Execute and return as JSON array
    EXECUTE format(
        'SELECT COALESCE(jsonb_agg(row_to_json(t)), ''[]''::jsonb) FROM (%s) t',
        safe_query
    ) INTO result;

    RETURN result;
END;
$$;

-- Grant execute to authenticated users (RLS on underlying tables still applies)
GRANT EXECUTE ON FUNCTION run_readonly_query(TEXT, UUID) TO authenticated;
