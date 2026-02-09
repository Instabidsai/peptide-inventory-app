
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

async function markOrdersPaid() {
    console.log("Marking ALL Inventory Orders as Paid...");

    // 1. Fetch current unpaid orders
    const { data: orders, error: fetchError } = await supabase
        .from('orders') // This is the inventory orders table (not client orders)
        .select('id, payment_status, status')
        .neq('status', 'cancelled')
        .neq('payment_status', 'paid');

    if (fetchError) {
        console.error("Error fetching orders:", fetchError);
        return;
    }

    if (!orders || orders.length === 0) {
        console.log("No unpaid orders found.");
        return;
    }

    console.log(`Found ${orders.length} unpaid inventory orders.`);

    // 2. Mark them as paid
    const { error: updateError } = await supabase
        .from('orders')
        .update({
            payment_status: 'paid',
            amount_paid: 999999, // Hack to force 'paid' logic if amount check exists? 
            // Wait, let's look at schema. usually just status is enough.
            // But Finance.tsx lines 76-78 use (cost - paid). 
            // So we MUST set amount_paid = total_cost.
            // We need to fetch cost to do this accurately.
        })
        .in('id', orders.map(o => o.id));

    // Actually, to set amount_paid correctly, we should calculate it per order.
    // Let's do a loop or smart query.

    console.log("Calculated updates required...");

    const { data: detailedOrders } = await supabase
        .from('orders')
        .select('id, quantity_ordered, estimated_cost_per_unit, amount_paid')
        .in('id', orders.map(o => o.id));

    if (!detailedOrders) return;

    for (const order of detailedOrders) {
        const totalCost = (order.quantity_ordered || 0) * (order.estimated_cost_per_unit || 0);

        await supabase
            .from('orders')
            .update({
                payment_status: 'paid',
                amount_paid: totalCost // Set to full amount
            })
            .eq('id', order.id);

        process.stdout.write('.');
    }

    console.log("\n✅ Done! All Past Orders marked as fully paid.");
}

markOrdersPaid();
