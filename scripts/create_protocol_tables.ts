
import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const envPath = path.resolve(__dirname, '../.env');

dotenv.config({ path: envPath });

const supabaseUrl = process.env.VITE_SUPABASE_URL || "https://mckkegmkpqdicudnfhor.supabase.co";
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

const supabase = createClient(supabaseUrl, supabaseKey!);

async function createTables() {
    console.log('Creating Protocol Tables...');

    // 1. Create Protocols Table
    const { error: pError } = await supabase.rpc('exec_sql', {
        sql_query: `
      CREATE TABLE IF NOT EXISTS protocols (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        org_id UUID REFERENCES organizations(id) NOT NULL,
        contact_id UUID REFERENCES contacts(id) ON DELETE CASCADE,
        name TEXT NOT NULL,
        description TEXT,
        created_at TIMESTAMPTZ DEFAULT NOW(),
        updated_at TIMESTAMPTZ DEFAULT NOW()
      );
    `
    });

    if (pError) {
        // If exec_sql RPC doesn't exist (common in some setups), we might need another way.
        // Checking if we can use standard query/rpc or if we need to guide user to SQL Editor.
        console.error('Error creating protocols table (RPC might be missing):', pError);
        // Fallback: Try creating via raw SQL if possible, or just log required SQL for user.
    } else {
        console.log('Protocols table created/verified.');
    }

    // 2. Create Protocol Items Table
    const { error: piError } = await supabase.rpc('exec_sql', {
        sql_query: `
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
    `
    });

    if (piError) console.error('Error creating protocol_items table:', piError);
    else console.log('Protocol Items table created/verified.');

}

// Note: If exec_sql is not available, I will print the SQL for the user's records.
console.log(`
SQL TO RUN IF SCRIPT FAILS:
---------------------------
CREATE TABLE IF NOT EXISTS protocols (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id UUID REFERENCES organizations(id) NOT NULL,
  contact_id UUID REFERENCES contacts(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  description TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS protocol_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  protocol_id UUID REFERENCES protocols(id) ON DELETE CASCADE NOT NULL,
  peptide_id UUID REFERENCES peptides(id) ON DELETE CASCADE NOT NULL,
  dosage_amount NUMERIC NOT NULL,
  dosage_unit TEXT NOT NULL DEFAULT 'mcg',
  frequency TEXT NOT NULL,
  duration_weeks NUMERIC NOT NULL,
  price_tier TEXT NOT NULL DEFAULT 'retail',
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);
---------------------------
`);

createTables();
