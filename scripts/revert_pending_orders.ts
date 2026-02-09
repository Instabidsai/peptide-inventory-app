
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

async function revertPendingOrders() {
    console.log("Reverting 'Pending' Orders to 'Unpaid'...");

    // 1. Fetch pending orders that are wrongly marked as paid
    const { data: orders } = await supabase
        .from('orders')
        .select('id, status, payment_status')
        .eq('status', 'pending')
        .eq('payment_status', 'paid');

    if (!orders || orders.length === 0) {
        console.log("No pending paid orders found.");
        return;
    }

    console.log(`Found ${orders.length} pending orders that should be unpaid.`);

    // 2. Revert them
    const { error } = await supabase
        .from('orders')
        .update({
            payment_status: 'unpaid',
            amount_paid: 0
        })
        .in('id', orders.map(o => o.id));

    if (error) {
        console.error("Error updating:", error);
    } else {
        console.log("✅ Successfully reverted pending orders to 'Unpaid'.");
    }
}

revertPendingOrders();
