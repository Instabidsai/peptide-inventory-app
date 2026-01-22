-- Enable RLS on all new tables
-- 1. Client Inventory (The Digital Fridge)
CREATE TABLE IF NOT EXISTS client_inventory (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  contact_id UUID REFERENCES contacts(id) ON DELETE CASCADE,
  peptide_id UUID REFERENCES peptides(id),
  batch_number TEXT,
  vial_size_mg NUMERIC NOT NULL,
  water_added_ml NUMERIC,
  concentration_mg_ml NUMERIC, -- Cached calculation
  reconstituted_at TIMESTAMPTZ,
  expires_at TIMESTAMPTZ,
  current_quantity_mg NUMERIC NOT NULL,
  status TEXT DEFAULT 'active' CHECK (status IN ('active', 'finished', 'archived')),
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

ALTER TABLE client_inventory ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own inventory" ON client_inventory
  FOR SELECT USING (
    contact_id IN (SELECT id FROM contacts WHERE linked_user_id = auth.uid())
  );

CREATE POLICY "Users can insert own inventory" ON client_inventory
  FOR INSERT WITH CHECK (
    contact_id IN (SELECT id FROM contacts WHERE linked_user_id = auth.uid())
  );

CREATE POLICY "Users can update own inventory" ON client_inventory
  FOR UPDATE USING (
    contact_id IN (SELECT id FROM contacts WHERE linked_user_id = auth.uid())
  );

CREATE POLICY "Users can delete own inventory" ON client_inventory
  FOR DELETE USING (
    contact_id IN (SELECT id FROM contacts WHERE linked_user_id = auth.uid())
  );


-- 2. Client Daily Logs (The Quantified Self)
CREATE TABLE IF NOT EXISTS client_daily_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  contact_id UUID REFERENCES contacts(id) ON DELETE CASCADE,
  log_date DATE NOT NULL,
  weight_lbs NUMERIC,
  body_fat_pct NUMERIC,
  water_intake_oz NUMERIC,
  notes TEXT,
  side_effects TEXT[], -- Array of strings
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(contact_id, log_date)
);

ALTER TABLE client_daily_logs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own logs" ON client_daily_logs
  FOR SELECT USING (
    contact_id IN (SELECT id FROM contacts WHERE linked_user_id = auth.uid())
  );

CREATE POLICY "Users can manage own logs" ON client_daily_logs
  FOR ALL USING (
    contact_id IN (SELECT id FROM contacts WHERE linked_user_id = auth.uid())
  );


-- 3. Client Supplements (The Stack)
CREATE TABLE IF NOT EXISTS client_supplements (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  contact_id UUID REFERENCES contacts(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  dosage TEXT,
  frequency TEXT,
  created_at TIMESTAMPTZ DEFAULT now()
);

ALTER TABLE client_supplements ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own supplements" ON client_supplements
  FOR SELECT USING (
    contact_id IN (SELECT id FROM contacts WHERE linked_user_id = auth.uid())
  );

CREATE POLICY "Users can manage own supplements" ON client_supplements
  FOR ALL USING (
    contact_id IN (SELECT id FROM contacts WHERE linked_user_id = auth.uid())
  );
