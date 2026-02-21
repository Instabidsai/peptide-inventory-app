-- ═══════════════════════════════════════════════════════════════════════════════
-- Migration: 20260221_commission_offset.sql
-- Date: 2026-02-21
-- Purpose: Retroactively set payment_status='commission_offset' for partner
--          product purchases. Partners don't pay cash — their product orders
--          are offset against earned commissions. The 'unpaid' status was
--          misleading for these orders.
-- STATUS: EXECUTED SUCCESSFULLY on 2026-02-21
-- ═══════════════════════════════════════════════════════════════════════════════

-- Step 0: Add 'commission_offset' to the CHECK constraint
ALTER TABLE sales_orders DROP CONSTRAINT IF EXISTS sales_orders_payment_status_check;
ALTER TABLE sales_orders ADD CONSTRAINT sales_orders_payment_status_check
    CHECK (payment_status = ANY (ARRAY['unpaid'::text, 'paid'::text, 'partial'::text, 'refunded'::text, 'commission_offset'::text]));

-- Step 1: Update sales_orders where the client IS a partner (by contact type)
UPDATE sales_orders
SET payment_status = 'commission_offset',
    payment_method = 'commission_offset'
WHERE client_id IN (
    SELECT id FROM contacts WHERE type = 'partner'
)
AND payment_status = 'unpaid'
AND org_id = '33a18316-b0a4-4d85-a770-d1ceb762bd4f';

-- Step 2: Update movements linked to commission_offset sales orders via [SO:uuid] notes
UPDATE movements m
SET payment_status = 'commission_offset'
FROM sales_orders so
WHERE m.notes LIKE '%[SO:' || so.id::text || ']%'
  AND so.payment_status = 'commission_offset'
  AND m.payment_status = 'unpaid';

-- Step 3: Fallback — update sale movements by contact_id for partner contacts
UPDATE movements
SET payment_status = 'commission_offset'
WHERE contact_id IN (
    SELECT id FROM contacts WHERE type = 'partner'
)
AND payment_status = 'unpaid'
AND type = 'sale'
AND org_id = '33a18316-b0a4-4d85-a770-d1ceb762bd4f';

-- Step 4: Zero out merchant fees on commission_offset orders (they're exempt)
UPDATE sales_orders
SET merchant_fee = 0
WHERE payment_status = 'commission_offset'
  AND COALESCE(merchant_fee, 0) > 0;

-- Step 5: Recalculate profit for updated orders
UPDATE sales_orders
SET profit_amount = COALESCE(total_amount, 0)
    - COALESCE(cogs_amount, 0)
    - COALESCE(shipping_cost, 0)
    - COALESCE(commission_amount, 0)
    - COALESCE(merchant_fee, 0)
WHERE payment_status = 'commission_offset';
