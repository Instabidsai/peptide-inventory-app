-- Subscription plans and tenant billing
-- Run via Supabase SQL editor

-- Subscription plan tiers
CREATE TABLE IF NOT EXISTS subscription_plans (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name TEXT NOT NULL UNIQUE,          -- 'free', 'starter', 'professional', 'enterprise'
    display_name TEXT NOT NULL,
    price_monthly INTEGER NOT NULL,     -- in cents (e.g. 9900 = $99)
    price_yearly INTEGER NOT NULL,      -- in cents (e.g. 99900 = $999/yr)
    max_users INTEGER DEFAULT 0,        -- 0 = unlimited
    max_peptides INTEGER DEFAULT 0,     -- 0 = unlimited
    max_orders_per_month INTEGER DEFAULT 0,
    features JSONB DEFAULT '[]'::JSONB, -- array of feature strings
    stripe_monthly_price_id TEXT,       -- Stripe Price ID for monthly billing
    stripe_yearly_price_id TEXT,        -- Stripe Price ID for yearly billing
    sort_order INTEGER DEFAULT 0,
    active BOOLEAN DEFAULT true,
    created_at TIMESTAMPTZ DEFAULT now()
);

ALTER TABLE subscription_plans ENABLE ROW LEVEL SECURITY;

-- Everyone can read plans (needed for signup page)
CREATE POLICY "subscription_plans_public_read" ON subscription_plans
    FOR SELECT USING (true);

-- Only super_admin can modify plans
CREATE POLICY "subscription_plans_super_admin_write" ON subscription_plans
    FOR ALL USING (
        EXISTS (SELECT 1 FROM user_roles WHERE user_id = auth.uid() AND role = 'super_admin')
    );

-- Tenant subscriptions
CREATE TABLE IF NOT EXISTS tenant_subscriptions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    org_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
    plan_id UUID NOT NULL REFERENCES subscription_plans(id),
    status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'past_due', 'canceled', 'trialing')),
    billing_period TEXT NOT NULL DEFAULT 'monthly' CHECK (billing_period IN ('monthly', 'yearly')),
    stripe_customer_id TEXT,
    stripe_subscription_id TEXT,
    current_period_start TIMESTAMPTZ,
    current_period_end TIMESTAMPTZ,
    cancel_at_period_end BOOLEAN DEFAULT false,
    trial_end TIMESTAMPTZ,
    created_at TIMESTAMPTZ DEFAULT now(),
    updated_at TIMESTAMPTZ DEFAULT now(),
    UNIQUE(org_id)
);

ALTER TABLE tenant_subscriptions ENABLE ROW LEVEL SECURITY;

-- Admins of the org can read their own subscription
CREATE POLICY "tenant_subscriptions_admin_read" ON tenant_subscriptions
    FOR SELECT USING (
        org_id IN (
            SELECT org_id FROM user_roles
            WHERE user_id = auth.uid() AND role IN ('admin', 'super_admin')
        )
    );

-- Super-admin can read/write all subscriptions
CREATE POLICY "tenant_subscriptions_super_admin" ON tenant_subscriptions
    FOR ALL USING (
        EXISTS (SELECT 1 FROM user_roles WHERE user_id = auth.uid() AND role = 'super_admin')
    );

-- Auto-update updated_at
CREATE OR REPLACE FUNCTION update_tenant_subscriptions_timestamp()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = now();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER tenant_subscriptions_updated_at
    BEFORE UPDATE ON tenant_subscriptions
    FOR EACH ROW
    EXECUTE FUNCTION update_tenant_subscriptions_timestamp();

-- Seed default plans
INSERT INTO subscription_plans (name, display_name, price_monthly, price_yearly, max_users, max_peptides, max_orders_per_month, features, sort_order) VALUES
('free', 'Free Trial', 0, 0, 2, 10, 50,
 '["Basic inventory", "1 admin user", "Community support"]'::JSONB, 0),
('starter', 'Starter', 9900, 99900, 5, 50, 500,
 '["Full inventory management", "5 team members", "Client portal", "AI chat assistant", "Email support"]'::JSONB, 1),
('professional', 'Professional', 19900, 199900, 25, 200, 2000,
 '["Everything in Starter", "25 team members", "Custom branding", "Sales rep portal", "Priority support", "Data export"]'::JSONB, 2),
('enterprise', 'Enterprise', 49900, 499900, 0, 0, 0,
 '["Everything in Professional", "Unlimited users", "Unlimited inventory", "White-label domain", "Dedicated support", "SLA guarantee", "Custom integrations"]'::JSONB, 3)
ON CONFLICT (name) DO NOTHING;

-- Indexes
CREATE INDEX IF NOT EXISTS idx_tenant_subscriptions_org ON tenant_subscriptions(org_id);
CREATE INDEX IF NOT EXISTS idx_tenant_subscriptions_stripe ON tenant_subscriptions(stripe_subscription_id);

-- Billing events log (for audit trail)
CREATE TABLE IF NOT EXISTS billing_events (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    org_id UUID REFERENCES organizations(id) ON DELETE SET NULL,
    event_type TEXT NOT NULL,           -- 'subscription_created', 'payment_succeeded', 'payment_failed', etc.
    stripe_event_id TEXT,
    amount_cents INTEGER,
    currency TEXT DEFAULT 'usd',
    metadata JSONB DEFAULT '{}'::JSONB,
    created_at TIMESTAMPTZ DEFAULT now()
);

ALTER TABLE billing_events ENABLE ROW LEVEL SECURITY;

CREATE POLICY "billing_events_super_admin" ON billing_events
    FOR ALL USING (
        EXISTS (SELECT 1 FROM user_roles WHERE user_id = auth.uid() AND role = 'super_admin')
    );

CREATE POLICY "billing_events_admin_read" ON billing_events
    FOR SELECT USING (
        org_id IN (
            SELECT org_id FROM user_roles
            WHERE user_id = auth.uid() AND role = 'admin'
        )
    );

CREATE INDEX IF NOT EXISTS idx_billing_events_org ON billing_events(org_id);
CREATE INDEX IF NOT EXISTS idx_billing_events_stripe ON billing_events(stripe_event_id);
CREATE INDEX IF NOT EXISTS idx_billing_events_created ON billing_events(created_at);
