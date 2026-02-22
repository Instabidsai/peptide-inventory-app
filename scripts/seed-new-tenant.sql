-- ================================================================
-- SEED DATA SCRIPT: Set up a new tenant
-- ================================================================
-- Usage: Replace all {{PLACEHOLDERS}} with actual values, then run.
-- Prerequisite: schema-master.sql has been run successfully.
--               subscription_plans table has been seeded.
-- ================================================================

-- ──────────────────────────────────────────────────────────────────
-- 1. Create the organization
-- ──────────────────────────────────────────────────────────────────
INSERT INTO organizations (name)
VALUES ('{{ORG_NAME}}')
RETURNING id;
-- ⬆ Copy the returned UUID and paste below as {{ORG_ID}}.

-- ──────────────────────────────────────────────────────────────────
-- 2. Create tenant config (branding, shipping, payment, AI)
-- ──────────────────────────────────────────────────────────────────
INSERT INTO tenant_config (
    org_id,
    brand_name,
    admin_brand_name,
    support_email,
    app_url,
    logo_url,
    primary_color,
    ship_from_name,
    ship_from_street,
    ship_from_city,
    ship_from_state,
    ship_from_zip,
    ship_from_country,
    ship_from_phone,
    ship_from_email,
    zelle_email,
    venmo_handle,
    cashapp_handle,
    ai_system_prompt_override,
    session_timeout_minutes
) VALUES (
    '{{ORG_ID}}',
    '{{BRAND_NAME}}',                -- e.g. 'PeptideHealth'
    '{{ADMIN_BRAND_NAME}}',          -- e.g. 'NextGen Research Labs'
    '{{SUPPORT_EMAIL}}',             -- e.g. 'support@example.com'
    '{{APP_URL}}',                   -- e.g. 'https://app.example.com'
    '',                              -- logo_url (upload later in admin)
    '#7c3aed',                       -- primary_color (default purple)
    '{{SHIP_FROM_NAME}}',
    '{{SHIP_FROM_STREET}}',
    '{{SHIP_FROM_CITY}}',
    '{{SHIP_FROM_STATE}}',
    '{{SHIP_FROM_ZIP}}',
    'US',
    '{{SHIP_FROM_PHONE}}',
    '{{SHIP_FROM_EMAIL}}',
    '{{ZELLE_EMAIL}}',               -- leave '' if not using Zelle
    '{{VENMO_HANDLE}}',              -- leave '' if not using Venmo
    '{{CASHAPP_HANDLE}}',            -- leave '' if not using CashApp
    NULL,                            -- ai_system_prompt_override (NULL = use default)
    60                               -- session timeout in minutes
);

-- ──────────────────────────────────────────────────────────────────
-- 3. Create the admin user
-- ──────────────────────────────────────────────────────────────────
-- OPTION A (recommended): Use the self-signup or invite-user edge function.
--   The edge function creates the auth.users entry, profile, and role.
--
-- OPTION B (manual): If the user already exists in auth.users:
/*
INSERT INTO profiles (id, user_id, full_name, org_id, role)
VALUES (gen_random_uuid(), '{{ADMIN_USER_ID}}', '{{ADMIN_NAME}}', '{{ORG_ID}}', 'admin');

INSERT INTO user_roles (user_id, org_id, role)
VALUES ('{{ADMIN_USER_ID}}', '{{ORG_ID}}', 'admin');
*/

-- ──────────────────────────────────────────────────────────────────
-- 4. Link to a subscription plan
-- ──────────────────────────────────────────────────────────────────
-- Default: link to 'free' plan. Change plan name for paid tenants.
INSERT INTO tenant_subscriptions (org_id, plan_id, status, billing_period)
SELECT '{{ORG_ID}}', sp.id, 'active', 'monthly'
FROM subscription_plans sp
WHERE sp.name = 'free'
ON CONFLICT (org_id) DO NOTHING;

-- ──────────────────────────────────────────────────────────────────
-- 5. Seed default pricing tiers
-- ──────────────────────────────────────────────────────────────────
INSERT INTO pricing_tiers (org_id, name, markup_pct, is_default) VALUES
    ('{{ORG_ID}}', 'Retail',   1.00, true),
    ('{{ORG_ID}}', 'Partner',  0.70, false),
    ('{{ORG_ID}}', 'VIP',      0.80, false);

-- ──────────────────────────────────────────────────────────────────
-- 6. Seed default automation modules
-- ──────────────────────────────────────────────────────────────────
INSERT INTO automation_modules (org_id, module_type, enabled, config) VALUES
    ('{{ORG_ID}}', 'payment_email_scanner', false, '{"schedule": "every_30_min"}'::jsonb),
    ('{{ORG_ID}}', 'low_stock_alert',       false, '{"threshold": 5}'::jsonb),
    ('{{ORG_ID}}', 'order_auto_fulfill',    false, '{}'::jsonb),
    ('{{ORG_ID}}', 'commission_auto_calc',   false, '{}'::jsonb)
ON CONFLICT (org_id, module_type) DO NOTHING;

-- ──────────────────────────────────────────────────────────────────
-- 7. Seed sample peptides (OPTIONAL — skip if importing from CSV)
-- ──────────────────────────────────────────────────────────────────
/*
INSERT INTO peptides (org_id, name, sku, base_price, default_concentration_mg_ml, category, in_stock)
VALUES
    ('{{ORG_ID}}', 'BPC-157',     'BPC-5MG',  45.00, 2.5, 'recovery',  true),
    ('{{ORG_ID}}', 'TB-500',      'TB-5MG',   55.00, 2.5, 'recovery',  true),
    ('{{ORG_ID}}', 'Semaglutide', 'SEMA-5MG', 120.00, 2.5, 'metabolic', true),
    ('{{ORG_ID}}', 'CJC-1295',    'CJC-2MG',  65.00, 2.0, 'growth',    true),
    ('{{ORG_ID}}', 'Ipamorelin',  'IPA-5MG',  55.00, 2.5, 'growth',    true);
*/

-- ──────────────────────────────────────────────────────────────────
-- 8. Verify setup
-- ──────────────────────────────────────────────────────────────────
SELECT 'Organization'     AS entity, name                FROM organizations       WHERE id = '{{ORG_ID}}'
UNION ALL
SELECT 'Brand Name',                 brand_name          FROM tenant_config        WHERE org_id = '{{ORG_ID}}'
UNION ALL
SELECT 'Admin Brand',               admin_brand_name     FROM tenant_config        WHERE org_id = '{{ORG_ID}}'
UNION ALL
SELECT 'Subscription',              sp.display_name      FROM tenant_subscriptions ts JOIN subscription_plans sp ON sp.id = ts.plan_id WHERE ts.org_id = '{{ORG_ID}}'
UNION ALL
SELECT 'Pricing Tiers',             count(*)::text       FROM pricing_tiers        WHERE org_id = '{{ORG_ID}}'
UNION ALL
SELECT 'Automation Modules',        count(*)::text       FROM automation_modules   WHERE org_id = '{{ORG_ID}}';
