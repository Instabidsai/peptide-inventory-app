
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

async function auditLotsVsOrders() {
    console.log("Auditing Lots (Inventory) vs Orders (Financials)...");

    // 1. Get Peptides Map (First, small query)
    console.log("Fetching Peptides...");
    const { data: peptides } = await supabase.from('peptides').select('id, name');
    const nameMap = peptides?.reduce((acc, p) => ({ ...acc, [p.id]: p.name }), {}) || {};
    console.log(`Fetched ${peptides?.length} peptides.`);

    // 2. Get Lots (No Join)
    console.log("Fetching Lots...");
    const { data: lots, error: lotError } = await supabase
        .from('lots')
        .select('id, lot_number, cost_per_unit, quantity_received, peptide_id');

    if (lotError) {
        console.error("Error fetching lots:", lotError);
        return;
    }
    console.log(`Fetched ${lots?.length} lots.`);

    let totalInventoryValue = 0;
    const lotMap: Record<string, any> = {};

    lots.forEach(lot => {
        const value = (lot.quantity_received || 0) * (lot.cost_per_unit || 0);
        totalInventoryValue += value;
        lotMap[lot.peptide_id] = (lotMap[lot.peptide_id] || 0) + value;
    });

    console.log(`Total Inventory Value (Lots): $${totalInventoryValue.toFixed(2)}`);

    // 3. Get Received Orders (No Join)
    console.log("Fetching Orders...");
    const { data: orders, error: orderError } = await supabase
        .from('orders')
        .select('id, quantity_ordered, estimated_cost_per_unit, peptide_id')
        .eq('status', 'received');

    if (orderError) {
        console.error("Error fetching orders:", orderError);
        return;
    }
    console.log(`Fetched ${orders?.length} received orders.`);

    let totalOrdersValue = 0;
    const orderMap: Record<string, any> = {};

    orders.forEach(order => {
        const value = (order.quantity_ordered || 0) * (order.estimated_cost_per_unit || 0);
        totalOrdersValue += value;
        orderMap[order.peptide_id] = (orderMap[order.peptide_id] || 0) + value;
    });

    console.log(`Total Received Orders Value: $${totalOrdersValue.toFixed(2)}`);
    console.log(`Discrepancy: $${(totalInventoryValue - totalOrdersValue).toFixed(2)}`);

    // 4. Find missing items
    console.log("\n--- Item Discrepancies ---");
    const allPeptideIds = new Set([...Object.keys(lotMap), ...Object.keys(orderMap)]);

    // Names already fetched above

    let missingSum = 0;

    for (const pid of allPeptideIds) {
        const lotVal = lotMap[pid] || 0;
        const orderVal = orderMap[pid] || 0;
        const diff = lotVal - orderVal;

        if (Math.abs(diff) > 10) { // Show differences > $10
            console.log(`${nameMap[pid] || pid}:`);
            console.log(`  Inv: $${lotVal.toFixed(2)} | Orders: $${orderVal.toFixed(2)} | Diff: $${diff.toFixed(2)}`);
            if (diff > 0) missingSum += diff;
        }
    }

    console.log(`\nTotal Missing from Orders: $${missingSum.toFixed(2)}`);

    // Write to JSON for backfill script
    try {
        const fs = await import('fs');
        const missingItems = [];
        for (const pid of allPeptideIds) {
            const lotVal = lotMap[pid] || 0;
            const orderVal = orderMap[pid] || 0;
            const diff = lotVal - orderVal;

            if (diff > 1) { // Positive diff means Inventory > Orders (Missing Order)
                missingItems.push({
                    peptide_id: pid,
                    name: nameMap[pid],
                    missing_value: diff,
                    inventory_value: lotVal,
                    order_value: orderVal
                });
            }
        }

        console.log(`Found ${missingItems.length} missing items.`);
        fs.writeFileSync('missing_items.json', JSON.stringify(missingItems, null, 2));
        console.log(`✅ Wrote missing items to missing_items.json`);
    } catch (err) {
        console.error("Error writing JSON:", err);
    }
}

auditLotsVsOrders().catch(e => console.error("Fatal Error:", e));
