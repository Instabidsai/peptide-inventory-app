
import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
import path from 'path';

import { fileURLToPath } from 'url';
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
dotenv.config({ path: path.resolve(__dirname, '../.env') });

const supabaseUrl = process.env.VITE_SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY; // Use Service Role to query system tables

if (!supabaseUrl || !supabaseKey) {
    console.error('Missing Supabase credentials in .env');
    process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseKey);

async function checkPolicies() {
    console.log('Checking RLS Policies for sales_orders and sales_order_items...');

    const { data, error } = await supabase
        .from('pg_policies')
        .select('*')
        .in('tablename', ['sales_orders', 'sales_order_items', 'orders']);

    if (error) {
        console.error('Error fetching policies:', error);
        return;
    }

    if (!data || data.length === 0) {
        console.log('No policies found for these tables.');
    } else {
        console.table(data.map(p => ({
            table: p.tablename,
            policy: p.policyname,
            roles: p.roles,
            cmd: p.cmd,
            qual: p.qual,
            with_check: p.with_check
        })));
    }
}

checkPolicies();
