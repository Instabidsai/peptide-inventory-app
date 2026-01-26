import { Client } from 'pg';
import * as fs from 'fs';
import * as path from 'path';

// Using connection string from existing script
const connectionString = "postgres://postgres.mckkegmkpqdicudnfhor:eApOyEConVNU0nQj@aws-0-us-east-1.pooler.supabase.com:5432/postgres";

const client = new Client({
    connectionString,
});

async function runMigration() {
    try {
        await client.connect();
        console.log('Connected to database...');

        // Read the SQL file
        const migrationPath = path.join(process.cwd(), 'supabase', 'migrations', '20260126164000_create_client_requests.sql');
        const sql = fs.readFileSync(migrationPath, 'utf8');

        console.log('Applying migration...');
        await client.query(sql);
        console.log('Migration applied successfully.');

    } catch (err) {
        console.error('Migration failed:', err);
    } finally {
        await client.end();
    }
}

runMigration();
