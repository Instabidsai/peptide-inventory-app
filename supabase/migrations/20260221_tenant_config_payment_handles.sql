-- Add venmo_handle and cashapp_handle to tenant_config
-- These were previously hardcoded in ClientStore.tsx and PartnerStore.tsx

ALTER TABLE tenant_config ADD COLUMN IF NOT EXISTS venmo_handle TEXT DEFAULT '';
ALTER TABLE tenant_config ADD COLUMN IF NOT EXISTS cashapp_handle TEXT DEFAULT '';

-- Seed the existing PureUSPeptide tenant with the previously-hardcoded value
UPDATE tenant_config SET venmo_handle = 'PureUSPeptide' WHERE venmo_handle = '' OR venmo_handle IS NULL;
