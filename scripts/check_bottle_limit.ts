
import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

dotenv.config({ path: path.resolve(__dirname, '../.env') });

const supabaseUrl = process.env.VITE_SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

const supabase = createClient(supabaseUrl!, supabaseKey!);

async function countBottles() {
    console.log("Checking Total Bottle Count...");

    const { count, error } = await supabase
        .from('bottles')
        .select('*', { count: 'exact', head: true })
        .eq('status', 'in_stock');

    if (error) {
        console.error("Error:", error.message);
    } else {
        console.log(`TOTAL IN-STOCK BOTTLES IN DB: ${count}`);
        if (count && count > 1000) {
            console.log("⚠️  WARNING: Count exceeds Supabase default limit of 1000!");
        }
    }
}

countBottles();
