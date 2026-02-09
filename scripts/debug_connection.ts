
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

async function testConnection() {
    console.log("Testing DB Connection...");
    try {
        const { data, error } = await supabase.from('lots').select('id').limit(1);
        if (error) console.error("Error:", error);
        else console.log("Success! Data:", data);
    } catch (e) {
        console.error("Crash:", e);
    }
}

testConnection();
