
import { createClient } from '@supabase/supabase-js';

const supabaseUrl = 'https://mckkegmkpqdicudnfhor.supabase.co';
const supabaseServiceKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im1ja2tlZ21rcHFkaWN1ZG5maG9yIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc2ODQ5MjExNywiZXhwIjoyMDg0MDY4MTE3fQ.s8M-RGqK_8tqdFpfUa_ZNckZ7p1EMdvi-1vcXH8oFn4';

const supabase = createClient(supabaseUrl, supabaseServiceKey, {
    auth: {
        autoRefreshToken: false,
        persistSession: false
    }
});

const sql = `
-- Fix RLS for movements table
ALTER TABLE movements ENABLE ROW LEVEL SECURITY;

-- Drop existing restrictive policies
DROP POLICY IF EXISTS "Authenticated Read Movements" ON movements;
DROP POLICY IF EXISTS "Authenticated All Movements" ON movements;
DROP POLICY IF EXISTS "Public Read Movements" ON movements;

-- Create permissive policy for authenticated users (Staff)
-- This allows SELECT, INSERT, UPDATE, DELETE
CREATE POLICY "Authenticated All Movements" 
ON movements 
FOR ALL 
TO authenticated 
USING (true) 
WITH CHECK (true);

-- Ensure movement_items are also accessible
ALTER TABLE movement_items ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Authenticated Read Movement Items" ON movement_items;
DROP POLICY IF EXISTS "Authenticated All Movement Items" ON movement_items;

CREATE POLICY "Authenticated All Movement Items" 
ON movement_items 
FOR ALL 
TO authenticated 
USING (true) 
WITH CHECK (true);
`;

async function applyFix() {
    console.log("Applying RLS fix via RPC 'exec_sql'...");

    // Attempt 1: exec_sql (standard helper often added)
    const { error } = await supabase.rpc('exec_sql', { sql_query: sql });

    if (error) {
        console.error("Attempt 1 (exec_sql) failed:", error.message);

        // Attempt 2: run_sql (another common name)
        console.log("Retrying with 'run_sql'...");
        const { error: error2 } = await supabase.rpc('run_sql', { sql: sql });

        if (error2) {
            console.error("Attempt 2 (run_sql) failed:", error2.message);
            console.log("\n❌ Could not apply RLS fix via RPC. Database connection required.");
            process.exit(1);
        } else {
            console.log("✅ Success via 'run_sql'!");
        }
    } else {
        console.log("✅ Success via 'exec_sql'!");
    }
}

applyFix();
