
-- Add Payment Tracking to Orders
ALTER TABLE orders 
ADD COLUMN IF NOT EXISTS payment_status TEXT DEFAULT 'unpaid' CHECK (payment_status IN ('unpaid', 'partial', 'paid')),
ADD COLUMN IF NOT EXISTS amount_paid DECIMAL(10, 2) DEFAULT 0.00;

-- Optional: Add index
CREATE INDEX IF NOT EXISTS idx_orders_payment_status ON orders(payment_status);
