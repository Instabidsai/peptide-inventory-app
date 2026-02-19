-- ================================================================
-- SEED DATA SCRIPT: Set up a new tenant
-- Usage: Replace all {{PLACEHOLDERS}} with actual values, then run.
-- ================================================================

-- 1. Create the organization
INSERT INTO organizations (name)
VALUES ('{{ORG_NAME}}')
RETURNING id;
-- ⬆ Copy the returned UUID for the steps below.

-- 2. Create tenant config (branding, shipping, etc.)
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
    session_timeout_minutes
) VALUES (
    '{{ORG_ID}}',
    '{{BRAND_NAME}}',           -- e.g. 'PeptideHealth'
    '{{ADMIN_BRAND_NAME}}',     -- e.g. 'NextGen Research Labs'
    '{{SUPPORT_EMAIL}}',
    '{{APP_URL}}',              -- e.g. 'https://app.example.com'
    '',                         -- logo_url (optional)
    '#7c3aed',                  -- primary_color (default purple)
    '{{SHIP_FROM_NAME}}',
    '{{SHIP_FROM_STREET}}',
    '{{SHIP_FROM_CITY}}',
    '{{SHIP_FROM_STATE}}',
    '{{SHIP_FROM_ZIP}}',
    'US',
    '{{SHIP_FROM_PHONE}}',
    '{{SHIP_FROM_EMAIL}}',
    '{{ZELLE_EMAIL}}',
    60                          -- session timeout in minutes
);

-- 3. Create the admin user (requires Supabase auth.users entry first)
-- Option A: Use the invite-user edge function from the admin panel
-- Option B: Manual insert (if user already exists in auth.users):
/*
INSERT INTO user_roles (user_id, org_id, role)
VALUES ('{{ADMIN_USER_ID}}', '{{ORG_ID}}', 'admin');

INSERT INTO profiles (id, full_name, org_id, role)
VALUES ('{{ADMIN_USER_ID}}', '{{ADMIN_NAME}}', '{{ORG_ID}}', 'admin');
*/

-- 4. Seed default pricing tiers
INSERT INTO pricing_tiers (org_id, name, markup_pct, is_default) VALUES
    ('{{ORG_ID}}', 'Retail',   1.00, true),
    ('{{ORG_ID}}', 'Partner',  0.70, false),
    ('{{ORG_ID}}', 'VIP',      0.80, false);

-- 5. Seed sample peptides (optional — skip if importing from CSV)
/*
INSERT INTO peptides (org_id, name, sku, base_price, default_concentration_mg_ml, category, in_stock)
VALUES
    ('{{ORG_ID}}', 'BPC-157',     'BPC-5MG',  45.00, 2.5, 'recovery',  true),
    ('{{ORG_ID}}', 'TB-500',      'TB-5MG',   55.00, 2.5, 'recovery',  true),
    ('{{ORG_ID}}', 'Semaglutide', 'SEMA-5MG', 120.00, 2.5, 'metabolic', true),
    ('{{ORG_ID}}', 'CJC-1295',    'CJC-2MG',  65.00, 2.0, 'growth',    true),
    ('{{ORG_ID}}', 'Ipamorelin',  'IPA-5MG',  55.00, 2.5, 'growth',    true);
*/

-- 6. Verify setup
SELECT 'Organization' AS entity, name AS value FROM organizations WHERE id = '{{ORG_ID}}'
UNION ALL
SELECT 'Brand Name', brand_name FROM tenant_config WHERE org_id = '{{ORG_ID}}'
UNION ALL
SELECT 'Admin Brand', admin_brand_name FROM tenant_config WHERE org_id = '{{ORG_ID}}'
UNION ALL
SELECT 'Pricing Tiers', count(*)::text FROM pricing_tiers WHERE org_id = '{{ORG_ID}}';
