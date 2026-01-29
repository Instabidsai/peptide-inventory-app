
import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
import path from 'path';

dotenv.config({ path: path.resolve(process.cwd(), '.env') });
const supabaseUrl = process.env.VITE_SUPABASE_URL || process.env.PUBLIC_SUPABASE_URL;
const supabaseKey = process.env.VITE_SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY;
const supabase = createClient(supabaseUrl!, supabaseKey!);

async function run() {
    console.log("Checking `peptides` columns...");
    // Fetch one row to see all keys, or rely on error message hack, or verify table info?
    // Let's just fetch one row and print keys.
    const { data, error } = await supabase
        .from('peptides')
        .select('*')
        .limit(1);

    if (error) {
        console.error("Error:", error);
    } else if (data && data.length > 0) {
        console.log("Columns found:", Object.keys(data[0]));
        console.log("Sample Data:", data[0]);
    } else {
        console.log("No peptides found, cannot inspect columns easily via row.");
    }
}

run();
