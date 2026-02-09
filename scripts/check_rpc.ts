
import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

dotenv.config({ path: path.resolve(__dirname, '../.env') });

const supabase = createClient(
    process.env.VITE_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
);

async function checkRPCExists() {
    console.log("Checking if RPC function exists...");

    // We can't query information_schema easily via JS client without raw SQL.
    // Instead, we can try to call it.
    // We already called it and got [] (empty array), NOT error.
    // If it didn't exist, we would get an error: "function not found".

    const { data, error } = await supabase.rpc('get_peptide_stock_counts');

    if (error && error.message.includes('function') && error.message.includes('not found')) {
        console.error("❌ RPC Function NOT FOUND. The SQL was likely not run.");
    } else if (error) {
        console.error("RPC Error (but function might exist):", error.message);
    } else {
        console.log("✅ RPC Function EXISTS (returned data, even if empty).");
        console.log("The empty data is expected because we are running as Service Role without a User Context.");
    }
}

checkRPCExists();
