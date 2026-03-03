-- Flat per-item wholesale prices for tenant orgs.
-- When rows exist for an org, SupplierOrderDialog uses these flat prices
-- instead of the volume-based tier markup system.

CREATE TABLE IF NOT EXISTS tenant_wholesale_prices (
    id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    org_id      UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
    peptide_id  UUID NOT NULL REFERENCES peptides(id) ON DELETE CASCADE,
    wholesale_price NUMERIC(10,2) NOT NULL CHECK (wholesale_price >= 0),
    created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE (org_id, peptide_id)
);

-- RLS: vendor (super-admin) can read/write, tenant admin can read their own prices
ALTER TABLE tenant_wholesale_prices ENABLE ROW LEVEL SECURITY;

CREATE POLICY "vendor_full_access" ON tenant_wholesale_prices
    FOR ALL
    USING (
        EXISTS (
            SELECT 1 FROM profiles
            WHERE profiles.id = auth.uid()
            AND profiles.role = 'vendor'
        )
    );

CREATE POLICY "tenant_read_own" ON tenant_wholesale_prices
    FOR SELECT
    USING (
        org_id IN (
            SELECT p.org_id FROM profiles p WHERE p.id = auth.uid()
        )
    );

-- Auto-update updated_at
CREATE OR REPLACE FUNCTION update_tenant_wholesale_prices_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = now();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_tenant_wholesale_prices_updated_at
    BEFORE UPDATE ON tenant_wholesale_prices
    FOR EACH ROW
    EXECUTE FUNCTION update_tenant_wholesale_prices_updated_at();

-- Index for fast lookup by org
CREATE INDEX idx_tenant_wholesale_prices_org ON tenant_wholesale_prices(org_id);
