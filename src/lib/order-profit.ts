/**
 * order-profit.ts — Shared profit recalculation for sales orders
 *
 * Single source of truth for the profit formula:
 *   profit = total - cogs - shipping - commission - merchant_fee
 *
 * Called from: useCreateSalesOrder, useUpdateSalesOrder, useFulfillOrder
 */

import { supabase } from '@/integrations/sb_client/client';

interface OrderWithItems {
    id: string;
    total_amount?: number;
    shipping_cost?: number;
    commission_amount?: number;
    payment_status?: string;
    payment_method?: string;
    sales_order_items?: Array<{
        peptide_id: string;
        quantity: number;
    }>;
}

interface LotCostRow {
    peptide_id: string;
    cost_per_unit: number;
}

export const MERCHANT_FEE_RATE = 0.05; // 5%

// Payment methods that are exempt from merchant fee
const FEE_EXEMPT_METHODS = ['credit', 'cash', 'wire', 'store_credit'];

export async function recalculateOrderProfit(orderId: string): Promise<void> {
    // 1. Fetch the order
    const { data: order, error: orderErr } = await supabase
        .from('sales_orders')
        .select(`
            id, total_amount, shipping_cost, commission_amount,
            payment_status, payment_method,
            sales_order_items (peptide_id, quantity)
        `)
        .eq('id', orderId)
        .single();

    if (orderErr || !order) {
        console.error('[order-profit] Failed to fetch order:', orderErr?.message);
        return;
    }

    // 2. Calculate COGS from average lot costs
    const typedOrder = order as unknown as OrderWithItems;
    const items = typedOrder.sales_order_items || [];
    const peptideIds = [...new Set(items.map((i) => i.peptide_id).filter(Boolean))];

    let cogsAmount = 0;

    if (peptideIds.length > 0) {
        // TODO: Use actual FIFO lot cost when bottle->lot mapping is available in order items
        const { data: lots } = await supabase
            .from('lots')
            .select('peptide_id, cost_per_unit')
            .in('peptide_id', peptideIds);

        // Build avg cost per peptide
        const grouped: Record<string, number[]> = {};
        lots?.forEach((l: LotCostRow) => {
            if (!grouped[l.peptide_id]) grouped[l.peptide_id] = [];
            grouped[l.peptide_id].push(Number(l.cost_per_unit || 0));
        });

        const avgCosts = new Map<string, number>();
        Object.entries(grouped).forEach(([pid, costs]) => {
            avgCosts.set(pid, costs.reduce((a, b) => a + b, 0) / costs.length);
        });

        for (const item of items) {
            const cost = avgCosts.get(item.peptide_id) || 0;
            cogsAmount += Math.round(cost * (item.quantity || 0) * 100) / 100;
        }
    }

    // 3. Determine merchant fee — always calculate for accurate profit estimates,
    // even before payment is received. Exempt payment methods still skip the fee.
    const isExempt = FEE_EXEMPT_METHODS.includes(order.payment_method || '');
    const merchantFee = !isExempt
        ? Math.round((order.total_amount || 0) * MERCHANT_FEE_RATE * 100) / 100
        : 0;

    // 4. Calculate profit (round each component and the final result)
    const profitAmount = Math.round(
        ((order.total_amount || 0)
        - cogsAmount
        - (order.shipping_cost || 0)
        - (order.commission_amount || 0)
        - merchantFee) * 100
    ) / 100;

    // 5. Update the order
    // Fields cogs_amount, merchant_fee, profit_amount exist in the DB but may not
    // be in generated Supabase types yet — cast needed until types are regenerated.
    const { error: updateErr } = await supabase
        .from('sales_orders')
        .update({
            cogs_amount: Math.round(cogsAmount * 100) / 100,
            merchant_fee: merchantFee,
            profit_amount: profitAmount,
        } as Record<string, number>)
        .eq('id', orderId);

    if (updateErr) {
        console.error('[order-profit] Failed to update order:', updateErr.message);
    }
}
