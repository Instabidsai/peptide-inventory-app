-- WooCommerce sync columns
ALTER TABLE sales_orders
  ADD COLUMN IF NOT EXISTS order_source TEXT DEFAULT 'app',
  ADD COLUMN IF NOT EXISTS woo_order_id BIGINT,
  ADD COLUMN IF NOT EXISTS woo_status TEXT,
  ADD COLUMN IF NOT EXISTS woo_date_created TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS woo_date_modified TIMESTAMPTZ;

-- Per-order profit columns
ALTER TABLE sales_orders
  ADD COLUMN IF NOT EXISTS cogs_amount NUMERIC DEFAULT 0,
  ADD COLUMN IF NOT EXISTS profit_amount NUMERIC DEFAULT 0;

-- Dedup index: one row per WooCommerce order
CREATE UNIQUE INDEX IF NOT EXISTS idx_sales_orders_woo_order_id
  ON sales_orders(woo_order_id) WHERE woo_order_id IS NOT NULL;

-- Filter by order source
CREATE INDEX IF NOT EXISTS idx_sales_orders_order_source
  ON sales_orders(order_source);
