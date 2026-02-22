-- ================================================================
-- SEED SUBSCRIPTION PLANS
-- ================================================================
-- Run AFTER schema-master.sql.
-- Run BEFORE seed-new-tenant.sql (tenants reference plans).
-- Idempotent: ON CONFLICT DO NOTHING.
-- ================================================================

INSERT INTO subscription_plans (
    name, display_name, price_monthly, price_yearly,
    max_users, max_peptides, max_orders_per_month,
    features, sort_order
) VALUES
(
    'free', 'Free Trial', 0, 0,
    2, 10, 50,
    '["Basic inventory", "1 admin user", "Community support"]'::jsonb,
    0
),
(
    'starter', 'Starter', 9900, 99900,
    5, 50, 500,
    '["Full inventory management", "5 team members", "Client portal", "AI chat assistant", "Email support"]'::jsonb,
    1
),
(
    'professional', 'Professional', 19900, 199900,
    25, 200, 2000,
    '["Everything in Starter", "25 team members", "Custom branding", "Sales rep portal", "Priority support", "Data export"]'::jsonb,
    2
),
(
    'enterprise', 'Enterprise', 49900, 499900,
    0, 0, 0,
    '["Everything in Professional", "Unlimited users", "Unlimited inventory", "White-label domain", "Dedicated support", "SLA guarantee", "Custom integrations"]'::jsonb,
    3
)
ON CONFLICT (name) DO NOTHING;

-- Verify
SELECT name, display_name, '$' || (price_monthly / 100.0)::text || '/mo' AS price
FROM subscription_plans
ORDER BY sort_order;
