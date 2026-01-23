-- Add Commission Columns to Sales Orders
ALTER TABLE sales_orders 
ADD COLUMN IF NOT EXISTS commission_amount DECIMAL(10, 2) DEFAULT 0.00,
ADD COLUMN IF NOT EXISTS commission_status TEXT DEFAULT 'pending' CHECK (commission_status IN ('pending', 'available', 'paid', 'credited'));

-- Add Wallet/Credit Balance to Profiles
ALTER TABLE profiles 
ADD COLUMN IF NOT EXISTS credit_balance DECIMAL(10, 2) DEFAULT 0.00;

-- Optional: Create an index for faster commission lookups by rep
CREATE INDEX IF NOT EXISTS idx_sales_orders_rep_id ON sales_orders(rep_id);
