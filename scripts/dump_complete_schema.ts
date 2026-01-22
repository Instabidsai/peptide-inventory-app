import { Client } from 'pg';
import fs from 'fs';
import path from 'path';

// Use the connection string from existing scripts
const connectionString = "postgres://postgres.mckkegmkpqdicudnfhor:eApOyEConVNU0nQj@aws-0-us-east-1.pooler.supabase.com:6543/postgres";

const client = new Client({
    connectionString,
    ssl: { rejectUnauthorized: false }
});

async function dumpSchema() {
    try {
        await client.connect();
        console.log('Connected to database...');

        // Query all tables in public schema
        const tablesQuery = `
            SELECT table_name 
            FROM information_schema.tables 
            WHERE table_schema = 'public' 
            AND table_type = 'BASE TABLE'
            ORDER BY table_name;
        `;
        const tablesResult = await client.query(tablesQuery);
        const tables = tablesResult.rows.map(r => r.table_name);

        let output = "# Database Schema Reference\n\n";
        output += `Generated on: ${new Date().toISOString()}\n\n`;

        for (const table of tables) {
            console.log(`Processing table: ${table}`);
            output += `## Table: \`${table}\`\n\n`;

            const columnsQuery = `
                SELECT column_name, data_type, is_nullable, column_default
                FROM information_schema.columns
                WHERE table_schema = 'public' AND table_name = $1
                ORDER BY ordinal_position;
            `;
            const columnsResult = await client.query(columnsQuery, [table]);

            output += "| Column | Type | Nullable | Default |\n";
            output += "|---|---|---|---|\n";

            for (const col of columnsResult.rows) {
                // Escape pipes in default values just in case
                const def = col.column_default ? col.column_default.toString().replace(/\|/g, '\\|') : '';
                output += `| ${col.column_name} | ${col.data_type} | ${col.is_nullable} | ${def} |\n`;
            }
            output += "\n";
        }

        const outputPath = path.join(process.cwd(), 'schema_reference.md');
        fs.writeFileSync(outputPath, output);
        console.log(`Schema dumped to ${outputPath}`);

    } catch (err) {
        console.error('Schema dump failed:', err);
    } finally {
        await client.end();
    }
}

dumpSchema();
