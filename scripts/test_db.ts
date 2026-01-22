
import { Client } from 'pg';

const connectionString = "postgres://postgres.mckkegmkpqdicudnfhor:eApOyEConVNU0nQj@aws-0-us-east-1.pooler.supabase.com:5432/postgres";

const client = new Client({
    connectionString,
    ssl: { rejectUnauthorized: false } // Try adding SSL options
});

async function testConnection() {
    try {
        console.log("Connecting...");
        await client.connect();
        console.log('Connected.');

        const res = await client.query('SELECT NOW()');
        console.log('Query success:', res.rows[0]);

        // If success, try ONE policy change
        console.log("Attempting to enable RLS on bottles...");
        await client.query(`ALTER TABLE bottles ENABLE ROW LEVEL SECURITY`);
        console.log("Success.");

        // Try creating policy
        console.log("Creating policy...");
        await client.query(`DROP POLICY IF EXISTS "Authenticated All Bottles" ON bottles`);
        await client.query(`CREATE POLICY "Authenticated All Bottles" ON bottles FOR ALL TO authenticated USING (true)`);
        console.log("Policy created.");

    } catch (err) {
        console.error('Connection/Query failed:', err);
    } finally {
        await client.end();
    }
}

testConnection();
