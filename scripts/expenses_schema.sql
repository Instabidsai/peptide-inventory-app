-- Create Earnings/Expenses Table
CREATE TABLE IF NOT EXISTS expenses (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL,
    date DATE NOT NULL DEFAULT CURRENT_DATE,
    category TEXT NOT NULL CHECK (category IN ('startup', 'operating', 'inventory', 'commission', 'other')),
    amount DECIMAL(10, 2) NOT NULL,
    description TEXT,
    recipient TEXT, -- Supplier Name, Partner Name, etc.
    payment_method TEXT,
    status TEXT DEFAULT 'paid' CHECK (status IN ('paid', 'pending')),
    related_order_id UUID REFERENCES orders(id), -- For Inventory Purchases
    related_sales_order_id UUID REFERENCES sales_orders(id) -- For Commission Payouts
);

-- Index for faster filtering
CREATE INDEX IF NOT EXISTS idx_expenses_date ON expenses(date);
CREATE INDEX IF NOT EXISTS idx_expenses_category ON expenses(category);
