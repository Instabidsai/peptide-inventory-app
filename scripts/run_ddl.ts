
import pg from 'pg';
const { Client } = pg;

// Connection string from previous artifacts/discovery
const connectionString = "postgres://postgres.mckkegmkpqdicudnfhor:eApOyEConVNU0nQj@aws-0-us-east-1.pooler.supabase.com:6543/postgres";

async function runSchemaUpdate() {
    console.log('Connecting to Postgres...');
    const client = new Client({
        connectionString,
        ssl: { rejectUnauthorized: false } // Required for Supabase in some envs
    });

    try {
        await client.connect();
        console.log('Connected.');

        console.log('Running DDL...');

        // 1. sales_orders columns
        await client.query(`
            ALTER TABLE sales_orders 
            ADD COLUMN IF NOT EXISTS commission_amount DECIMAL(10, 2) DEFAULT 0.00;
        `);
        console.log('Added commission_amount.');

        // 2. commission_status
        // Note: Adding check constraint might fail if data exists, but we use safe logic.
        // We'll just add the column first.
        await client.query(`
            ALTER TABLE sales_orders 
            ADD COLUMN IF NOT EXISTS commission_status TEXT DEFAULT 'pending';
        `);
        console.log('Added commission_status.');

        // 3. profiles credit_balance
        await client.query(`
            ALTER TABLE profiles 
            ADD COLUMN IF NOT EXISTS credit_balance DECIMAL(10, 2) DEFAULT 0.00;
        `);
        console.log('Added credit_balance.');

    } catch (err) {
        console.error('DDL Error:', err);
    } finally {
        await client.end();
        console.log('Disconnected.');
    }
}

runSchemaUpdate();
