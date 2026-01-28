import { Client } from 'pg';
import fs from 'fs';
import path from 'path';

// Hardcoded fallback (Might be outdated)
const connectionString = process.env.DATABASE_URL || "postgres://postgres.mckkegmkpqdicudnfhor:eApOyEConVNU0nQj@aws-0-us-east-1.pooler.supabase.com:5432/postgres";

const sqlFile = process.argv[2];

if (!sqlFile) {
    console.error("Usage: npx tsx scripts/run_sql.ts <path_to_sql_file>");
    process.exit(1);
}

async function main() {
    const filePath = path.resolve(process.cwd(), sqlFile);
    if (!fs.existsSync(filePath)) {
        console.error("File not found:", filePath);
        process.exit(1);
    }

    const sql = fs.readFileSync(filePath, 'utf8');

    // Use PG Client
    const client = new Client({ connectionString });

    try {
        await client.connect();
        console.log("Connected ot DB. Executing SQL...");
        await client.query(sql);
        console.log("SQL executed successfully!");
    } catch (err) {
        console.error("Migration failed:", err);
    } finally {
        await client.end();
    }
}

main();
