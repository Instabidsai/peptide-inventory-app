
import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
import path from 'path';

dotenv.config({ path: path.resolve(process.cwd(), '.env') });
const supabaseUrl = process.env.VITE_SUPABASE_URL || process.env.PUBLIC_SUPABASE_URL;
const supabaseKey = process.env.VITE_SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY;
const supabase = createClient(supabaseUrl!, supabaseKey!);

async function run() {
    console.log("Checking RPC existence...");
    // Call with invalid ID to check existence vs parameter error
    const { error } = await supabase.rpc('convert_commission_to_credit', { commission_id: '00000000-0000-0000-0000-000000000000' });

    if (error) {
        if (error.code === 'PGRST202') {
            console.log("❌ RPC `convert_commission_to_credit` NOT FOUND.");
        } else {
            // Other error means function exists but ID failed (which is expected)
            console.log(`✅ RPC exists (Error: ${error.message}).`);
        }
    } else {
        console.log("✅ RPC exists (Success).");
    }

    const { error: err2 } = await supabase.rpc('exec_sql', { sql: 'select 1' });
    if (err2 && err2.code === 'PGRST202') {
        console.log("❌ RPC `exec_sql` NOT FOUND.");
    } else {
        console.log("✅ RPC `exec_sql` exists.");
    }
}

run();
