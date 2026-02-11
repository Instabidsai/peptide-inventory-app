-- Add PsiFi payment tracking columns to sales_orders
ALTER TABLE sales_orders
  ADD COLUMN IF NOT EXISTS psifi_session_id TEXT,
  ADD COLUMN IF NOT EXISTS psifi_transaction_id TEXT,
  ADD COLUMN IF NOT EXISTS psifi_status TEXT DEFAULT 'none';

-- Index for quick webhook lookups by session ID
CREATE INDEX IF NOT EXISTS idx_sales_orders_psifi_session
  ON sales_orders(psifi_session_id);
