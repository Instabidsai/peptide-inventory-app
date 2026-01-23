
import { createClient } from '@supabase/supabase-js';
import { config } from 'dotenv';
config();

const supabaseUrl = process.env.VITE_SUPABASE_URL || process.env.PUBLIC_SUPABASE_URL!;
const supabaseServiceKey = process.env.VITE_SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY!;

const supabase = createClient(supabaseUrl, supabaseServiceKey);

async function updateSchema() {
    console.log('Updating schema for Commission System...');

    // 1. Add columns to sales_orders
    console.log('Adding commission columns to sales_orders...');
    const { error: error1 } = await supabase.rpc('exec_sql', {
        sql: `
            ALTER TABLE sales_orders 
            ADD COLUMN IF NOT EXISTS commission_amount DECIMAL(10, 2) DEFAULT 0.00,
            ADD COLUMN IF NOT EXISTS commission_status TEXT DEFAULT 'pending' CHECK (commission_status IN ('pending', 'available', 'paid', 'credited'));
        `
    });

    if (error1) {
        console.error('RPC Error (sales_orders):', error1.message);
        console.log('Trying manual check/update...');
        // Fallback or manual instruction if RPC fails
    }

    // 2. Add column to profiles
    console.log('Adding credit_balance to profiles...');
    const { error: error2 } = await supabase.rpc('exec_sql', {
        sql: `
            ALTER TABLE profiles 
            ADD COLUMN IF NOT EXISTS credit_balance DECIMAL(10, 2) DEFAULT 0.00;
        `
    });

    if (error2) {
        console.error('RPC Error (profiles):', error2.message);
    }

    console.log('Schema update finished (check errors above).');
}

updateSchema();
