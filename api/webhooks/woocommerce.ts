import type { VercelRequest, VercelResponse } from '@vercel/node';
import { createClient } from '@supabase/supabase-js';
import crypto from 'crypto';
import { syncSingleWooOrder } from './_woo-sync-shared';

/**
 * WooCommerce Webhook Handler
 * Receives order create/update notifications and syncs to Supabase.
 * Endpoint: POST /api/webhooks/woocommerce
 *
 * Configure in WooCommerce: Settings → Advanced → Webhooks
 * Topic: "Order updated" (fires on both create and update)
 */

// Disable Vercel body parser so we get the raw string for signature verification
export const config = { api: { bodyParser: false } };

function verifyWooSignature(payload: string, signature: string, secret: string): boolean {
    const expected = crypto
        .createHmac('sha256', secret)
        .update(payload)
        .digest('base64');

    const expectedBuf = Buffer.from(expected, 'base64');
    const sigBuf = Buffer.from(signature, 'base64');

    if (expectedBuf.length !== sigBuf.length) return false;
    return crypto.timingSafeEqual(expectedBuf, sigBuf);
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
    if (req.method !== 'POST') {
        return res.status(405).json({ error: 'Method not allowed' });
    }

    try {
        const supabaseUrl = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL;
        const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
        const webhookSecret = process.env.WOO_WEBHOOK_SECRET;
        const orgId = process.env.DEFAULT_ORG_ID || '33a18316-b0a4-4d85-a770-d1ceb762bd4f';

        if (!supabaseUrl || !supabaseServiceKey) {
            console.error('[WooCommerce Webhook] Missing Supabase env vars');
            return res.status(500).json({ error: 'Server configuration error' });
        }

        // Read raw body from stream (body parser disabled for signature verification)
        const chunks: Buffer[] = [];
        for await (const chunk of req) {
            chunks.push(typeof chunk === 'string' ? Buffer.from(chunk) : chunk);
        }
        const rawBody = Buffer.concat(chunks).toString('utf8');

        // Verify signature if secret is configured
        if (webhookSecret) {
            const signature = req.headers['x-wc-webhook-signature'] as string;
            if (!signature || !verifyWooSignature(rawBody, signature, webhookSecret)) {
                console.error('[WooCommerce Webhook] Signature verification failed');
                return res.status(401).json({ error: 'Invalid signature' });
            }
        }

        // WooCommerce sends a ping on webhook creation — just acknowledge it
        const topic = req.headers['x-wc-webhook-topic'] as string;
        const resource = req.headers['x-wc-webhook-resource'] as string;

        if (!rawBody || rawBody === '{}') {
            console.log('[WooCommerce Webhook] Ping received, acknowledging');
            return res.status(200).json({ received: true, action: 'ping' });
        }

        let wooOrder: any;
        try {
            wooOrder = JSON.parse(rawBody);
        } catch {
            return res.status(400).json({ error: 'Invalid JSON body' });
        }

        // WooCommerce sends the full order object for order.created / order.updated
        if (resource !== 'order' && !wooOrder.id) {
            console.log(`[WooCommerce Webhook] Non-order event: ${topic}, skipping`);
            return res.status(200).json({ received: true, action: 'skipped' });
        }

        console.log(`[WooCommerce Webhook] ${topic || 'order'} #${wooOrder.number || wooOrder.id}, status: ${wooOrder.status}`);

        const supabase = createClient(supabaseUrl, supabaseServiceKey);
        const result = await syncSingleWooOrder(supabase, wooOrder, orgId);

        console.log(`[WooCommerce Webhook] Order #${result.orderNumber}: ${result.action}`);

        return res.status(200).json({ received: true, ...result });

    } catch (error: any) {
        console.error('[WooCommerce Webhook] Error:', error.message || error);
        // Return 200 to prevent WooCommerce from endlessly retrying code bugs
        return res.status(200).json({ error: 'Internal processing error', received: true });
    }
}
