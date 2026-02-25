/**
 * order-profit.ts — Shared profit recalculation for sales orders
 *
 * Single source of truth for the profit formula:
 *   profit = total - cogs - shipping - commission - merchant_fee
 *
 * Called from: useCreateSalesOrder, useUpdateSalesOrder, useFulfillOrder
 */

import { supabase } from '@/integrations/sb_client/client';
import { logger } from '@/lib/logger';

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
const FEE_EXEMPT_METHODS = ['credit', 'cash', 'wire', 'store_credit', 'commission_offset'];

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
        logger.error('[order-profit] Failed to fetch order:', orderErr?.message);
        return;
    }

    // 2. Calculate COGS from weighted-average lot costs
    const typedOrder = order as unknown as OrderWithItems;
    const items = typedOrder.sales_order_items || [];
    const peptideIds = [...new Set(items.map((i) => i.peptide_id).filter(Boolean))];

    let cogsAmount = 0;

    if (peptideIds.length > 0) {
        const { data: lots } = await supabase
            .from('lots')
            .select('peptide_id, cost_per_unit, quantity_received')
            .in('peptide_id', peptideIds);

        // Build weighted-average cost per peptide: SUM(cost × qty) / SUM(qty)
        const grouped: Record<string, { totalCost: number; totalQty: number }> = {};
        lots?.forEach((l: { peptide_id: string; cost_per_unit: number; quantity_received: number }) => {
            const cost = Number(l.cost_per_unit || 0);
            const qty = Number(l.quantity_received || 0);
            if (!grouped[l.peptide_id]) grouped[l.peptide_id] = { totalCost: 0, totalQty: 0 };
            grouped[l.peptide_id].totalCost += cost * qty;
            grouped[l.peptide_id].totalQty += qty;
        });

        const avgCosts = new Map<string, number>();
        Object.entries(grouped).forEach(([pid, { totalCost, totalQty }]) => {
            avgCosts.set(pid, totalQty > 0 ? totalCost / totalQty : 0);
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
        logger.error('[order-profit] Failed to update order:', updateErr.message);
    }
}
