
import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
dotenv.config();

const supabaseUrl = process.env.VITE_SUPABASE_URL || 'https://mckkegmkpqdicudnfhor.supabase.co';
const supabaseKey = process.env.VITE_SUPABASE_ANON_KEY!; // We can use anon for this if RLS allows, or service role if mostly admin

const supabase = createClient(supabaseUrl, supabaseKey);

async function checkSchema() {
    console.log("Checking if 'claim_token' column exists in 'contacts'...");

    // Attempt to select the specific column
    const { data, error } = await supabase
        .from('contacts')
        .select('claim_token')
        .limit(1);

    if (error) {
        console.error("Error detected:", error.message);
        if (error.message.includes('dtudjrlry')) { // cryptic error usually means col doesn't exist
            console.log("Column likely missing.");
        }
        process.exit(1);
    } else {
        console.log("Success! Column 'claim_token' exists.");
        process.exit(0);
    }
}

checkSchema();
