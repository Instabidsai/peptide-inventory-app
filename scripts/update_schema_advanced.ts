import { Client } from 'pg';

const connectionString = "postgres://postgres.mckkegmkpqdicudnfhor:eApOyEConVNU0nQj@aws-0-us-east-1.pooler.supabase.com:5432/postgres";

const client = new Client({
    connectionString,
});

async function runMigration() {
    try {
        await client.connect();
        console.log('Connected to database...');

        // 1. Add new columns to protocol_items table
        const alterTableQuery = `
      ALTER TABLE protocol_items
      ADD COLUMN IF NOT EXISTS dosage_amount NUMERIC,
      ADD COLUMN IF NOT EXISTS dosage_unit TEXT,
      ADD COLUMN IF NOT EXISTS frequency TEXT,
      ADD COLUMN IF NOT EXISTS duration_days INTEGER,
      ADD COLUMN IF NOT EXISTS cost_multiplier NUMERIC DEFAULT 1.0;
    `;

        console.log('Adding columns to protocol_items...');
        await client.query(alterTableQuery);
        console.log('Columns added successfully.');

    } catch (err) {
        console.error('Migration failed:', err);
    } finally {
        await client.end();
    }
}

runMigration();
