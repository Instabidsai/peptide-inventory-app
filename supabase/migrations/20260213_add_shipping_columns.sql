-- Add shipping tracking columns to sales_orders
ALTER TABLE sales_orders
  ADD COLUMN IF NOT EXISTS tracking_number TEXT,
  ADD COLUMN IF NOT EXISTS carrier TEXT,
  ADD COLUMN IF NOT EXISTS shipping_status TEXT DEFAULT 'pending',
  ADD COLUMN IF NOT EXISTS ship_date TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS shipping_cost NUMERIC DEFAULT 0,
  ADD COLUMN IF NOT EXISTS label_url TEXT,
  ADD COLUMN IF NOT EXISTS shippo_shipment_id TEXT,
  ADD COLUMN IF NOT EXISTS shippo_transaction_id TEXT,
  ADD COLUMN IF NOT EXISTS shipping_error TEXT;

-- Index for the polling script to quickly find shippable orders
CREATE INDEX IF NOT EXISTS idx_sales_orders_shipping_pending
  ON sales_orders(status, shipping_status)
  WHERE status = 'fulfilled' AND shipping_status = 'pending';
