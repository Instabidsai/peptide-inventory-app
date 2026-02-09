
import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

dotenv.config({ path: path.resolve(__dirname, '../.env') });

async function runMigration() {
    const migrationPath = path.resolve(__dirname, '../supabase/migrations/20260128_fix_inventory_rls.sql');
    const sql = fs.readFileSync(migrationPath, 'utf-8');

    console.log("----------------------------------------------------------------");
    console.log("PLEASE RUN THE FOLLOWING SQL IN YOUR SUPABASE DASHBOARD SQL EDITOR:");
    console.log("----------------------------------------------------------------");
    console.log(sql);
    console.log("----------------------------------------------------------------");
}

runMigration();
