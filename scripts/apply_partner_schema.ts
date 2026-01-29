
import { createClient } from '@supabase/supabase-js';
import fs from 'fs';
import path from 'path';
import dotenv from 'dotenv';
import { fileURLToPath } from 'url';

dotenv.config();

// Fix for __dirname in ESM
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const supabaseUrl = process.env.VITE_SUPABASE_URL || process.env.PUBLIC_SUPABASE_URL!;
const supabaseKey = process.env.VITE_SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY!;

const supabase = createClient(supabaseUrl, supabaseKey);

async function applyPartnerSchema() {
    console.log('Applying Partner & Commission Schema...');

    try {
        const sqlPath = path.resolve(__dirname, 'partner_schema.sql');
        const sql = fs.readFileSync(sqlPath, 'utf8');

        // Split by statement if needed, or run as one block if supported by `exec_sql` RPC which we often use.
        // Assuming `exec_sql` exists from previous context, otherwise we need to use a direct pg connection or multiple rpc calls.
        // Based on previous files (add_commission_schema.ts), `exec_sql` RPC is available.

        console.log('Executing SQL...');
        const { error } = await supabase.rpc('exec_sql', { sql });

        if (error) {
            console.error('❌ SQL Execution Error:', error.message);
            // Fallback: If exec_sql is restricted or split-sensitive, maybe we need to be more careful.
            // But let's try the simple path first.
        } else {
            console.log('✅ Schema applied successfully.');
        }

    } catch (err) {
        console.error('❌ Script Error:', err);
    }
}

applyPartnerSchema();
