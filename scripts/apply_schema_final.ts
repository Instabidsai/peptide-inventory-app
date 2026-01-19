
import pg from 'pg';
const { Client } = pg;

const password = 'eApOyEConVNU0nQj';
const projectRef = "mckkegmkpqdicudnfhor";

const config = {
  host: 'aws-0-us-east-1.pooler.supabase.com',
  port: 6543,
  user: `postgres.${projectRef}`, // Correct Pooler Username
  password: password,
  database: 'postgres',
  ssl: { rejectUnauthorized: false },
  connectionTimeoutMillis: 10000
};

async function apply() {
  console.log(`Connecting to ${config.host} as ${config.user}...`);
  const client = new Client(config);

  try {
    await client.connect();
    console.log('✅ Connected!');

    const sql = `
      -- 1. Create Protocols Table
      CREATE TABLE IF NOT EXISTS protocols (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        org_id UUID REFERENCES organizations(id) NOT NULL,
        contact_id UUID REFERENCES contacts(id) ON DELETE CASCADE,
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
        frequency TEXT NOT NULL, 
        duration_weeks NUMERIC NOT NULL,
        price_tier TEXT NOT NULL DEFAULT 'retail', -- 'at_cost', 'wholesale', 'retail'
        created_at TIMESTAMPTZ DEFAULT NOW(),
        updated_at TIMESTAMPTZ DEFAULT NOW()
      );

      -- 3. Security
      ALTER TABLE protocols ENABLE ROW LEVEL SECURITY;
      ALTER TABLE protocol_items ENABLE ROW LEVEL SECURITY;

      DO $$
      BEGIN
        IF NOT EXISTS (SELECT FROM pg_policies WHERE tablename = 'protocols' AND policyname = 'Enable all for authenticated users') THEN
          CREATE POLICY "Enable all for authenticated users" ON protocols FOR ALL USING (auth.role() = 'authenticated');
        END IF;
        
        IF NOT EXISTS (SELECT FROM pg_policies WHERE tablename = 'protocol_items' AND policyname = 'Enable all for authenticated users') THEN
          CREATE POLICY "Enable all for authenticated users" ON protocol_items FOR ALL USING (auth.role() = 'authenticated');
        END IF;
      END
      $$;
    `;

    await client.query(sql);
    console.log('✅ Schema Applied Successfully!');
  } catch (e: any) {
    console.error('❌ Error:', e.message);
  } finally {
    await client.end();
  }
}

apply();
