/**
 * Payment Provider Abstraction Layer
 * Allows swapping PsiFi, Stripe, or any processor per tenant.
 *
 * Usage:
 *   const provider = getPaymentProvider();
 *   const session = await provider.createCheckoutSession({ ... });
 */

export interface CheckoutSessionRequest {
    orderId: string;
    totalCents: number;
    successUrl: string;
    cancelUrl: string;
    clientName: string;
    clientEmail: string;
    items: Array<{ name: string; quantity: number; unitPrice: number }>;
}

export interface CheckoutSessionResponse {
    checkoutUrl: string;
    sessionId: string;
}

export interface WebhookEvent {
    eventType: string;
    status: string;
    externalId: string;
    transactionId: string;
    amountCents?: number;
    raw: unknown;
}

export interface PaymentProvider {
    name: string;

    /** Create a checkout session and return the redirect URL */
    createCheckoutSession(req: CheckoutSessionRequest): Promise<CheckoutSessionResponse>;

    /** Verify webhook signature and parse event. Returns null if invalid. */
    verifyAndParseWebhook(rawBody: string, headers: Record<string, string>): WebhookEvent | null;

    /** Is this a terminal success status? */
    isSuccess(status: string): boolean;

    /** Is this a terminal failure status? */
    isFailure(status: string): boolean;
}

// ── PsiFi Implementation ────────────────────────────────────────

import crypto from 'crypto';

const PSIFI_API_BASE = 'https://api.psifi.app/api/v2';
const PSIFI_SUCCESS = ['complete', 'completed'];
const PSIFI_FAILURE = ['failed', 'cancelled', 'expired', 'refunded'];

export class PsiFiProvider implements PaymentProvider {
    name = 'psifi';
    private apiKey: string;
    private webhookSecret: string;

    constructor(apiKey: string, webhookSecret: string) {
        this.apiKey = apiKey;
        this.webhookSecret = webhookSecret;
    }

    async createCheckoutSession(req: CheckoutSessionRequest): Promise<CheckoutSessionResponse> {
        const payload = {
            mode: 'payment',
            total_amount: req.totalCents,
            external_id: req.orderId,
            success_url: req.successUrl,
            cancel_url: req.cancelUrl,
            payment_method: 'card',
            metadata: {
                client_name: req.clientName,
                client_email: req.clientEmail,
                item_count: req.items.length,
                items: req.items,
            },
        };

        const response = await fetch(`${PSIFI_API_BASE}/checkout-sessions`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'x-api-key': this.apiKey,
                'Idempotency-Key': req.orderId,
            },
            body: JSON.stringify(payload),
        });

        if (!response.ok) {
            const errorBody = await response.text();
            throw new Error(`PsiFi API error ${response.status}: ${errorBody}`);
        }

        const data = await response.json();
        return {
            checkoutUrl: data.url,
            sessionId: data.id || data.session_id,
        };
    }

    verifyAndParseWebhook(rawBody: string, headers: Record<string, string>): WebhookEvent | null {
        const svixId = headers['svix-id'];
        const svixTimestamp = headers['svix-timestamp'];
        const svixSignature = headers['svix-signature'];

        if (!svixId || !svixTimestamp || !svixSignature) return null;

        // Replay protection: 5 minute window
        const now = Math.floor(Date.now() / 1000);
        if (Math.abs(now - parseInt(svixTimestamp, 10)) > 300) return null;

        // Verify HMAC
        const toSign = `${svixId}.${svixTimestamp}.${rawBody}`;
        const secretBytes = Buffer.from(
            this.webhookSecret.startsWith('whsec_') ? this.webhookSecret.slice(6) : this.webhookSecret,
            'base64'
        );
        const expected = crypto.createHmac('sha256', secretBytes).update(toSign).digest('base64');

        const sigList = svixSignature.split(' ');
        const valid = sigList.some(sig => {
            const [version, value] = sig.split(',');
            return version === 'v1' && value === expected;
        });

        if (!valid) return null;

        const event = JSON.parse(rawBody);
        return {
            eventType: event.event || event.type || '',
            status: (event.status || event.order?.status || '').toLowerCase(),
            externalId: event.order?.externalId || event.external_id || event.metadata?.external_id || '',
            transactionId: event.order_id || event.transaction_id || event.id || '',
            amountCents: event.order?.totalAmount,
            raw: event,
        };
    }

    isSuccess(status: string): boolean {
        return PSIFI_SUCCESS.includes(status.toLowerCase());
    }

    isFailure(status: string): boolean {
        return PSIFI_FAILURE.includes(status.toLowerCase());
    }
}

// ── Factory ─────────────────────────────────────────────────────

/**
 * Returns the configured payment provider.
 * Currently always returns PsiFi. To add Stripe:
 *   1. Create a StripeProvider class implementing PaymentProvider
 *   2. Check tenant config or env var to pick the provider
 */
export function getPaymentProvider(): PaymentProvider {
    const apiKey = process.env.PSIFI_API_KEY;
    const webhookSecret = process.env.PSIFI_WEBHOOK_SECRET;

    if (!apiKey || !webhookSecret) {
        throw new Error('Payment provider not configured: missing PSIFI_API_KEY or PSIFI_WEBHOOK_SECRET');
    }

    return new PsiFiProvider(apiKey, webhookSecret);
}
