
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

async function organizeBatchesAndPayments() {
    console.log("Starting Batch Organization & Payment Record...");

    // --- STEP 1: Batch 001 (Received Items) ---
    console.log("\n--- Processing Batch 001 (Received) ---");
    const { data: batch1Orders } = await supabase
        .from('orders')
        .select('*')
        .eq('status', 'received');

    if (batch1Orders && batch1Orders.length > 0) {
        console.log(`Found ${batch1Orders.length} received orders.`);

        // Calculate Total
        const batch1Total = batch1Orders.reduce((sum, o) => {
            return sum + ((o.quantity_ordered || 0) * (o.estimated_cost_per_unit || 0));
        }, 0);

        console.log(`Batch 001 Total Value: $${batch1Total.toFixed(2)}`);

        // Update Orders
        const { error: updateError } = await supabase
            .from('orders')
            .update({
                order_group_id: 'Batch 001',
                payment_status: 'paid', // Ensure they are paid
                amount_paid: 999999 // We'll fix this to exact amount in loop below to be safe, or just bulk update
                // Actually, let's look at my previous script. 
                // I'll loop to set exact amount_paid = cost.
            })
            .in('id', batch1Orders.map(o => o.id)); // Bulk update first for group_id

        if (updateError) console.error("Error updating Batch 001 group:", updateError);

        // Set exact amounts
        for (const order of batch1Orders) {
            const cost = (order.quantity_ordered || 0) * (order.estimated_cost_per_unit || 0);
            await supabase.from('orders').update({ amount_paid: cost }).eq('id', order.id);
        }

        // Create Expense Record
        // Check if exists first to avoid dupes?
        // User said "add a payment", implying it's not there.
        const { error: expenseError } = await supabase.from('expenses').insert({
            date: new Date().toISOString().split('T')[0],
            category: 'inventory',
            amount: batch1Total,
            description: 'Payment for Batch 001 (Initial Inventory / Received)',
            recipient: 'Multiple Suppliers',
            payment_method: 'wire',
            status: 'paid'
        });

        if (expenseError) console.error("Error creating Batch 001 expense:", expenseError);
        else console.log("✅ Created Expense for Batch 001.");

    } else {
        console.log("No received orders found for Batch 001.");
    }

    // --- STEP 2: Batch 002 (Pending Items) ---
    console.log("\n--- Processing Batch 002 (Pending) ---");
    const { data: batch2Orders } = await supabase
        .from('orders')
        .select('*')
        .eq('status', 'pending');

    if (batch2Orders && batch2Orders.length > 0) {
        console.log(`Found ${batch2Orders.length} pending orders.`);

        // Update Orders Group ID
        await supabase
            .from('orders')
            .update({ order_group_id: 'Batch 002' })
            .in('id', batch2Orders.map(o => o.id));

        console.log("Assigned 'Batch 002' to pending orders.");

        // Create Expense Record for Deposit
        const depositAmount = 5000;
        const { error: depositError } = await supabase.from('expenses').insert({
            date: new Date().toISOString().split('T')[0],
            category: 'inventory',
            amount: depositAmount,
            description: 'Deposit for Batch 002',
            recipient: 'Supplier',
            payment_method: 'wire',
            status: 'paid'
        });

        if (depositError) console.error("Error creating Deposit expense:", depositError);
        else console.log(`✅ Created $${depositAmount} Deposit Expense.`);

        // Distribute Credit
        let remainingCredit = depositAmount;

        // Sort orders to apply credit deterministically? Maybe strictly by ID or Cost?
        // Let's just iterate.
        for (const order of batch2Orders) {
            if (remainingCredit <= 0) break;

            const cost = (order.quantity_ordered || 0) * (order.estimated_cost_per_unit || 0);

            // Determine how much we can pay for this specific order
            const payAmount = Math.min(cost, remainingCredit);

            const newStatus = (Math.abs(payAmount - cost) < 0.01) ? 'paid' : 'partial';

            console.log(`  > Applying $${payAmount.toFixed(2)} to Order ${order.id} (Cost: $${cost.toFixed(2)}) -> ${newStatus}`);

            await supabase
                .from('orders')
                .update({
                    amount_paid: payAmount,
                    payment_status: newStatus
                })
                .eq('id', order.id);

            remainingCredit -= payAmount;
        }

        console.log(`Remaining Unused Credit: $${remainingCredit.toFixed(2)}`);

    } else {
        console.log("No pending orders found for Batch 002.");
    }

    console.log("\n✅ Done! Batches organized and payments recorded.");
}

organizeBatchesAndPayments();
