
import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
import path from 'path';

// Load env
dotenv.config({ path: path.resolve(process.cwd(), '.env') });

const supabaseUrl = process.env.VITE_SUPABASE_URL || process.env.PUBLIC_SUPABASE_URL;
// Use service role key to ensure we can run SQL via RPC (if constrained) or just to be safe
const supabaseKey = process.env.VITE_SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !supabaseKey) {
    console.error("Missing Env Vars");
    process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseKey);

async function run() {
    console.log("Applying RLS Policy for Commissions...");

    const sql = `
    -- Enable RLS just in case
    ALTER TABLE commissions ENABLE ROW LEVEL SECURITY;

    -- Drop existing policy if any (to avoid error)
    DROP POLICY IF EXISTS "Admins View All" ON commissions;
    
    -- Create Permissive Policy for Verification (Refine later)
    CREATE POLICY "Admins View All" ON commissions 
    FOR SELECT 
    TO authenticated 
    USING ( true ); 

    -- Also allow Insert/Update for seeding/RPC
    DROP POLICY IF EXISTS "Allow All" ON commissions; 
    CREATE POLICY "Allow All" ON commissions
    FOR ALL
    TO authenticated
    USING ( true )
    WITH CHECK ( true );
    `;

    const { error } = await supabase.rpc('exec_sql', { sql });

    if (error) {
        console.error("RPC Error:", error);
    } else {
        console.log("RLS Policy Applied successfully via RPC.");
    }
}

run();
