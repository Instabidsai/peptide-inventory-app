
import { Client } from 'pg';
import fs from 'fs';
import path from 'path';

// Connection string for local Supabase DB
const connectionString = "postgresql://postgres:postgres@127.0.0.1:54322/postgres";

async function run() {
    const client = new Client({ connectionString });
    try {
        await client.connect();

        const sqlPath = path.join(process.cwd(), 'scripts', '20260128_store_credit_rpc.sql');
        const sql = fs.readFileSync(sqlPath, 'utf8');

        console.log('Applying SQL...');
        await client.query(sql);
        console.log('✅ SQL Applied Successfully.');
    } catch (err) {
        console.error('❌ Error applying SQL:', err);
        process.exit(1);
    } finally {
        await client.end();
    }
}

run();
