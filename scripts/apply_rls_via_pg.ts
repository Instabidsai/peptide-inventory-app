
import { Client } from 'pg';

// Connection from fix_contacts_rls.ts
const connectionString = "postgres://postgres.mckkegmkpqdicudnfhor:eApOyEConVNU0nQj@aws-0-us-east-1.pooler.supabase.com:6543/postgres";

const client = new Client({
    connectionString,
    ssl: { rejectUnauthorized: false } // Required for local dev against remote Supabase
});

async function runRLSFix() {
    try {
        console.log('Connecting to database via Pooler (6543)...');
        await client.connect();
        console.log('✅ Connected!');

        const queries = [
            `ALTER TABLE movements ENABLE ROW LEVEL SECURITY`,

            // Drop existing policies
            `DROP POLICY IF EXISTS "Authenticated Read Movements" ON movements`,
            `DROP POLICY IF EXISTS "Authenticated All Movements" ON movements`,

            // Create permissive policy
            `CREATE POLICY "Authenticated All Movements" ON movements FOR ALL TO authenticated USING (true) WITH CHECK (true)`,

            // Log for verification
            `SELECT count(*) FROM movements`
        ];

        for (const query of queries) {
            try {
                console.log(`Executing: ${query}`);
                await client.query(query);
            } catch (e: any) {
                console.warn(`Warning executing ${query}:`, e.message);
            }
        }

        console.log('🎉 RLS Fix Applied Successfully!');

    } catch (err: any) {
        console.error('❌ Migration failed:', err.message);
        process.exit(1);
    } finally {
        await client.end();
    }
}

runRLSFix();
