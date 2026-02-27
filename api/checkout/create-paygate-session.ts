import type { VercelRequest, VercelResponse } from '@vercel/node';
import { createClient } from '@supabase/supabase-js';
import crypto from 'crypto';

/**
 * PayGate365 checkout session creator — no JWT required.
 * Auth is implicit: order UUIDs are 128-bit unguessable tokens.
 *
 * Flow:
 *   1. Validate order exists and is payable
 *   2. Generate HMAC nonce for callback verification
 *   3. Call PayGate365 wallet API to get a temporary deposit address
 *   4. Build hosted checkout redirect URL
 *   5. Return checkout_url to client
 *
 * POST body: { orderId: string }
 */
export default async function handler(req: VercelRequest, res: VercelResponse) {
    if (req.method !== 'POST') {
        return res.status(405).json({ error: 'Method not allowed' });
    }

    try {
        const { orderId } = req.body;
        if (!orderId) {
            return res.status(400).json({ error: 'orderId is required' });
        }

        const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
        if (!uuidRegex.test(orderId)) {
            return res.status(400).json({ error: 'Invalid order ID format' });
        }

        const supabaseUrl = process.env.SUPABASE_URL;
        const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
        const walletAddress = process.env.PAYGATE365_WALLET_ADDRESS;
        const nonceSecret = process.env.PAYGATE365_NONCE_SECRET;
        const siteUrl = process.env.PUBLIC_SITE_URL;

        if (!supabaseUrl || !supabaseServiceKey || !walletAddress || !nonceSecret || !siteUrl) {
            console.error('Missing PayGate365 environment variables');
            return res.status(500).json({ error: 'Server configuration error' });
        }

        const supabase = createClient(supabaseUrl, supabaseServiceKey);

        // Fetch the order + contact email
        const { data: order, error: orderError } = await supabase
            .from('sales_orders')
            .select('id, total_amount, payment_status, status, contacts (email)')
            .eq('id', orderId)
            .single();

        if (orderError || !order) {
            return res.status(404).json({ error: 'Order not found' });
        }

        if (order.payment_status === 'paid') {
            return res.status(400).json({ error: 'This order has already been paid' });
        }
        if (order.status === 'cancelled') {
            return res.status(400).json({ error: 'This order has been cancelled' });
        }

        const orderTotal = Number(order.total_amount || 0);
        if (orderTotal <= 0) {
            return res.status(400).json({ error: 'Order total must be greater than zero' });
        }

        // 3% card processing surcharge
        const CARD_FEE_RATE = 0.03;
        const cardFee = Math.round(orderTotal * CARD_FEE_RATE * 100) / 100;
        const chargeTotal = Math.round((orderTotal + cardFee) * 100) / 100;

        // Generate HMAC nonce for callback verification (stateless — no DB needed)
        const nonce = crypto
            .createHmac('sha256', nonceSecret)
            .update(orderId)
            .digest('hex')
            .slice(0, 32);

        // Build callback URL that PayGate365 will GET after payment
        const callbackUrl = `${siteUrl}/api/webhooks/paygate365?order_id=${orderId}&nonce=${nonce}`;

        // Call PayGate365 wallet API to get a temporary deposit address
        const walletUrl = `https://api.paygate.to/control/wallet.php?address=${walletAddress}&callback=${encodeURIComponent(callbackUrl)}`;
        const walletRes = await fetch(walletUrl);

        if (!walletRes.ok) {
            const errText = await walletRes.text();
            console.error('PayGate365 wallet API failed:', walletRes.status, errText);
            return res.status(502).json({ error: 'Payment processor error' });
        }

        const walletData = await walletRes.json();
        const addressIn = walletData.address_in;

        if (!addressIn) {
            console.error('PayGate365 wallet API returned no address_in:', walletData);
            return res.status(502).json({ error: 'Payment processor returned invalid data' });
        }

        // Build direct checkout URL using Wert.io provider (clean card form, $1 minimum)
        // process-payment.php 302-redirects to widget.wert.io — no signature needed
        const contactEmail = (order.contacts as any)?.email || '';
        const checkoutUrl = `https://checkout.paygate.to/process-payment.php?currency=usd&address=${addressIn}&amount=${chargeTotal}&provider=wert&email=${encodeURIComponent(contactEmail)}`;

        // Update order with payment method
        await supabase
            .from('sales_orders')
            .update({
                payment_method: 'paygate365',
                psifi_status: 'pendingPayment',
            })
            .eq('id', orderId);

        return res.status(200).json({ checkout_url: checkoutUrl });

    } catch (error: any) {
        console.error('PayGate365 session creation failed:', error);
        return res.status(500).json({ error: 'Internal server error' });
    }
}
