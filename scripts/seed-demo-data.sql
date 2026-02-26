-- ============================================================
-- Seed Demo Data for ThePeptideAI
-- ============================================================
-- Usage: Run against a tenant's org_id to populate with sample data.
--
-- Before running, set the target org_id:
--   \set target_org '00000000-0000-0000-0000-000000000000'
--
-- Or replace all instances of :target_org with your actual org UUID.
--
-- This script is IDEMPOTENT — uses ON CONFLICT DO NOTHING where possible.
-- ============================================================

-- ── 1. Sample Peptides ──
INSERT INTO peptides (org_id, name, description, sku, retail_price, base_cost, active, catalog_source,
                      default_dose_amount, default_dose_unit, default_frequency, default_timing, default_concentration_mg_ml)
VALUES
  (:target_org, 'BPC-157',       'Body Protection Compound — supports gut and tissue repair.',             'BPC-5MG',    45.00,  18.00, true, 'manual', 250, 'mcg', 'daily',       'morning',  5.0),
  (:target_org, 'TB-500',        'Thymosin Beta-4 — supports wound healing and recovery.',                 'TB-5MG',     55.00,  22.00, true, 'manual', 2.5, 'mg',  'twice_weekly','evening',  5.0),
  (:target_org, 'Semaglutide',   'GLP-1 receptor agonist — supports metabolic health.',                    'SEMA-5MG',  120.00,  65.00, true, 'manual', 0.25,'mg',  'weekly',      'morning', 2.5),
  (:target_org, 'CJC-1295',      'Growth hormone releasing hormone analog — supports recovery and sleep.', 'CJC-2MG',    65.00,  28.00, true, 'manual', 100, 'mcg', 'daily',       'evening',  2.0),
  (:target_org, 'Ipamorelin',    'Growth hormone secretagogue — pairs well with CJC-1295.',                'IPA-5MG',    55.00,  20.00, true, 'manual', 200, 'mcg', 'daily',       'evening',  5.0),
  (:target_org, 'PT-141',        'Bremelanotide — melanocortin receptor agonist.',                         'PT141-10MG', 75.00,  32.00, true, 'manual', 1.5, 'mg',  'as_needed',   'evening', 10.0),
  (:target_org, 'Tirzepatide',   'Dual GIP/GLP-1 receptor agonist — metabolic support.',                   'TIRZ-5MG',  150.00,  85.00, true, 'manual', 2.5, 'mg',  'weekly',      'morning',  5.0),
  (:target_org, 'NAD+',          'Nicotinamide adenine dinucleotide — cellular energy support.',            'NAD-500MG', 180.00,  95.00, true, 'manual', 100, 'mg',  'twice_weekly','morning', 50.0),
  (:target_org, 'GHK-Cu',        'Copper peptide — skin and hair support.',                                'GHKCU-5MG',  50.00,  19.00, true, 'manual', 200, 'mcg', 'daily',       'morning',  5.0),
  (:target_org, 'MOTS-c',        'Mitochondrial-derived peptide — exercise mimetic.',                      'MOTSC-5MG',  90.00,  42.00, true, 'manual', 5.0, 'mg',  'three_weekly','morning',  5.0)
ON CONFLICT DO NOTHING;


-- ── 2. Sample Contacts ──
INSERT INTO contacts (org_id, name, email, phone, type, company, source, tier, notes)
VALUES
  (:target_org, 'John Smith',        'john.smith@example.com',    '555-0101', 'customer', NULL,                   'manual', NULL,      'Regular client — BPC protocol'),
  (:target_org, 'Sarah Johnson',     'sarah.j@example.com',       '555-0102', 'customer', NULL,                   'manual', NULL,      'Interested in weight management peptides'),
  (:target_org, 'Mike Williams',     'mike.w@example.com',        '555-0103', 'customer', NULL,                   'manual', NULL,      'Recovery-focused — TB-500 + BPC stack'),
  (:target_org, 'Emily Davis',       'emily.d@example.com',       '555-0104', 'customer', NULL,                   'manual', NULL,      'GH secretagogue protocol'),
  (:target_org, 'Dr. Alex Chen',     'alex.chen@wellness.com',    '555-0201', 'partner',  'Chen Wellness Clinic', 'manual', 'network', 'Referring physician — 10% commission'),
  (:target_org, 'Dr. Lisa Park',     'lisa.park@integrative.com', '555-0202', 'partner',  'Integrative Health',   'manual', 'network', 'Partner since Jan 2026'),
  (:target_org, 'David Martinez',    'david.m@fitlife.com',       '555-0203', 'partner',  'FitLife Coaching',     'manual', 'family',  'Fitness influencer referral partner'),
  (:target_org, 'Jennifer Lee',      'jen.lee@example.com',       '555-0301', 'preferred','VIP Peptides',         'manual', NULL,      'Bulk buyer — 15% discount'),
  (:target_org, 'Robert Taylor',     'rob.t@example.com',         '555-0302', 'customer', NULL,                   'manual', NULL,      'New client — consultation pending'),
  (:target_org, 'Amanda Wilson',     'amanda.w@example.com',      '555-0303', 'customer', NULL,                   'manual', NULL,      'NAD+ protocol client')
ON CONFLICT DO NOTHING;


-- ── 3. Sample Sales Orders ──
-- These reference contacts and peptides by name — we use subqueries.
-- Order 1: John Smith — BPC + TB stack
INSERT INTO sales_orders (org_id, client_id, status, total_amount, payment_status, amount_paid, payment_method, shipping_address, notes, delivery_method, order_source)
SELECT
  :target_org,
  c.id,
  'fulfilled',
  100.00,
  'paid',
  100.00,
  'zelle',
  '123 Main St, Austin TX 78701',
  'BPC + TB recovery stack',
  'ship',
  'manual'
FROM contacts c WHERE c.org_id = :target_org AND c.name = 'John Smith' LIMIT 1
ON CONFLICT DO NOTHING;

-- Order 2: Sarah Johnson — Semaglutide
INSERT INTO sales_orders (org_id, client_id, status, total_amount, payment_status, amount_paid, payment_method, notes, delivery_method, order_source)
SELECT
  :target_org,
  c.id,
  'submitted',
  120.00,
  'paid',
  120.00,
  'venmo',
  'First month semaglutide',
  'pickup',
  'manual'
FROM contacts c WHERE c.org_id = :target_org AND c.name = 'Sarah Johnson' LIMIT 1
ON CONFLICT DO NOTHING;

-- Order 3: Mike Williams — TB-500 x2
INSERT INTO sales_orders (org_id, client_id, status, total_amount, payment_status, amount_paid, payment_method, shipping_address, notes, delivery_method, order_source)
SELECT
  :target_org,
  c.id,
  'draft',
  110.00,
  'unpaid',
  0.00,
  NULL,
  '456 Oak Ave, Dallas TX 75201',
  'Awaiting payment',
  'ship',
  'manual'
FROM contacts c WHERE c.org_id = :target_org AND c.name = 'Mike Williams' LIMIT 1
ON CONFLICT DO NOTHING;

-- Order 4: Emily Davis — CJC + Ipamorelin combo
INSERT INTO sales_orders (org_id, client_id, status, total_amount, payment_status, amount_paid, payment_method, notes, delivery_method, order_source)
SELECT
  :target_org,
  c.id,
  'fulfilled',
  120.00,
  'paid',
  120.00,
  'cashapp',
  'GH stack — monthly refill',
  'pickup',
  'manual'
FROM contacts c WHERE c.org_id = :target_org AND c.name = 'Emily Davis' LIMIT 1
ON CONFLICT DO NOTHING;

-- Order 5: Jennifer Lee — Bulk order
INSERT INTO sales_orders (org_id, client_id, status, total_amount, payment_status, amount_paid, payment_method, shipping_address, notes, delivery_method, order_source)
SELECT
  :target_org,
  c.id,
  'submitted',
  425.00,
  'partial',
  200.00,
  'zelle',
  '789 Elm St, Houston TX 77001',
  'Bulk order — preferred pricing applied',
  'ship',
  'manual'
FROM contacts c WHERE c.org_id = :target_org AND c.name = 'Jennifer Lee' LIMIT 1
ON CONFLICT DO NOTHING;


-- ── 4. Sample Order Items ──
-- Insert items for the first two orders (by matching on notes as a stable identifier)

-- John Smith order items: BPC-157 + TB-500
INSERT INTO sales_order_items (sales_order_id, peptide_id, quantity, unit_price)
SELECT so.id, p.id, 1, 45.00
FROM sales_orders so
JOIN contacts c ON so.client_id = c.id
JOIN peptides p ON p.org_id = :target_org AND p.name = 'BPC-157'
WHERE so.org_id = :target_org AND c.name = 'John Smith' AND so.notes LIKE '%BPC + TB%'
LIMIT 1
ON CONFLICT DO NOTHING;

INSERT INTO sales_order_items (sales_order_id, peptide_id, quantity, unit_price)
SELECT so.id, p.id, 1, 55.00
FROM sales_orders so
JOIN contacts c ON so.client_id = c.id
JOIN peptides p ON p.org_id = :target_org AND p.name = 'TB-500'
WHERE so.org_id = :target_org AND c.name = 'John Smith' AND so.notes LIKE '%BPC + TB%'
LIMIT 1
ON CONFLICT DO NOTHING;

-- Sarah Johnson order items: Semaglutide
INSERT INTO sales_order_items (sales_order_id, peptide_id, quantity, unit_price)
SELECT so.id, p.id, 1, 120.00
FROM sales_orders so
JOIN contacts c ON so.client_id = c.id
JOIN peptides p ON p.org_id = :target_org AND p.name = 'Semaglutide'
WHERE so.org_id = :target_org AND c.name = 'Sarah Johnson' AND so.notes LIKE '%semaglutide%'
LIMIT 1
ON CONFLICT DO NOTHING;

-- Emily Davis order items: CJC-1295 + Ipamorelin
INSERT INTO sales_order_items (sales_order_id, peptide_id, quantity, unit_price)
SELECT so.id, p.id, 1, 65.00
FROM sales_orders so
JOIN contacts c ON so.client_id = c.id
JOIN peptides p ON p.org_id = :target_org AND p.name = 'CJC-1295'
WHERE so.org_id = :target_org AND c.name = 'Emily Davis' AND so.notes LIKE '%GH stack%'
LIMIT 1
ON CONFLICT DO NOTHING;

INSERT INTO sales_order_items (sales_order_id, peptide_id, quantity, unit_price)
SELECT so.id, p.id, 1, 55.00
FROM sales_orders so
JOIN contacts c ON so.client_id = c.id
JOIN peptides p ON p.org_id = :target_org AND p.name = 'Ipamorelin'
WHERE so.org_id = :target_org AND c.name = 'Emily Davis' AND so.notes LIKE '%GH stack%'
LIMIT 1
ON CONFLICT DO NOTHING;


-- ── 5. Sample Lots (purchase orders) ──
INSERT INTO orders (org_id, peptide_id, quantity_ordered, estimated_cost_per_unit, status, supplier, notes, expected_arrival_date)
SELECT :target_org, p.id, 20, 18.00, 'received', 'PeptideSciences', 'Initial BPC stock',  NOW() - interval '30 days'
FROM peptides p WHERE p.org_id = :target_org AND p.name = 'BPC-157' LIMIT 1
ON CONFLICT DO NOTHING;

INSERT INTO orders (org_id, peptide_id, quantity_ordered, estimated_cost_per_unit, status, supplier, notes, expected_arrival_date)
SELECT :target_org, p.id, 15, 22.00, 'received', 'PeptideSciences', 'TB-500 restock',     NOW() - interval '20 days'
FROM peptides p WHERE p.org_id = :target_org AND p.name = 'TB-500' LIMIT 1
ON CONFLICT DO NOTHING;

INSERT INTO orders (org_id, peptide_id, quantity_ordered, estimated_cost_per_unit, status, supplier, notes, expected_arrival_date)
SELECT :target_org, p.id, 10, 65.00, 'pending',  'CompoundPharmacy', 'Sema monthly order', NOW() + interval '7 days'
FROM peptides p WHERE p.org_id = :target_org AND p.name = 'Semaglutide' LIMIT 1
ON CONFLICT DO NOTHING;

INSERT INTO orders (org_id, peptide_id, quantity_ordered, estimated_cost_per_unit, status, supplier, notes, expected_arrival_date)
SELECT :target_org, p.id, 25, 28.00, 'received', 'PeptideSciences', 'CJC batch #3',       NOW() - interval '10 days'
FROM peptides p WHERE p.org_id = :target_org AND p.name = 'CJC-1295' LIMIT 1
ON CONFLICT DO NOTHING;

INSERT INTO orders (org_id, peptide_id, quantity_ordered, estimated_cost_per_unit, status, supplier, notes, expected_arrival_date)
SELECT :target_org, p.id, 25, 20.00, 'received', 'PeptideSciences', 'Ipamorelin batch #2', NOW() - interval '10 days'
FROM peptides p WHERE p.org_id = :target_org AND p.name = 'Ipamorelin' LIMIT 1
ON CONFLICT DO NOTHING;


-- ── 6. Summary ──
-- After running this script, the tenant will have:
--   10 peptides (common protocols)
--   10 contacts (4 customers, 3 partners, 1 preferred, 2 general)
--    5 sales orders (mix of draft/submitted/fulfilled, various payment statuses)
--    5 order items (linked to sales orders)
--    5 purchase order lots (BPC, TB, Sema, CJC, Ipa)
--
-- To verify:
--   SELECT 'peptides' as tbl, count(*) FROM peptides WHERE org_id = :target_org
--   UNION ALL SELECT 'contacts', count(*) FROM contacts WHERE org_id = :target_org
--   UNION ALL SELECT 'sales_orders', count(*) FROM sales_orders WHERE org_id = :target_org
--   UNION ALL SELECT 'orders', count(*) FROM orders WHERE org_id = :target_org;
