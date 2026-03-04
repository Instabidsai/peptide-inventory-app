-- Extend lead_submissions for contact form messages and tenant support requests
ALTER TABLE lead_submissions ADD COLUMN IF NOT EXISTS phone text;
ALTER TABLE lead_submissions ADD COLUMN IF NOT EXISTS message text;
ALTER TABLE lead_submissions ADD COLUMN IF NOT EXISTS org_id uuid REFERENCES organizations(id);
