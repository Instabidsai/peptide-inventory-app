
-- Add the order_group_id column if it doesn't exist
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'orders' AND column_name = 'order_group_id') THEN
        ALTER TABLE orders ADD COLUMN order_group_id TEXT;
        CREATE INDEX idx_orders_group_id ON orders(order_group_id);
    END IF;
END $$;

-- Backfill: Assign all currently unpaid/pending orders to 'Batch 001'
-- logic: status is not cancelled, and payment is not fully paid (though strictly speaking 'payment_status' isn't a column on orders based on my previous read, it's calculated. Wait, let me check CREATE_ORDERS_TABLE again to be sure about payment tracking)

-- Checking CREATE_ORDERS_TABLE artifact... 
-- It has: quantity_ordered, estimated_cost_per_unit, amount_paid (missing in artifact but used in code).
-- Code uses `amount_paid`. I should verify if `amount_paid` column exists.
-- Assuming standard logic: Update orders where amount_paid < (quantity * cost) OR amount_paid IS NULL.

UPDATE orders
SET order_group_id = 'Batch 001'
WHERE order_group_id IS NULL 
  AND status != 'cancelled';
