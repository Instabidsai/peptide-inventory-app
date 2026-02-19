/**
 * Stripe Payment Provider
 * Implements the PaymentProvider interface for Stripe.
 * Used when a tenant configures Stripe as their payment processor.
 */

import type { PaymentProvider, CheckoutSessionRequest, CheckoutSessionResponse, WebhookEvent } from './provider';
import crypto from 'crypto';

const STRIPE_API_BASE = 'https://api.stripe.com/v1';
const STRIPE_SUCCESS = ['complete', 'paid'];
const STRIPE_FAILURE = ['expired', 'canceled', 'unpaid'];

export class StripeProvider implements PaymentProvider {
    name = 'stripe';
    private secretKey: string;
    private webhookSecret: string;

    constructor(secretKey: string, webhookSecret: string) {
        this.secretKey = secretKey;
        this.webhookSecret = webhookSecret;
    }

    async createCheckoutSession(req: CheckoutSessionRequest): Promise<CheckoutSessionResponse> {
        const lineItems = req.items.map(item => ({
            price_data: {
                currency: 'usd',
                product_data: { name: item.name },
                unit_amount: Math.round(item.unitPrice * 100),
            },
            quantity: item.quantity,
        }));

        const params = new URLSearchParams();
        params.append('mode', 'payment');
        params.append('success_url', req.successUrl);
        params.append('cancel_url', req.cancelUrl);
        params.append('client_reference_id', req.orderId);
        params.append('customer_email', req.clientEmail);
        params.append('metadata[order_id]', req.orderId);
        params.append('metadata[client_name]', req.clientName);

        lineItems.forEach((item, i) => {
            params.append(`line_items[${i}][price_data][currency]`, 'usd');
            params.append(`line_items[${i}][price_data][product_data][name]`, item.price_data.product_data.name);
            params.append(`line_items[${i}][price_data][unit_amount]`, String(item.price_data.unit_amount));
            params.append(`line_items[${i}][quantity]`, String(item.quantity));
        });

        const response = await fetch(`${STRIPE_API_BASE}/checkout/sessions`, {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${this.secretKey}`,
                'Content-Type': 'application/x-www-form-urlencoded',
            },
            body: params.toString(),
        });

        if (!response.ok) {
            const errorBody = await response.text();
            throw new Error(`Stripe API error ${response.status}: ${errorBody}`);
        }

        const data = await response.json();
        return {
            checkoutUrl: data.url,
            sessionId: data.id,
        };
    }

    verifyAndParseWebhook(rawBody: string, headers: Record<string, string>): WebhookEvent | null {
        const signature = headers['stripe-signature'];
        if (!signature) return null;

        // Parse the Stripe-Signature header
        const elements = signature.split(',').reduce<Record<string, string>>((acc, part) => {
            const [key, value] = part.split('=');
            acc[key.trim()] = value;
            return acc;
        }, {});

        const timestamp = elements['t'];
        const v1Sig = elements['v1'];
        if (!timestamp || !v1Sig) return null;

        // Replay protection: 5 minute window
        const now = Math.floor(Date.now() / 1000);
        if (Math.abs(now - parseInt(timestamp, 10)) > 300) return null;

        // Verify HMAC-SHA256
        const signedPayload = `${timestamp}.${rawBody}`;
        const expected = crypto
            .createHmac('sha256', this.webhookSecret)
            .update(signedPayload)
            .digest('hex');

        if (expected !== v1Sig) return null;

        const event = JSON.parse(rawBody);
        const obj = event.data?.object || {};

        return {
            eventType: event.type || '',
            status: (obj.payment_status || obj.status || '').toLowerCase(),
            externalId: obj.client_reference_id || obj.metadata?.order_id || '',
            transactionId: obj.payment_intent || obj.id || '',
            amountCents: obj.amount_total,
            raw: event,
        };
    }

    isSuccess(status: string): boolean {
        return STRIPE_SUCCESS.includes(status.toLowerCase());
    }

    isFailure(status: string): boolean {
        return STRIPE_FAILURE.includes(status.toLowerCase());
    }
}
