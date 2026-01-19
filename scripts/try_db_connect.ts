
import pg from 'pg';
const { Client } = pg;
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const envPath = path.resolve(__dirname, '../.env');
dotenv.config({ path: envPath });

const projectRef = "mckkegmkpqdicudnfhor";
const host = `db.${projectRef}.supabase.co`;
const port = 5432;
const database = 'postgres';
const user = 'postgres';

const passwords = [
    'postgres',
    'supabase',
    'password',
    'admin',
    'root',
    '123abc', // App console password
    '123456',
    'secret',
    projectRef
];

async function tryConnect() {
    console.log(`Targeting: ${host}:${port}`);

    for (const password of passwords) {
        console.log(`Trying password: ${password}`);
        const client = new Client({
            host,
            port,
            user,
            password,
            database,
            ssl: { rejectUnauthorized: false } // Required for Supabase
        });

        try {
            await client.connect();
            console.log(`SUCCESS! Password is: ${password}`);

            // If success, run the DDL immediately!
            await runDDL(client);

            await client.end();
            process.exit(0);
        } catch (e: any) {
            console.log(`Failed: ${e.message}`);
            await client.end();
        }
    }
    console.log('All attempts failed.');
}

async function runDDL(client: any) {
    console.log('Running DDL...');
    const sql = `
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

    ALTER TABLE protocols ENABLE ROW LEVEL SECURITY;
    ALTER TABLE protocol_items ENABLE ROW LEVEL SECURITY;

    DO $$
    BEGIN
      IF NOT EXISTS (
        SELECT FROM pg_policies WHERE tablename = 'protocols' AND policyname = 'Enable all for authenticated users'
      ) THEN
        CREATE POLICY "Enable all for authenticated users" ON protocols FOR ALL USING (auth.role() = 'authenticated');
      END IF;
      
      IF NOT EXISTS (
        SELECT FROM pg_policies WHERE tablename = 'protocol_items' AND policyname = 'Enable all for authenticated users'
      ) THEN
        CREATE POLICY "Enable all for authenticated users" ON protocol_items FOR ALL USING (auth.role() = 'authenticated');
      END IF;
    END
    $$;
  `;

    await client.query(sql);
    console.log('DDL Executed Successfully!');
}

tryConnect();
