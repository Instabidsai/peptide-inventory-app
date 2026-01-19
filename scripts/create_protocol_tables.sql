
-- Run this in your Supabase SQL Editor

-- 1. Create Protocols Table
CREATE TABLE IF NOT EXISTS protocols (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id UUID REFERENCES organizations(id) NOT NULL,
  contact_id UUID REFERENCES contacts(id) ON DELETE CASCADE, -- Linked to a Person
  name TEXT NOT NULL,
  description TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- 2. Create Protocol Items Table
CREATE TABLE IF NOT EXISTS protocol_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  protocol_id UUID REFERENCES protocols(id) ON DELETE CASCADE NOT NULL,
  peptide_id UUID REFERENCES peptides(id) ON DELETE CASCADE NOT NULL,
  dosage_amount NUMERIC NOT NULL,
  dosage_unit TEXT NOT NULL DEFAULT 'mcg',
  frequency TEXT NOT NULL, -- e.g. 'Daily', '3x/week'
  duration_weeks NUMERIC NOT NULL,
  price_tier TEXT NOT NULL DEFAULT 'retail', -- 'at_cost', 'wholesale', 'retail'
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- 3. Enable RLS (Optional but recommended)
ALTER TABLE protocols ENABLE ROW LEVEL SECURITY;
ALTER TABLE protocol_items ENABLE ROW LEVEL SECURITY;

-- 4. Create Policies (Simple Open Policy for authenticated users for now)
CREATE POLICY "Enable all for authenticated users" ON protocols
    FOR ALL USING (auth.role() = 'authenticated');

CREATE POLICY "Enable all for authenticated users" ON protocol_items
    FOR ALL USING (auth.role() = 'authenticated');
