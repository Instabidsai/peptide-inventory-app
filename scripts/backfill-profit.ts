/**
 * backfill-profit.ts — One-time script to calculate COGS and profit for existing orders
 *
 * Usage: npx tsx scripts/backfill-profit.ts
 */

import 'dotenv/config';
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
    process.env.VITE_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
);

async function main() {
    console.log('[backfill] Loading lot costs...');

    // Build avg cost map from lots
    const { data: lots } = await supabase.from('lots').select('peptide_id, cost_per_unit');
    const grouped: Record<string, number[]> = {};
    lots?.forEach(l => {
        if (!grouped[l.peptide_id]) grouped[l.peptide_id] = [];
        grouped[l.peptide_id].push(Number(l.cost_per_unit || 0));
    });
    const avgCostMap = new Map<string, number>();
    Object.entries(grouped).forEach(([pid, costs]) => {
        avgCostMap.set(pid, costs.reduce((a, b) => a + b, 0) / costs.length);
    });

    console.log(`[backfill] Loaded costs for ${avgCostMap.size} peptides`);

    // Get all orders with their items
    const { data: orders } = await supabase
        .from('sales_orders')
        .select('id, total_amount, shipping_cost, commission_amount, sales_order_items(peptide_id, quantity)');

    if (!orders?.length) {
        console.log('[backfill] No orders found.');
        return;
    }

    console.log(`[backfill] Processing ${orders.length} orders...\n`);
    let updated = 0;

    for (const order of orders) {
        const items = (order as any).sales_order_items || [];
        let cogs = 0;
        for (const item of items) {
            const cost = avgCostMap.get(item.peptide_id) || 0;
            cogs += cost * item.quantity;
        }

        const profit = (order.total_amount || 0) - cogs - (order.shipping_cost || 0) - (order.commission_amount || 0);

        const { error } = await supabase
            .from('sales_orders')
            .update({ cogs_amount: cogs, profit_amount: profit })
            .eq('id', order.id);

        if (error) {
            console.error(`  Error on ${order.id}: ${error.message}`);
        } else {
            console.log(`  ${order.id.slice(0, 8)} — COGS: $${cogs.toFixed(2)} | Profit: $${profit.toFixed(2)}`);
            updated++;
        }
    }

    console.log(`\n[backfill] Done. Updated ${updated}/${orders.length} orders.`);
}

main().catch(err => {
    console.error('[backfill] Fatal:', err);
    process.exit(1);
});
