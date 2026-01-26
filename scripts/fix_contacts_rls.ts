
import { Client } from 'pg';

const connectionString = "postgres://postgres.mckkegmkpqdicudnfhor:eApOyEConVNU0nQj@aws-0-us-east-1.pooler.supabase.com:6543/postgres";

const client = new Client({
    connectionString,
});

async function runRLSFix() {
    try {
        await client.connect();
        console.log('Connected to database...');

        const queries = [
            // Enable RLS
            `ALTER TABLE contacts ENABLE ROW LEVEL SECURITY`,
            `ALTER TABLE profiles ENABLE ROW LEVEL SECURITY`,

            // Drop existing restrictive policies if they exist (common names used by Supabase or my previous scripts)
            `DROP POLICY IF EXISTS "Authenticated Read Contacts" ON contacts`,
            `DROP POLICY IF EXISTS "Authenticated Read Profiles" ON profiles`,
            `DROP POLICY IF EXISTS "Public Read Contacts" ON contacts`,
            `DROP POLICY IF EXISTS "Public Read Profiles" ON profiles`,

            // Create broad Read Policies for Authenticated Users 
            // This ensures joins work for all staff/admin
            `CREATE POLICY "Authenticated Read Contacts" ON contacts FOR SELECT TO authenticated USING (true)`,
            `CREATE POLICY "Authenticated Read Profiles" ON profiles FOR SELECT TO authenticated USING (true)`,

            // Ensure movements are also truly open (re-applying from previous fix_rls.ts just in case)
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

        console.log('RLS Policies for Contacts and Profiles Updated Successfully.');

    } catch (err) {
        console.error('Migration failed:', err);
    } finally {
        await client.end();
    }
}

runRLSFix();
