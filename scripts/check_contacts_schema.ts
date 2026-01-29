
import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
dotenv.config();

const supabaseUrl = process.env.VITE_SUPABASE_URL || process.env.PUBLIC_SUPABASE_URL!;
const supabaseKey = process.env.VITE_SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY!;

const supabase = createClient(supabaseUrl, supabaseKey);

async function checkContactsSchema() {
    console.log("Checking 'contacts' table structure...");

    // We can't directly query information_schema easily via JS client without strict permissions or RPC.
    // Instead, we'll try to select specific columns that might exist and see if it errors.

    // Potential columns for partner linkage
    const columnsToCheck = ['assigned_rep_id', 'rep_id', 'partner_id', 'parent_id', 'referred_by'];

    for (const col of columnsToCheck) {
        process.stdout.write(`Checking for column '${col}'... `);
        const { error } = await supabase.from('contacts').select(col).limit(1);

        if (!error) {
            console.log("✅ EXISTS");
        } else {
            if (error.code === '42703') { // Undefined column
                console.log("❌ MISSING");
            } else {
                console.log(`⚠️ ERROR: ${error.message}`);
            }
        }
    }

    console.log("\nChecking 'profiles' table for hierarchy columns...");
    const profileCols = ['parent_partner_id', 'upline_id', 'sponsor_id'];
    for (const col of profileCols) {
        process.stdout.write(`Checking for column '${col}'... `);
        const { error } = await supabase.from('profiles').select(col).limit(1);

        if (!error) {
            console.log("✅ EXISTS");
        } else {
            if (error.code === '42703') { // Undefined column
                console.log("❌ MISSING");
            } else {
                console.log(`⚠️ ERROR: ${error.message}`);
            }
        }
    }
}

checkContactsSchema();
