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
    for (const sig of sigList) {
        const [version, sigValue] = sig.split(',');
        if (version === 'v1' && sigValue === expectedSignature) {
            return true;
        }
    }

    return false;
}

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

        // --- Verify Svix Signature ---
        const rawBody = typeof req.body === 'string' ? req.body : JSON.stringify(req.body);

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
        const event = typeof req.body === 'string' ? JSON.parse(req.body) : req.body;

        const eventType = event.event || event.type;
        const transactionId = event.order_id || event.transaction_id || event.id;
        const status = event.status || event.order?.status;
        const externalId = event.order?.externalId || event.external_id || event.metadata?.external_id;

        console.log(`[PsiFi Webhook] Event: ${eventType}, Status: ${status}, ExternalId: ${externalId}, TransactionId: ${transactionId}`);

        if (!externalId) {
            console.warn('[PsiFi Webhook] No external_id found in event, skipping');
            return res.status(200).json({ received: true, action: 'skipped_no_external_id' });
        }

        // --- Update order in Supabase ---
        const supabase = createClient(supabaseUrl, supabaseServiceKey);

        const statusLower = (status || '').toLowerCase();

        if (TERMINAL_SUCCESS.includes(statusLower)) {
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
                .eq('id', externalId);

            if (updateError) {
                console.error('[PsiFi Webhook] Failed to update order:', updateError);
                return res.status(500).json({ error: 'Database update failed' });
            }

            console.log(`[PsiFi Webhook] Order ${externalId} marked as PAID`);

        } else if (TERMINAL_FAILURE.includes(statusLower)) {
            // Payment failed/cancelled
            const { error: updateError } = await supabase
                .from('sales_orders')
                .update({
                    psifi_status: statusLower,
                    psifi_transaction_id: transactionId,
                })
                .eq('id', externalId);

            if (updateError) {
                console.error('[PsiFi Webhook] Failed to update failed order:', updateError);
                return res.status(500).json({ error: 'Database update failed' });
            }

            console.log(`[PsiFi Webhook] Order ${externalId} marked as ${statusLower}`);

        } else {
            // Intermediate status update (pendingPayment, inProgress, etc.)
            const { error: updateError } = await supabase
                .from('sales_orders')
                .update({
                    psifi_status: statusLower,
                })
                .eq('id', externalId);

            if (updateError) {
                console.error('[PsiFi Webhook] Failed to update intermediate status:', updateError);
            }

            console.log(`[PsiFi Webhook] Order ${externalId} status updated to ${statusLower}`);
        }

        // Always return 200 to acknowledge receipt
        return res.status(200).json({ received: true, action: 'processed' });

    } catch (error: any) {
        console.error('[PsiFi Webhook] Unhandled error:', error);
        // Return 200 anyway to prevent Svix from retrying for code bugs
        // Only return non-200 for transient errors (DB down, etc.)
        return res.status(500).json({ error: 'Internal server error' });
    }
}
