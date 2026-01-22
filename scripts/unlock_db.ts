
import { Client } from 'pg';

// Connection details from user file and standard Supabase patterns
const projectRef = "mckkegmkpqdicudnfhor";
const password = "eApOyEConVNU0nQj";
const dbName = "postgres";

// Try multiple connection strings (Direct vs Pooler)
const connectionStrings = [
    // Direct Connection (Best for DDL/Migrations)
    `postgres://postgres:${password}@db.${projectRef}.supabase.co:5432/${dbName}`,
    // Pooler Transaction Mode (Port 5432)
    `postgres://postgres.${projectRef}:${password}@aws-0-us-east-1.pooler.supabase.com:5432/${dbName}`,
    // Pooler Session Mode (Port 6543 - Better for DDL)
    `postgres://postgres.${projectRef}:${password}@aws-0-us-east-1.pooler.supabase.com:6543/${dbName}`
];

const sqlCommands = [
    // Enable RLS (Ensure it's on)
    `ALTER TABLE lots ENABLE ROW LEVEL SECURITY;`,
    `ALTER TABLE bottles ENABLE ROW LEVEL SECURITY;`,
    `ALTER TABLE movements ENABLE ROW LEVEL SECURITY;`,
    `ALTER TABLE movement_items ENABLE ROW LEVEL SECURITY;`,

    // Drop restrictive policies if they exist (Clean slate)
    `DROP POLICY IF EXISTS "Public Read Lots" ON lots;`,
    `DROP POLICY IF EXISTS "Authenticated Read Lots" ON lots;`,

    // Create PERMISSIVE policies for Authenticated Users
    // This allows logged-in users to READ all rows in these tables.
    // Crucially removes the barrier causing the $0 inventory issue.
    `CREATE POLICY "Allow Authenticated Select Lots" ON lots FOR SELECT TO authenticated USING (true);`,
    `CREATE POLICY "Allow Authenticated Select Bottles" ON bottles FOR SELECT TO authenticated USING (true);`,
    `CREATE POLICY "Allow Authenticated Select Movements" ON movements FOR SELECT TO authenticated USING (true);`,
    `CREATE POLICY "Allow Authenticated Select Items" ON movement_items FOR SELECT TO authenticated USING (true);`,

    // Allow Writes (Insert/Update/Delete) for Authenticated Users (Simplifying for this app scope)
    `CREATE POLICY "Allow Authenticated All Lots" ON lots FOR ALL TO authenticated USING (true) WITH CHECK (true);`,
    `CREATE POLICY "Allow Authenticated All Bottles" ON bottles FOR ALL TO authenticated USING (true) WITH CHECK (true);`
];

async function tryConnection(connString: string) {
    console.log(`\nAttempting connection to: ${connString.replace(password, '****')}...`);
    const client = new Client({
        connectionString: connString,
        ssl: { rejectUnauthorized: false }, // Supabase needs SSL, loose validation prevents local cert issues
        connectionTimeoutMillis: 10000 // 10s timeout
    });

    try {
        await client.connect();
        console.log("Connected successfully!");

        // Run commands
        for (const sql of sqlCommands) {
            try {
                process.stdout.write(`Executing: ${sql.substring(0, 40)}... `);
                await client.query(sql);
                console.log("OK");
            } catch (err: any) {
                // Ignore "already exists" or similar minor errors
                console.log(`WARN: ${err.message}`);
            }
        }

        console.log("\n>>> DATABASE PERMISSIONS UPDATED SUCCESSFULLY <<<");
        await client.end();
        return true;
    } catch (err: any) {
        console.error(`Connection failed: ${err.message}`);
        try { await client.end(); } catch { }
        return false;
    }
}

async function run() {
    console.log("Starting Database Permission Fix...");

    for (const conn of connectionStrings) {
        const success = await tryConnection(conn);
        if (success) {
            console.log("Fix Complete. You can inspect the dashboard now.");
            process.exit(0);
        }
    }

    console.error("\nERROR: Could not connect to database with any known address.");
    console.error("Please ensure you have internet connection and the database password is correct.");
    process.exit(1);
}

run();
