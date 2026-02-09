
import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';
import fs from 'fs';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

dotenv.config({ path: path.resolve(__dirname, '../.env') });

const supabase = createClient(
    process.env.VITE_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
);

async function backfillMissingOrders() {
    console.log("Starting Backfill for Batch 001...");

    // 1. Read Missing Items
    const missingItemsRaw = fs.readFileSync('missing_items.json', 'utf8');
    const missingItems = JSON.parse(missingItemsRaw);

    if (!missingItems || missingItems.length === 0) {
        console.log("No items to backfill.");
        return;
    }

    console.log(`Found ${missingItems.length} items to backfill.`);

    let backfillTotal = 0;

    // 2. Create Orders
    for (const item of missingItems) {
        // We need to calculate quantity.
        // We know the value missing ($diff) and we assume the cost_per_unit is consistent from the Lot.
        // Let's fetch the lot to get the cost_per_unit again to be safe, or just use the data we have?
        // Wait, the audit script calculated diff based on (lot.qty * cost).
        // So we can infer quantity = diff / cost.

        // Actually, let's just look at the LOT data again for that peptide to be precise, 
        // OR just create an order for "1 unit" with total cost = diff? 
        // No, that messes up "Quantity Ordered" stats.
        // Better: create order for `item.missing_value` worth. 
        // We need the cost_per_unit to back-calculate quantity. 

        const { data: lot } = await supabase
            .from('lots')
            .select('cost_per_unit, org_id')
            .eq('peptide_id', item.peptide_id)
            .limit(1)
            .single();

        const cost = lot?.cost_per_unit || 1; // Default to 1 to avoid divide by zero if error
        const orgId = lot?.org_id;

        if (!orgId) {
            console.error(`Skipping ${item.name}: No org_id found in lot.`);
            continue;
        }

        const quantity = Math.round(item.missing_value / cost);

        console.log(`Creating order for ${item.name}: ${quantity} units @ $${cost} = $${item.missing_value}`);

        const { error } = await supabase.from('orders').insert({
            org_id: orgId,
            peptide_id: item.peptide_id,
            quantity_ordered: quantity,
            estimated_cost_per_unit: cost,
            order_date: new Date().toISOString().split('T')[0], // Today's date for backfill? Or past?
            status: 'received',
            payment_status: 'paid',
            amount_paid: item.missing_value,
            order_group_id: 'Batch 001',
            supplier: 'Backfill (Initial Inventory)'
        });

        if (error) console.error("Error creating order:", error);
        else backfillTotal += item.missing_value;
    }

    console.log(`\nBackfill Complete. Total Added: $${backfillTotal.toFixed(2)}`);

    // 3. Update Expense Record
    // Find the existing Batch 001 expense
    const { data: expenses } = await supabase
        .from('expenses')
        .select('*')
        .ilike('description', '%Batch 001%')
        .limit(1);

    if (expenses && expenses.length > 0) {
        const expense = expenses[0];
        const newAmount = expense.amount + backfillTotal;

        console.log(`Updating Expense ${expense.id}: $${expense.amount} -> $${newAmount}`);

        const { error: updateError } = await supabase
            .from('expenses')
            .update({ amount: newAmount })
            .eq('id', expense.id);

        if (updateError) console.error("Error updating expense:", updateError);
        else console.log("✅ Expense updated successfully.");
    } else {
        console.error("Could not find Batch 001 expense to update.");
    }
}

backfillMissingOrders();
