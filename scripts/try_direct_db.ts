
import { Client } from 'pg';

const projectRef = "mckkegmkpqdicudnfhor";
const password = "eApOyEConVNU0nQj";

const variants = [
    { name: "Pooler 5432 (Original)", constr: `postgres://postgres.${projectRef}:${password}@aws-0-us-east-1.pooler.supabase.com:5432/postgres` },
    { name: "Pooler 6543", constr: `postgres://postgres.${projectRef}:${password}@aws-0-us-east-1.pooler.supabase.com:6543/postgres` },
    { name: "Direct 5432", constr: `postgres://postgres:${password}@db.${projectRef}.supabase.co:5432/postgres` },
    { name: "Direct 6543", constr: `postgres://postgres:${password}@db.${projectRef}.supabase.co:6543/postgres` },
];

async function testVariant(variant: any) {
    console.log(`\nTesting: ${variant.name}`);
    const client = new Client({
        connectionString: variant.constr,
        ssl: { rejectUnauthorized: false },
        connectionTimeoutMillis: 5000,
    });

    try {
        await client.connect();
        const res = await client.query('SELECT version()');
        console.log(`SUCCESS: ${variant.name}`);
        console.log(res.rows[0]);
        await client.end();
        return variant.constr;
    } catch (err: any) {
        console.log(`FAILED: ${variant.name} - ${err.message}`);
        try { await client.end(); } catch { /* ignore */ }
        return null;
    }
}

async function run() {
    for (const v of variants) {
        const success = await testVariant(v);
        if (success) {
            console.log("\nFound working connection!");
            console.log(success);
            process.exit(0);
        }
    }
    console.error("\nAll variants failed.");
    process.exit(1);
}

run();
