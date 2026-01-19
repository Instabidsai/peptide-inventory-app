
import pg from 'pg';
const { Client } = pg;

const config = {
    host: 'db.mckkegmkpqdicudnfhor.supabase.co',
    port: 5432,
    database: 'postgres',
    user: 'postgres',
    password: 'eApOyEConVNU0nQj',
    ssl: { rejectUnauthorized: false },
    connectionTimeoutMillis: 5000
};

async function run() {
    console.log('Connecting to Standard DB Host (5432)...');
    const client = new Client(config);

    try {
        await client.connect();
        console.log('Connected!');

        await client.query(`
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
    `);
        console.log('Tables created.');
        await client.end();
    } catch (e: any) {
        console.error('Connection Failed:', e.message);
        process.exit(1);
    }
}

run();
