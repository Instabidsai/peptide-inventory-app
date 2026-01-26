import pg from 'pg';
const { Client } = pg;

const connectionString = "postgres://postgres.mckkegmkpqdicudnfhor:eApOyEConVNU0nQj@aws-0-us-east-1.pooler.supabase.com:5432/postgres";

async function checkColumns() {
    const client = new Client({ connectionString, ssl: { rejectUnauthorized: false } });
    await client.connect();
    const res = await client.query("SELECT column_name, data_type FROM information_schema.columns WHERE table_name = 'client_inventory'");
    console.log(res.rows);
    await client.end();
}

checkColumns();
