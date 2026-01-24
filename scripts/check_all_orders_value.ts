
import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
import path from 'path';

dotenv.config({ path: path.resolve(process.cwd(), '.env') });
const supabase = createClient(process.env.VITE_SUPABASE_URL!, process.env.VITE_SUPABASE_SERVICE_ROLE_KEY!);

async function checkAllOrders() {
    const { data: orders } = await supabase.from('orders').select('*');

    if (!orders) return;

    console.log(`Total Orders in DB: ${orders.length}`);

    let grandTotal = 0;
    let batch001Total = 0;
    let unassignedTotal = 0;
    let cancelledTotal = 0;

    orders.forEach(o => {
        const val = (o.quantity_ordered * (o.estimated_cost_per_unit || 0));
        grandTotal += val;

        if (o.status === 'cancelled') {
            cancelledTotal += val;
        } else if (o.order_group_id === 'Batch 001') {
            batch001Total += val;
        } else {
            unassignedTotal += val;
            console.log(`Unassigned Order: ${o.id} - Value: $${val} - Status: ${o.status}`);
        }

        if (!o.estimated_cost_per_unit || o.estimated_cost_per_unit === 0) {
            console.log(`Order with ZERO/NULL cost: ${o.id} - Qty: ${o.quantity_ordered}`);
        }
    });

    console.log(`Grand Total Value (All Orders): $${grandTotal.toFixed(2)}`);
    console.log(`Batch 001 Total: $${batch001Total.toFixed(2)}`);
    console.log(`Cancelled Total: $${cancelledTotal.toFixed(2)}`);
    console.log(`Unassigned Total: $${unassignedTotal.toFixed(2)}`);
}

checkAllOrders();
