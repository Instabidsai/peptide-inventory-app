
import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
import path from 'path';

// Load env from project root
dotenv.config({ path: path.resolve(process.cwd(), '.env') });

const supabaseUrl = process.env.VITE_SUPABASE_URL;
const supabaseServiceKey = process.env.VITE_SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !supabaseServiceKey) {
    console.error('Missing Supabase credentials in .env');
    process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseServiceKey);

async function verifyBatchTotal() {
    console.log('Fetching orders for "Batch 001"...');

    const { data: orders, error } = await supabase
        .from('orders')
        .select('*')
        .eq('order_group_id', 'Batch 001');

    if (error) {
        console.error('Error fetching orders:', error);
        return;
    }

    if (!orders || orders.length === 0) {
        console.log('No orders found for Batch 001');
        return;
    }

    console.log(`Found ${orders.length} orders in Batch 001.`);

    let totalCost = 0;
    let totalPaid = 0;

    orders.forEach(order => {
        const cost = (order.quantity_ordered * (order.estimated_cost_per_unit || 0));
        const paid = order.amount_paid || 0;

        totalCost += cost;
        totalPaid += paid;
    });

    console.log('--- BATCH 001 AUDIT ---');
    console.log(`Total Value: $${totalCost.toFixed(2)}`);
    console.log(`Total Paid:  $${totalPaid.toFixed(2)}`);
    console.log(`Balance Due: $${(totalCost - totalPaid).toFixed(2)}`);
    console.log('-----------------------');
}

verifyBatchTotal();
