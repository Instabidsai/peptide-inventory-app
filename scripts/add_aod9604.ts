
import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
import path from 'path';

dotenv.config({ path: path.resolve(process.cwd(), '.env') });
const supabaseUrl = process.env.VITE_SUPABASE_URL || process.env.PUBLIC_SUPABASE_URL;
const supabaseKey = process.env.VITE_SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !supabaseKey) {
    console.error("Missing Supabase credentials");
    process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseKey);

async function run() {
    console.log("Adding AOD-9604 10mg...");

    // 1. Get Organization ID
    const { data: org, error: orgError } = await supabase
        .from('organizations')
        .select('id')
        .limit(1)
        .single();

    if (orgError || !org) {
        console.error("Error fetching organization:", orgError);
        return;
    }

    const orgId = org.id;
    console.log(`Using Org ID: ${orgId}`);

    // 2. Insert Peptide
    const { data, error } = await supabase
        .from('peptides')
        .insert({
            org_id: orgId,
            name: 'AOD-9604 10mg',
            retail_price: 0, // Default to 0, user can update later
            active: true
        })
        .select()
        .single();

    if (error) {
        console.error("Error inserting peptide:", error);
    } else {
        console.log("✅ Successfully added peptide:", data);
    }
}

run();
