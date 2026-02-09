
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

async function runMigration() {
    const migrationPath = path.resolve(__dirname, '../supabase/migrations/20260128_get_stock_counts.sql');
    const sql = fs.readFileSync(migrationPath, 'utf-8');

    console.log("----------------------------------------------------------------");
    console.log("PLEASE RUN THIS SQL TO ENABLE FAST COUNTING:");
    console.log("----------------------------------------------------------------");
    console.log(sql);
    console.log("----------------------------------------------------------------");
}

runMigration();
