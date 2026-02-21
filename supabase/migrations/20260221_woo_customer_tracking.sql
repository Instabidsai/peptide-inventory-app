-- Add WooCommerce customer tracking to contacts
-- woo_customer_id: links to WooCommerce customer ID for reliable dedup
-- source: tags where the contact originated ('manual', 'woocommerce', 'import')

ALTER TABLE contacts ADD COLUMN IF NOT EXISTS woo_customer_id bigint;
ALTER TABLE contacts ADD COLUMN IF NOT EXISTS source text NOT NULL DEFAULT 'manual';

CREATE UNIQUE INDEX IF NOT EXISTS idx_contacts_woo_customer_org
  ON contacts (org_id, woo_customer_id)
  WHERE woo_customer_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_contacts_source ON contacts (source);

-- Backfill existing WooCommerce-created contacts
UPDATE contacts
SET source = 'woocommerce', assigned_rep_id = NULL
WHERE notes LIKE 'Auto-created from WooCommerce%'
  AND source = 'manual';
