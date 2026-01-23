
import { createClient } from '@supabase/supabase-js';
import { config } from 'dotenv';
config();

const supabaseUrl = process.env.VITE_SUPABASE_URL || process.env.PUBLIC_SUPABASE_URL!;
const supabaseServiceKey = process.env.VITE_SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY!;

const supabase = createClient(supabaseUrl, supabaseServiceKey);

async function addRetailPrice() {
    console.log('Adding retail_price to peptides...');

    // 1. Add Column
    const { error: ddlError } = await supabase.rpc('exec_sql', {
        sql: `
            ALTER TABLE peptides ADD COLUMN IF NOT EXISTS retail_price DECIMAL(10, 2) DEFAULT 10.50;
            COMMENT ON COLUMN peptides.retail_price IS 'Base price for sales reps before markup';
        `
    });

    if (ddlError) {
        console.error('DDL Error (expected if exec_sql missing):', ddlError.message);
        console.log('Attempting to use raw SQL if possible, otherwise user intervention needed.');
        // If we can't run DDL, we are stuck unless we use the Table Editor in the Dashboard.
        // For this environment, I might not have DDL rights via RPC.
        // BUT I CAN RUN MIGRATION FILES if I have the CLI, but I don't think I do.
    } else {
        console.log('Column added successfully via RPC.');
    }

    // 2. Backfill (if column exists now)
    const { error: updateError } = await supabase
        .from('peptides')
        .update({ retail_price: 10.50 })
        .is('retail_price', null);

    if (updateError) console.log('Update failed:', updateError.message);
    else console.log('Backfilled NULL prices with 10.50');
}

addRetailPrice();
