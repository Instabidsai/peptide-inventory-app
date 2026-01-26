
import { Client } from 'pg';

// Direct connection string (non-pooler)
const connectionString = "postgres://postgres:eApOyEConVNU0nQj@db.mckkegmkpqdicudnfhor.supabase.co:5432/postgres";

const client = new Client({
    connectionString,
    ssl: { rejectUnauthorized: false }
});

async function runRLSFix() {
    try {
        await client.connect();
        console.log('Connected to database...');

        const queries = [
            `ALTER TABLE contacts ENABLE ROW LEVEL SECURITY`,
            `ALTER TABLE profiles ENABLE ROW LEVEL SECURITY`,
            `ALTER TABLE peptides ENABLE ROW LEVEL SECURITY`,

            `DROP POLICY IF EXISTS "Authenticated Read Contacts" ON contacts`,
            `DROP POLICY IF EXISTS "Authenticated Read Profiles" ON profiles`,
            `DROP POLICY IF EXISTS "Authenticated Read Peptides" ON peptides`,

            `CREATE POLICY "Authenticated Read Contacts" ON contacts FOR SELECT TO authenticated USING (true)`,
            `CREATE POLICY "Authenticated Read Profiles" ON profiles FOR SELECT TO authenticated USING (true)`,
            `CREATE POLICY "Authenticated Read Peptides" ON peptides FOR SELECT TO authenticated USING (true)`,

            // Also double check movements just to be 100% sure
            `DROP POLICY IF EXISTS "Authenticated Read Movements" ON movements`,
            `CREATE POLICY "Authenticated Read Movements" ON movements FOR SELECT TO authenticated USING (true)`,
            `DROP POLICY IF EXISTS "Authenticated Read Movement Items" ON movement_items`,
            `CREATE POLICY "Authenticated Read Movement Items" ON movement_items FOR SELECT TO authenticated USING (true)`
        ];

        for (const query of queries) {
            try {
                console.log(`Executing: ${query}`);
                await client.query(query);
            } catch (e: any) {
                console.warn(`Warning executing ${query}:`, e.message);
            }
        }

        console.log('Global RLS Read Fix Applied.');

    } catch (err) {
        console.error('Migration failed:', err);
    } finally {
        await client.end();
    }
}

runRLSFix();
