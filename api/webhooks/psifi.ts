import type { VercelRequest, VercelResponse } from '@vercel/node';
import { createClient } from '@supabase/supabase-js';
import crypto from 'crypto';

/**
 * PsiFi Webhook Handler
 * Receives payment notifications from PsiFi (via Svix) and updates order status in Supabase.
 * Endpoint: POST /api/webhooks/psifi
 */

// Svix signature verification
function verifySvixSignature(
    payload: string,
    headers: {
        'svix-id': string;
        'svix-timestamp': string;
        'svix-signature': string;
    },
    secret: string
): boolean {
    const msgId = headers['svix-id'];
    const timestamp = headers['svix-timestamp'];
    const signatures = headers['svix-signature'];

    if (!msgId || !timestamp || !signatures) {
        return false;
    }

    // Check timestamp is within 5 minutes to prevent replay attacks
    const now = Math.floor(Date.now() / 1000);
    const ts = parseInt(timestamp, 10);
    if (Math.abs(now - ts) > 300) {
        return false;
    }

    // Compute expected signature
    const toSign = `${msgId}.${timestamp}.${payload}`;

    // The secret from Svix starts with "whsec_" prefix, strip it and base64 decode
    const secretBytes = Buffer.from(
        secret.startsWith('whsec_') ? secret.slice(6) : secret,
        'base64'
    );

    const expectedSignature = crypto
        .createHmac('sha256', secretBytes)
        .update(toSign)
        .digest('base64');

    // Svix sends multiple signatures separated by space, each prefixed with version
    // e.g., "v1,<base64sig> v1,<base64sig2>"
    const sigList = signatures.split(' ');
    const expectedBuf = Buffer.from(expectedSignature, 'base64');
    for (const sig of sigList) {
        const [version, sigValue] = sig.split(',');
        if (version === 'v1' && sigValue) {
            const sigBuf = Buffer.from(sigValue, 'base64');
            if (sigBuf.length === expectedBuf.length && crypto.timingSafeEqual(sigBuf, expectedBuf)) {
                return true;
            }
        }
    }

    return false;
}

// Disable Vercel body parser so we get the raw string for signature verification
export const config = { api: { bodyParser: false } };

// Terminal statuses that should mark payment as complete
const TERMINAL_SUCCESS = ['complete', 'completed'];
const TERMINAL_FAILURE = ['failed', 'cancelled', 'expired', 'refunded'];

export default async function handler(req: VercelRequest, res: VercelResponse) {
    if (req.method !== 'POST') {
        return res.status(405).json({ error: 'Method not allowed' });
    }

    try {
        const supabaseUrl = process.env.SUPABASE_URL;
        const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
        const webhookSecret = process.env.PSIFI_WEBHOOK_SECRET;

        if (!supabaseUrl || !supabaseServiceKey || !webhookSecret) {
            console.error('Missing environment variables for webhook handler');
            return res.status(500).json({ error: 'Server configuration error' });
        }

        // Read raw body from stream (body parser disabled for signature verification)
        const chunks: Buffer[] = [];
        for await (const chunk of req) {
            chunks.push(typeof chunk === 'string' ? Buffer.from(chunk) : chunk);
        }
        const rawBody = Buffer.concat(chunks).toString('utf8');

        const svixHeaders = {
            'svix-id': req.headers['svix-id'] as string,
            'svix-timestamp': req.headers['svix-timestamp'] as string,
            'svix-signature': req.headers['svix-signature'] as string,
        };

        const isValid = verifySvixSignature(rawBody, svixHeaders, webhookSecret);
        if (!isValid) {
            console.error('Webhook signature verification failed');
            return res.status(401).json({ error: 'Invalid signature' });
        }

        // --- Parse Event ---
        let event: any;
        try {
            event = JSON.parse(rawBody);
        } catch {
            return res.status(400).json({ error: 'Invalid JSON body' });
        }

        const eventType = event.event || event.type;
        const transactionId = event.order_id || event.transaction_id || event.id;
        const status = event.status || event.order?.status;
        const rawExternalId = event.order?.externalId || event.external_id || event.metadata?.external_id;

        // Extract the actual order UUID from external_id.
        // Format may be: plain UUID, or "UUID-pl-timestamp" / "UUID-cs-timestamp"
        // Also check metadata.order_id as a fallback.
        let orderId: string | null = null;
        if (rawExternalId) {
            // Try to extract UUID from the beginning (36 chars = UUID length)
            const uuidMatch = rawExternalId.match(/^([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})/i);
            orderId = uuidMatch ? uuidMatch[1] : rawExternalId;
        }
        // Fallback: check metadata for order_id
        if (!orderId) {
            orderId = event.metadata?.order_id || null;
        }

        console.log(`[PsiFi Webhook] Event: ${eventType}, Status: ${status}, RawExternalId: ${rawExternalId}, OrderId: ${orderId}, TransactionId: ${transactionId}`);

        if (!orderId) {
            console.warn('[PsiFi Webhook] No order_id found in event, skipping');
            return res.status(200).json({ received: true, action: 'skipped_no_order_id' });
        }

        // --- Update order in Supabase ---
        const supabase = createClient(supabaseUrl, supabaseServiceKey);

        const statusLower = (status || '').toLowerCase();

        if (TERMINAL_SUCCESS.includes(statusLower)) {
            // Idempotency: check if already paid to prevent duplicate processing
            const { data: existingOrder } = await supabase
                .from('sales_orders')
                .select('payment_status')
                .eq('id', orderId)
                .single();

            if (existingOrder?.payment_status === 'paid') {
                console.log(`[PsiFi Webhook] Order ${orderId} already paid, skipping`);
                return res.status(200).json({ received: true, action: 'already_paid' });
            }

            // Payment succeeded
            const { error: updateError } = await supabase
                .from('sales_orders')
                .update({
                    payment_status: 'paid',
                    psifi_status: 'complete',
                    psifi_transaction_id: transactionId,
                    amount_paid: event.order?.totalAmount
                        ? event.order.totalAmount / 100  // Convert cents to dollars
                        : undefined,
                    payment_method: 'psifi',
                    payment_date: new Date().toISOString(),
                })
                .eq('id', orderId);

            if (updateError) {
                console.error('[PsiFi Webhook] Failed to update order:', updateError);
                return res.status(500).json({ error: 'Database update failed' });
            }

            console.log(`[PsiFi Webhook] Order ${orderId} marked as PAID`);

            // Process commissions + notify partners via SMS
            const { data: orderCheck } = await supabase
                .from('sales_orders')
                .select('commission_amount')
                .eq('id', orderId)
                .single();

            if (orderCheck && (orderCheck.commission_amount ?? 0) > 0) {
                const { error: rpcError } = await supabase.rpc('process_sale_commission', { p_sale_id: orderId });
                if (rpcError) {
                    console.error(`[PsiFi Webhook] Commission processing failed for ${orderId}:`, rpcError);
                } else {
                    console.log(`[PsiFi Webhook] Commissions processed for ${orderId}`);
                    // Notify partners — fire-and-forget, don't block webhook response
                    await supabase.functions.invoke('notify-commission', { body: { sale_id: orderId } })
                        .catch((e: any) => console.error(`[PsiFi Webhook] notify-commission failed:`, e));
                }
            }

        } else if (TERMINAL_FAILURE.includes(statusLower)) {
            // Payment failed/cancelled
            const { error: updateError } = await supabase
                .from('sales_orders')
                .update({
                    psifi_status: statusLower,
                    psifi_transaction_id: transactionId,
                })
                .eq('id', orderId);

            if (updateError) {
                console.error('[PsiFi Webhook] Failed to update failed order:', updateError);
                return res.status(500).json({ error: 'Database update failed' });
            }

            console.log(`[PsiFi Webhook] Order ${orderId} marked as ${statusLower}`);

        } else {
            // Intermediate status update (pendingPayment, inProgress, etc.)
            const { error: updateError } = await supabase
                .from('sales_orders')
                .update({
                    psifi_status: statusLower,
                })
                .eq('id', orderId);

            if (updateError) {
                console.error('[PsiFi Webhook] Failed to update intermediate status:', updateError);
            }

            console.log(`[PsiFi Webhook] Order ${orderId} status updated to ${statusLower}`);
        }

        // Always return 200 to acknowledge receipt
        return res.status(200).json({ received: true, action: 'processed' });

    } catch (error: any) {
        console.error('[PsiFi Webhook] Unhandled error:', error);
        // Return 200 to prevent Svix from endlessly retrying code bugs
        return res.status(200).json({ error: 'Internal server error', received: true });
    }
}
