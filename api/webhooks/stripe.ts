import type { VercelRequest, VercelResponse } from '@vercel/node';
import { createClient } from '@supabase/supabase-js';
import crypto from 'crypto';

/**
 * Stripe Webhook Handler
 * Handles subscription lifecycle events for tenant billing.
 * Endpoint: POST /api/webhooks/stripe
 */

function verifyStripeSignature(payload: string, signature: string, secret: string): boolean {
    const elements = signature.split(',').reduce<Record<string, string>>((acc, part) => {
        const [key, value] = part.split('=');
        acc[key.trim()] = value;
        return acc;
    }, {});

    const timestamp = elements['t'];
    const v1Sig = elements['v1'];
    if (!timestamp || !v1Sig) return false;

    // Replay protection: 5 minute window
    const now = Math.floor(Date.now() / 1000);
    if (Math.abs(now - parseInt(timestamp, 10)) > 300) return false;

    const signedPayload = `${timestamp}.${payload}`;
    const expected = crypto
        .createHmac('sha256', secret)
        .update(signedPayload)
        .digest('hex');

    // Timing-safe comparison to prevent side-channel attacks
    const a = Buffer.from(expected, 'hex');
    const b = Buffer.from(v1Sig, 'hex');
    return a.length === b.length && crypto.timingSafeEqual(a, b);
}

// Disable Vercel body parser so we get the raw string for signature verification
export const config = { api: { bodyParser: false } };

export default async function handler(req: VercelRequest, res: VercelResponse) {
    if (req.method !== 'POST') {
        return res.status(405).json({ error: 'Method not allowed' });
    }

    try {
        const supabaseUrl = process.env.SUPABASE_URL;
        const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
        const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET;

        if (!supabaseUrl || !supabaseServiceKey || !webhookSecret) {
            console.error('Missing environment variables for Stripe webhook');
            return res.status(500).json({ error: 'Server configuration error' });
        }

        // Read raw body from stream (body parser disabled for signature verification)
        const chunks: Buffer[] = [];
        for await (const chunk of req) {
            chunks.push(typeof chunk === 'string' ? Buffer.from(chunk) : chunk);
        }
        const rawBody = Buffer.concat(chunks).toString('utf8');
        const signature = req.headers['stripe-signature'] as string;

        if (!signature || !verifyStripeSignature(rawBody, signature, webhookSecret)) {
            console.error('Stripe webhook signature verification failed');
            return res.status(401).json({ error: 'Invalid signature' });
        }

        let event: any;
        try {
            event = JSON.parse(rawBody);
        } catch {
            return res.status(400).json({ error: 'Invalid JSON body' });
        }
        const supabase = createClient(supabaseUrl, supabaseServiceKey);

        console.log(`[Stripe Webhook] Event: ${event.type}, ID: ${event.id}`);

        // Deduplication: skip if we've already processed this exact Stripe event
        const { data: existing } = await supabase
            .from('billing_events')
            .select('id')
            .eq('stripe_event_id', event.id)
            .maybeSingle();
        if (existing) {
            console.log(`[Stripe Webhook] Duplicate event ${event.id}, skipping`);
            return res.status(200).json({ received: true, duplicate: true });
        }

        // Log the billing event
        const logEvent = async (orgId: string | null, amountCents?: number) => {
            const { error: logErr } = await supabase.from('billing_events').insert({
                org_id: orgId,
                event_type: event.type,
                stripe_event_id: event.id,
                amount_cents: amountCents,
                metadata: { object_id: event.data?.object?.id },
            });
            if (logErr) console.error('[Stripe Webhook] Failed to log billing event:', logErr);
        };

        switch (event.type) {
            case 'checkout.session.completed': {
                const session = event.data.object;
                if (session.mode !== 'subscription') break;

                const orgId = session.metadata?.org_id;
                if (!orgId) {
                    console.warn('[Stripe Webhook] No org_id in session metadata');
                    break;
                }

                // Update or create tenant subscription
                const { error: upsertErr } = await supabase.from('tenant_subscriptions').upsert({
                    org_id: orgId,
                    plan_id: session.metadata?.plan_id,
                    status: 'active',
                    billing_period: session.metadata?.billing_period || 'monthly',
                    stripe_customer_id: session.customer,
                    stripe_subscription_id: session.subscription,
                    current_period_start: session.created ? new Date(session.created * 1000).toISOString() : new Date().toISOString(),
                }, { onConflict: 'org_id' });
                if (upsertErr) console.error('[Stripe Webhook] Subscription upsert failed:', upsertErr);

                await logEvent(orgId, session.amount_total);
                console.log(`[Stripe Webhook] Subscription created for org ${orgId}`);
                break;
            }

            case 'customer.subscription.updated': {
                const sub = event.data.object;
                const { data: updatedSub } = await supabase
                    .from('tenant_subscriptions')
                    .select('org_id')
                    .eq('stripe_subscription_id', sub.id)
                    .single();

                if (updatedSub) {
                    await supabase.from('tenant_subscriptions').update({
                        status: sub.status === 'active' ? 'active'
                            : sub.status === 'past_due' ? 'past_due'
                            : sub.status === 'trialing' ? 'trialing'
                            : 'canceled',
                        cancel_at_period_end: sub.cancel_at_period_end,
                        current_period_start: new Date(sub.current_period_start * 1000).toISOString(),
                        current_period_end: new Date(sub.current_period_end * 1000).toISOString(),
                    }).eq('stripe_subscription_id', sub.id);

                    await logEvent(updatedSub.org_id);
                    console.log(`[Stripe Webhook] Subscription updated for org ${updatedSub.org_id}: ${sub.status}`);
                }
                break;
            }

            case 'customer.subscription.deleted': {
                const sub = event.data.object;
                const { data: deletedSub } = await supabase
                    .from('tenant_subscriptions')
                    .select('org_id')
                    .eq('stripe_subscription_id', sub.id)
                    .single();

                if (deletedSub) {
                    await supabase.from('tenant_subscriptions').update({
                        status: 'canceled',
                    }).eq('stripe_subscription_id', sub.id);

                    await logEvent(deletedSub.org_id);
                    console.log(`[Stripe Webhook] Subscription canceled for org ${deletedSub.org_id}`);
                }
                break;
            }

            case 'invoice.payment_succeeded': {
                const invoice = event.data.object;
                const subId = invoice.subscription;
                if (!subId) break;

                const { data: paidSub } = await supabase
                    .from('tenant_subscriptions')
                    .select('org_id')
                    .eq('stripe_subscription_id', subId)
                    .single();

                if (paidSub) {
                    await supabase.from('tenant_subscriptions').update({
                        status: 'active',
                    }).eq('stripe_subscription_id', subId);

                    await logEvent(paidSub.org_id, invoice.amount_paid);
                    console.log(`[Stripe Webhook] Payment succeeded for org ${paidSub.org_id}: $${(invoice.amount_paid / 100).toFixed(2)}`);
                }
                break;
            }

            case 'invoice.payment_failed': {
                const invoice = event.data.object;
                const subId = invoice.subscription;
                if (!subId) break;

                const { data: failedSub } = await supabase
                    .from('tenant_subscriptions')
                    .select('org_id')
                    .eq('stripe_subscription_id', subId)
                    .single();

                if (failedSub) {
                    await supabase.from('tenant_subscriptions').update({
                        status: 'past_due',
                    }).eq('stripe_subscription_id', subId);

                    await logEvent(failedSub.org_id, invoice.amount_due);
                    console.log(`[Stripe Webhook] Payment FAILED for org ${failedSub.org_id}`);
                }
                break;
            }

            default:
                console.log(`[Stripe Webhook] Unhandled event type: ${event.type}`);
        }

        return res.status(200).json({ received: true });

    } catch (error: any) {
        console.error('[Stripe Webhook] Unhandled error:', error);
        return res.status(500).json({ error: 'Internal server error' });
    }
}
