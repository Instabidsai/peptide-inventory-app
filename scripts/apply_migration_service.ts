import { createClient } from '@supabase/supabase-js';
import * as fs from 'fs';
import * as path from 'path';

// Credentials from create_admin_user.ts
const supabaseUrl = 'https://mckkegmkpqdicudnfhor.supabase.co';
const supabaseServiceKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im1ja2tlZ21rcHFkaWN1ZG5maG9yIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc2ODQ5MjExNywiZXhwIjoyMDg0MDY4MTE3fQ.s8M-RGqK_8tqdFpfUa_ZNckZ7p1EMdvi-1vcXH8oFn4';

const supabase = createClient(supabaseUrl, supabaseServiceKey);

async function runMigration() {
    const migrationPath = path.join(process.cwd(), 'supabase', 'migrations', '20260126164000_create_client_requests.sql');
    const sql = fs.readFileSync(migrationPath, 'utf8');

    console.log('Attempting to run SQL via RPC (exec_sql)...');

    // Attempt 1: exec_sql
    const { error } = await supabase.rpc('exec_sql', { sql_query: sql });

    if (error) {
        console.error('RPC failed:', error);

        // Attempt 2: run_sql (common alternative name)
        console.log('Trying run_sql...');
        const { error: error2 } = await supabase.rpc('run_sql', { sql });

        if (error2) {
            console.error('run_sql failed:', error2);
            // Attempt 3: exec (common alternative name)
            console.log('Trying exec...');
            const { error: error3 } = await supabase.rpc('exec', { query: sql });
            if (error3) {
                console.error('All RPC attempts failed.');
            } else {
                console.log('Success via exec!');
            }
        } else {
            console.log('Success via run_sql!');
        }
    } else {
        console.log('Success via exec_sql!');
    }
}

runMigration();
