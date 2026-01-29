
import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
import path from 'path';

dotenv.config({ path: path.resolve(process.cwd(), '.env') });
const supabaseUrl = process.env.VITE_SUPABASE_URL || process.env.PUBLIC_SUPABASE_URL;
const supabaseKey = process.env.VITE_SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY;
const supabase = createClient(supabaseUrl!, supabaseKey!);

async function run() {
    console.log("Checking `lots` columns and data...");

    // Check Columns via select
    const { data, error } = await supabase
        .from('lots')
        .select('*')
        .limit(5);

    if (error) {
        console.error("Error:", error);
    } else {
        console.log("Found lots:", data.length);
        if (data.length > 0) {
            console.log("Sample Data:", data[0]);
            console.log("Costs found:", data.map(l => ({ id: l.id, cost: l.cost_per_unit })));
        } else {
            console.log("No lots found.");
        }
    }
}

run();
