-- Add shopify_order_id column to sales_orders for proper duplicate detection
-- Previously, Shopify order dedup relied on fragile ILIKE pattern matching on notes field

ALTER TABLE sales_orders ADD COLUMN IF NOT EXISTS shopify_order_id TEXT;

CREATE INDEX IF NOT EXISTS idx_sales_orders_shopify_order_id
  ON sales_orders(shopify_order_id)
  WHERE shopify_order_id IS NOT NULL;
