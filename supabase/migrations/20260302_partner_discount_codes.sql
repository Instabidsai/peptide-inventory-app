-- Partner discount codes — bridges WooCommerce/Shopify coupon codes to partner referral system
-- Partners get named codes (e.g. "JOHN20") that work on external platforms and attribute orders for commissions

CREATE TABLE IF NOT EXISTS partner_discount_codes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id UUID NOT NULL REFERENCES organizations(id),
  partner_id UUID NOT NULL REFERENCES profiles(user_id),
  code TEXT NOT NULL,
  discount_percent NUMERIC DEFAULT 0,
  platform TEXT,                    -- 'woocommerce', 'shopify', 'both', or NULL for app-only
  platform_coupon_id TEXT,          -- ID from WooCommerce/Shopify for sync tracking
  active BOOLEAN DEFAULT true,
  uses_count INTEGER DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(org_id, code)
);

ALTER TABLE partner_discount_codes ENABLE ROW LEVEL SECURITY;

-- All org members can view discount codes
CREATE POLICY "Users can view own org discount codes"
  ON partner_discount_codes FOR SELECT
  USING (org_id IN (SELECT org_id FROM profiles WHERE user_id = auth.uid()));

-- Only admins can create/update/delete
CREATE POLICY "Admins can manage discount codes"
  ON partner_discount_codes FOR ALL
  USING (org_id IN (SELECT org_id FROM profiles WHERE user_id = auth.uid() AND role = 'admin'));

-- Partners can view their own codes
CREATE POLICY "Partners can view own discount codes"
  ON partner_discount_codes FOR SELECT
  USING (partner_id = auth.uid());
