import type { VercelRequest, VercelResponse } from '@vercel/node';
import { createClient } from '@supabase/supabase-js';
import crypto from 'crypto';

/**
 * PayGate365 Callback Handler
 * Receives GET callbacks from PayGate365 after payment completes.
 *
 * GET /api/webhooks/paygate365?order_id={uuid}&nonce={hmac}&txid_out={txid}&value_coin={amount}
 *
 * Verification: HMAC nonce (stateless — recomputed from order_id + secret)
 * Threshold: 60% of expected amount (anti-manipulation, from PayGate365 plugin source)
 */
export default async function handler(req: VercelRequest, res: VercelResponse) {
    // PayGate365 sends callbacks as GET
    if (req.method !== 'GET') {
        return res.status(405).json({ error: 'Method not allowed' });
    }

    try {
        const supabaseUrl = process.env.SUPABASE_URL;
        const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
        const nonceSecret = process.env.PAYGATE365_NONCE_SECRET;
        const textbeltKey = process.env.TEXTBELT_API_KEY;

        if (!supabaseUrl || !supabaseServiceKey || !nonceSecret) {
            console.error('Missing environment variables for PayGate365 webhook');
            return res.status(500).json({ error: 'Server configuration error' });
        }

        const orderId = req.query.order_id as string;
        const nonce = req.query.nonce as string;
        const txidOut = req.query.txid_out as string;
        const valueCoin = req.query.value_coin as string;

        if (!orderId || !nonce) {
            return res.status(400).json({ error: 'Missing order_id or nonce' });
        }

        // Verify HMAC nonce
        const expectedNonce = crypto
            .createHmac('sha256', nonceSecret)
            .update(orderId)
            .digest('hex')
            .slice(0, 32);

        if (nonce !== expectedNonce) {
            console.error(`[PayGate365] Nonce mismatch for order ${orderId}`);
            return res.status(403).json({ error: 'Invalid nonce' });
        }

        const supabase = createClient(supabaseUrl, supabaseServiceKey);

        // Fetch order
        const { data: order, error: orderError } = await supabase
            .from('sales_orders')
            .select('id, total_amount, payment_status, commission_amount')
            .eq('id', orderId)
            .single();

        if (orderError || !order) {
            console.error(`[PayGate365] Order not found: ${orderId}`);
            return res.status(200).json({ message: 'order_not_found' });
        }

        // Idempotency: already paid
        if (order.payment_status === 'paid') {
            console.log(`[PayGate365] Order ${orderId} already paid, skipping`);
            return res.status(200).json({ message: 'already_paid' });
        }

        const expectedTotal = Number(order.total_amount || 0);
        const paidAmount = parseFloat(valueCoin || '0');
        const shortId = orderId.slice(0, 8);

        // 60% threshold check (from PayGate365 plugin source — anti-manipulation)
        if (paidAmount < expectedTotal * 0.60) {
            console.error(`[PayGate365] Payment below threshold for ${orderId}: paid=${paidAmount}, expected=${expectedTotal}`);

            await supabase
                .from('sales_orders')
                .update({
                    psifi_status: 'failed',
                    notes: `PayGate365: Payment below 60% threshold. Paid: $${paidAmount}, Expected: $${expectedTotal}. TXID: ${txidOut || 'none'}`,
                })
                .eq('id', orderId);

            return res.status(200).json({ message: 'below_threshold' });
        }

        // Mark order as paid
        const { error: updateError } = await supabase
            .from('sales_orders')
            .update({
                payment_status: 'paid',
                payment_method: 'paygate365',
                payment_date: new Date().toISOString(),
                amount_paid: paidAmount,
                psifi_status: 'complete',
                psifi_transaction_id: txidOut || null,
            })
            .eq('id', orderId);

        if (updateError) {
            console.error(`[PayGate365] Failed to update order ${orderId}:`, updateError);
            return res.status(500).json({ error: 'Database update failed' });
        }

        console.log(`[PayGate365] Order ${orderId} marked as PAID. Amount: $${paidAmount}, TXID: ${txidOut}`);

        // Process commissions if applicable
        if ((order.commission_amount ?? 0) > 0) {
            const { error: rpcError } = await supabase.rpc('process_sale_commission', { p_sale_id: orderId });
            if (rpcError) {
                console.error(`[PayGate365] Commission processing failed for ${orderId}:`, rpcError);
            } else {
                console.log(`[PayGate365] Commissions processed for ${orderId}`);
                // Notify partners — fire-and-forget
                supabase.functions.invoke('notify-commission', { body: { sale_id: orderId } })
                    .catch((e: any) => console.error(`[PayGate365] notify-commission failed:`, e));
            }
        }

        // SMS Justin about the payment
        if (textbeltKey) {
            const smsMsg = `PayGate365 payment received! Order #${shortId} - $${paidAmount.toFixed(2)}. TXID: ${txidOut || 'pending'}`;
            fetch('https://textbelt.com/text', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    phone: '+15615587020',
                    message: smsMsg,
                    key: textbeltKey,
                }),
            }).catch((e) => console.error('[PayGate365] SMS notification failed:', e));
        }

        return res.status(200).json({ message: 'Order marked as paid' });

    } catch (error: any) {
        console.error('[PayGate365] Unhandled error:', error);
        return res.status(200).json({ error: 'Internal server error', received: true });
    }
}
