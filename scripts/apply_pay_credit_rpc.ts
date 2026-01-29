
import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
import path from 'path';
import fs from 'fs';

dotenv.config({ path: path.resolve(process.cwd(), '.env') });
const supabaseUrl = process.env.VITE_SUPABASE_URL || process.env.PUBLIC_SUPABASE_URL;
const supabaseKey = process.env.VITE_SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY;
const supabase = createClient(supabaseUrl!, supabaseKey!);

async function run() {
    const sqlPath = path.join(process.cwd(), 'scripts', '20260129_pay_with_credit.sql');
    const sql = fs.readFileSync(sqlPath, 'utf8');

    console.log("Applying `pay_order_with_credit` RPC...");
    const { error } = await supabase.rpc('exec_sql', { sql });

    if (error) {
        console.error("RPC Error:", error);
    } else {
        console.log("Success.");
    }
}

run();
