import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

/**
 * stripe-webhook — Handles Stripe webhook events.
 *
 * NO auth required — Stripe calls this directly.
 * Verifies webhook signature using STRIPE_WEBHOOK_SECRET.
 *
 * Events handled:
 *   - checkout.session.completed: marks order as paid, sends thank-you email
 */

const RESEND_URL = "https://api.resend.com/emails";

function getResendKey(): string {
    return Deno.env.get("RESEND_API_KEY") || "";
}

function escapeHtml(str: string): string {
    return str
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;")
        .replace(/'/g, "&#039;");
}

/** Verify Stripe webhook signature (HMAC-SHA256) */
async function verifyStripeSignature(
    payload: string,
    sigHeader: string,
    secret: string,
): Promise<boolean> {
    try {
        const parts = sigHeader.split(",").reduce(
            (acc, part) => {
                const [key, value] = part.split("=");
                if (key === "t") acc.timestamp = value;
                if (key === "v1") acc.signatures.push(value);
                return acc;
            },
            { timestamp: "", signatures: [] as string[] },
        );

        if (!parts.timestamp || parts.signatures.length === 0) return false;

        // Stripe tolerance: reject if timestamp is older than 5 minutes
        const tolerance = 300; // 5 minutes
        const nowSec = Math.floor(Date.now() / 1000);
        if (Math.abs(nowSec - Number(parts.timestamp)) > tolerance) {
            console.warn("[stripe-webhook] Timestamp outside tolerance");
            return false;
        }

        const signedPayload = `${parts.timestamp}.${payload}`;
        const encoder = new TextEncoder();
        const key = await crypto.subtle.importKey(
            "raw",
            encoder.encode(secret),
            { name: "HMAC", hash: "SHA-256" },
            false,
            ["sign"],
        );
        const signatureBytes = await crypto.subtle.sign(
            "HMAC",
            key,
            encoder.encode(signedPayload),
        );
        const expectedSig = Array.from(new Uint8Array(signatureBytes))
            .map((b) => b.toString(16).padStart(2, "0"))
            .join("");

        return parts.signatures.some((sig) => sig === expectedSig);
    } catch (err) {
        console.error("[stripe-webhook] Signature verification error:", err);
        return false;
    }
}

/** Build thank-you email HTML */
function buildThankYouEmail(params: {
    customer_name: string;
    order_id: string;
    total_amount: number;
}): string {
    const { customer_name, order_id, total_amount } = params;
    const shortId = order_id.slice(0, 8);

    return `<!DOCTYPE html>
<html>
<head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Payment Received</title>
</head>
<body style="margin: 0; padding: 0; background-color: #0a0a0a; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;">
    <table width="100%" cellpadding="0" cellspacing="0" style="background-color: #0a0a0a; padding: 40px 20px;">
        <tr>
            <td align="center">
                <table width="600" cellpadding="0" cellspacing="0" style="background-color: #111827; border-radius: 12px; overflow: hidden; box-shadow: 0 4px 24px rgba(0,0,0,0.4);">
                    <!-- Header -->
                    <tr>
                        <td style="background-color: #111827; padding: 28px 40px; text-align: center; border-bottom: 3px solid #22C55E;">
                            <img src="https://pureuspeptide.com/logo-horizontal.png" alt="Next Gen Research Labs" style="max-width: 220px; height: auto;" />
                        </td>
                    </tr>

                    <!-- Body -->
                    <tr>
                        <td style="padding: 40px; text-align: center;">
                            <!-- Green checkmark circle -->
                            <div style="width: 72px; height: 72px; border-radius: 50%; background-color: rgba(34, 197, 94, 0.15); display: inline-flex; align-items: center; justify-content: center; margin-bottom: 24px;">
                                <div style="width: 72px; height: 72px; border-radius: 50%; background-color: rgba(34, 197, 94, 0.15); text-align: center; line-height: 72px; font-size: 36px;">
                                    &#10003;
                                </div>
                            </div>

                            <h1 style="margin: 0 0 8px; font-size: 24px; color: #22C55E; font-weight: 700;">
                                Payment Received!
                            </h1>
                            <p style="margin: 0 0 24px; font-size: 16px; color: #d1d5db;">
                                Hi ${escapeHtml(customer_name || "there")}, thank you for your payment.
                            </p>

                            <div style="background-color: #1a2332; border: 1px solid #1f2937; border-radius: 8px; padding: 20px; margin-bottom: 24px; text-align: left;">
                                <table width="100%" cellpadding="0" cellspacing="0">
                                    <tr>
                                        <td style="font-size: 13px; color: #6b7280; padding-bottom: 8px;">Order</td>
                                        <td style="font-size: 14px; color: #f9fafb; font-weight: 600; text-align: right; padding-bottom: 8px;">#${shortId}</td>
                                    </tr>
                                    <tr>
                                        <td style="font-size: 13px; color: #6b7280;">Amount Paid</td>
                                        <td style="font-size: 18px; color: #22C55E; font-weight: 700; text-align: right;">$${total_amount.toFixed(2)}</td>
                                    </tr>
                                </table>
                            </div>

                            <p style="margin: 0 0 16px; font-size: 14px; color: #9ca3af; line-height: 1.6;">
                                Your order is now being processed and will be shipped within 1-2 business days. You'll receive tracking information via <a href="https://www.pirateship.com" style="color: #38BDF8; text-decoration: none;">Pirate Ship</a> once shipped.
                            </p>

                            <hr style="border: none; border-top: 1px solid #1f2937; margin: 24px 0;" />

                            <p style="margin: 0; font-size: 13px; color: #9ca3af; line-height: 1.6;">
                                <strong style="color: #d1d5db;">Questions?</strong> Email <a href="mailto:admin@nextgenresearchlabs.com" style="color: #38BDF8; text-decoration: none;">admin@nextgenresearchlabs.com</a> or text <a href="sms:+15615587020" style="color: #38BDF8; text-decoration: none;">(561) 558-7020</a>
                            </p>
                        </td>
                    </tr>

                    <!-- Footer -->
                    <tr>
                        <td style="background-color: #0d1117; padding: 20px 40px; text-align: center; border-top: 1px solid #1f2937;">
                            <p style="margin: 0; font-size: 12px; color: #6b7280;">
                                Next Gen Research Labs LLC &mdash; For research use only.
                            </p>
                        </td>
                    </tr>
                </table>
            </td>
        </tr>
    </table>
</body>
</html>`;
}

Deno.serve(async (req) => {
    // Stripe webhooks only use POST
    if (req.method !== "POST") {
        return new Response("Method not allowed", { status: 405 });
    }

    const webhookSecret = Deno.env.get("STRIPE_WEBHOOK_SECRET");
    const sbUrl = Deno.env.get("SUPABASE_URL");
    const sbServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");

    if (!sbUrl || !sbServiceKey) {
        console.error("[stripe-webhook] Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY");
        return new Response("Server misconfigured", { status: 500 });
    }

    const payload = await req.text();

    // Verify webhook signature if secret is configured
    if (webhookSecret) {
        const sigHeader = req.headers.get("stripe-signature") || "";
        const valid = await verifyStripeSignature(payload, sigHeader, webhookSecret);
        if (!valid) {
            console.error("[stripe-webhook] Invalid signature");
            return new Response("Invalid signature", { status: 400 });
        }
    } else {
        console.warn("[stripe-webhook] No STRIPE_WEBHOOK_SECRET set — skipping signature verification");
    }

    let event;
    try {
        event = JSON.parse(payload);
    } catch {
        return new Response("Invalid JSON", { status: 400 });
    }

    console.log(`[stripe-webhook] Received event: ${event.type} (${event.id})`);

    if (event.type === "checkout.session.completed") {
        const session = event.data.object;
        const salesOrderId = session.metadata?.sales_order_id;
        const customerEmail = session.metadata?.customer_email;
        const orgId = session.metadata?.org_id;
        const amountTotal = (session.amount_total || 0) / 100; // Stripe sends cents

        if (!salesOrderId) {
            console.error("[stripe-webhook] No sales_order_id in metadata");
            return new Response("Missing metadata", { status: 400 });
        }

        const supabase = createClient(sbUrl, sbServiceKey);

        // Update order: payment_status → 'paid'
        const { error: updateError } = await supabase
            .from("sales_orders")
            .update({
                payment_status: "paid",
                status: "confirmed",
            })
            .eq("id", salesOrderId);

        if (updateError) {
            console.error("[stripe-webhook] Failed to update order:", updateError.message);
            return new Response("DB update failed", { status: 500 });
        }

        console.log(`[stripe-webhook] Order ${salesOrderId} marked as paid`);

        // Send thank-you email
        const resendKey = getResendKey();
        if (resendKey && customerEmail) {
            // Fetch customer name
            let customerName = "";
            if (orgId) {
                const { data: contact } = await supabase
                    .from("contacts")
                    .select("name")
                    .eq("email", customerEmail)
                    .eq("org_id", orgId)
                    .maybeSingle();
                customerName = contact?.name || "";
            }

            const html = buildThankYouEmail({
                customer_name: customerName,
                order_id: salesOrderId,
                total_amount: amountTotal,
            });

            const emailRes = await fetch(RESEND_URL, {
                method: "POST",
                headers: {
                    "Content-Type": "application/json",
                    Authorization: `Bearer ${resendKey}`,
                },
                body: JSON.stringify({
                    from: "Next Gen Research Labs <admin@nextgenresearchlabs.com>",
                    to: [customerEmail],
                    subject: `Payment Received — Order #${salesOrderId.slice(0, 8)}`,
                    html,
                }),
            });

            if (!emailRes.ok) {
                const errText = await emailRes.text();
                console.error("[stripe-webhook] Thank-you email failed:", emailRes.status, errText);
            } else {
                console.log(`[stripe-webhook] Thank-you email sent to ${customerEmail}`);
            }
        }
    }

    // Always return 200 to Stripe to prevent retries
    return new Response(JSON.stringify({ received: true }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
    });
});
