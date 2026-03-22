import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { getCorsHeaders, handleCors, jsonResponse } from "../_shared/cors.ts";

/**
 * send-payment-email — Supabase Edge Function
 *
 * Sends a branded email with a Stripe payment link to the customer.
 * Called from the public /pay/:orderId page — NO auth required.
 *
 * POST body: {
 *   order_id: string,
 *   customer_email: string,
 *   customer_name?: string,
 *   total_amount: number,
 *   order_items: Array<{ name: string; quantity: number; unit_price: number }>,
 *   stripe_link: string,
 *   brand_name?: string,
 * }
 */

const RESEND_URL = "https://api.resend.com/emails";

function getResendKey(): string {
    return Deno.env.get("RESEND_API_KEY") || "re_CpRJ6Shf_4BCNvr1iHeKHrzNcTUnzxiLW";
}

function buildEmailHtml(params: {
    customer_name: string;
    order_id: string;
    total_amount: number;
    order_items: Array<{ name: string; quantity: number; unit_price: number }>;
    stripe_link: string;
    brand_name: string;
}): string {
    const { customer_name, order_id, total_amount, order_items, stripe_link, brand_name } = params;
    const shortId = order_id.slice(0, 8);

    const itemRows = order_items
        .map(
            (item) => `
            <tr>
                <td style="padding: 10px 12px; border-bottom: 1px solid #f0f0f0; font-size: 14px; color: #374151;">
                    ${escapeHtml(item.name)}
                </td>
                <td style="padding: 10px 12px; border-bottom: 1px solid #f0f0f0; font-size: 14px; color: #374151; text-align: center;">
                    ${item.quantity}
                </td>
                <td style="padding: 10px 12px; border-bottom: 1px solid #f0f0f0; font-size: 14px; color: #374151; text-align: right;">
                    $${(item.unit_price * item.quantity).toFixed(2)}
                </td>
            </tr>`
        )
        .join("");

    return `<!DOCTYPE html>
<html>
<head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Complete Your Payment</title>
</head>
<body style="margin: 0; padding: 0; background-color: #f9fafb; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;">
    <table width="100%" cellpadding="0" cellspacing="0" style="background-color: #f9fafb; padding: 40px 20px;">
        <tr>
            <td align="center">
                <table width="600" cellpadding="0" cellspacing="0" style="background-color: #ffffff; border-radius: 12px; overflow: hidden; box-shadow: 0 1px 3px rgba(0,0,0,0.1);">
                    <!-- Header -->
                    <tr>
                        <td style="background: linear-gradient(135deg, #1e40af 0%, #3b82f6 100%); padding: 32px 40px; text-align: center;">
                            <h1 style="margin: 0; color: #ffffff; font-size: 24px; font-weight: 700;">
                                ${escapeHtml(brand_name)}
                            </h1>
                        </td>
                    </tr>

                    <!-- Body -->
                    <tr>
                        <td style="padding: 40px;">
                            <p style="margin: 0 0 8px; font-size: 16px; color: #374151;">
                                Hi ${escapeHtml(customer_name || "there")},
                            </p>
                            <p style="margin: 0 0 24px; font-size: 14px; color: #6b7280; line-height: 1.6;">
                                Your order is ready for payment. Use the secure link below to pay with your credit or debit card.
                            </p>

                            <!-- Order Summary -->
                            <table width="100%" cellpadding="0" cellspacing="0" style="border: 1px solid #e5e7eb; border-radius: 8px; overflow: hidden; margin-bottom: 24px;">
                                <tr>
                                    <td colspan="3" style="background-color: #f9fafb; padding: 12px 12px; font-size: 13px; font-weight: 600; color: #374151; border-bottom: 1px solid #e5e7eb;">
                                        Order #${shortId}
                                    </td>
                                </tr>
                                <tr style="background-color: #f9fafb;">
                                    <td style="padding: 8px 12px; font-size: 12px; font-weight: 600; color: #6b7280; border-bottom: 1px solid #e5e7eb;">Item</td>
                                    <td style="padding: 8px 12px; font-size: 12px; font-weight: 600; color: #6b7280; text-align: center; border-bottom: 1px solid #e5e7eb;">Qty</td>
                                    <td style="padding: 8px 12px; font-size: 12px; font-weight: 600; color: #6b7280; text-align: right; border-bottom: 1px solid #e5e7eb;">Amount</td>
                                </tr>
                                ${itemRows}
                                <tr>
                                    <td colspan="2" style="padding: 12px 12px; font-size: 16px; font-weight: 700; color: #111827;">
                                        Total
                                    </td>
                                    <td style="padding: 12px 12px; font-size: 16px; font-weight: 700; color: #1e40af; text-align: right;">
                                        $${total_amount.toFixed(2)}
                                    </td>
                                </tr>
                            </table>

                            <!-- Pay Button -->
                            <table width="100%" cellpadding="0" cellspacing="0">
                                <tr>
                                    <td align="center" style="padding: 8px 0 24px;">
                                        <a href="${escapeHtml(stripe_link)}"
                                           target="_blank"
                                           style="display: inline-block; background: linear-gradient(135deg, #1e40af 0%, #3b82f6 100%); color: #ffffff; text-decoration: none; padding: 16px 48px; border-radius: 8px; font-size: 16px; font-weight: 700; letter-spacing: 0.5px;">
                                            Pay with Credit Card
                                        </a>
                                    </td>
                                </tr>
                            </table>

                            <p style="margin: 0 0 16px; font-size: 13px; color: #9ca3af; text-align: center; line-height: 1.5;">
                                This is a secure payment link powered by Stripe. Your card information is never stored on our servers.
                            </p>

                            <hr style="border: none; border-top: 1px solid #e5e7eb; margin: 24px 0;" />

                            <p style="margin: 0; font-size: 13px; color: #9ca3af; line-height: 1.5;">
                                <strong>Shipping:</strong> Orders are typically shipped within 1-2 business days after payment confirmation.
                            </p>
                        </td>
                    </tr>

                    <!-- Footer -->
                    <tr>
                        <td style="background-color: #f9fafb; padding: 20px 40px; text-align: center; border-top: 1px solid #e5e7eb;">
                            <p style="margin: 0; font-size: 12px; color: #9ca3af;">
                                ${escapeHtml(brand_name)} &mdash; For research use only.
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

function escapeHtml(str: string): string {
    return str
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;")
        .replace(/'/g, "&#039;");
}

Deno.serve(async (req) => {
    const corsHeaders = getCorsHeaders(req);
    const preflight = handleCors(req);
    if (preflight) return preflight;

    if (req.method !== "POST") {
        return jsonResponse({ error: "Method not allowed" }, 405, corsHeaders);
    }

    try {
        const body = await req.json();
        const {
            order_id,
            customer_email,
            customer_name,
            total_amount,
            order_items,
            stripe_link,
            brand_name,
        } = body;

        // Validate required fields
        if (!order_id || !customer_email || !total_amount || !stripe_link) {
            return jsonResponse(
                { error: "order_id, customer_email, total_amount, and stripe_link are required" },
                400,
                corsHeaders,
            );
        }

        // Basic email validation
        if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(customer_email)) {
            return jsonResponse({ error: "Invalid email address" }, 400, corsHeaders);
        }

        const resendKey = getResendKey();
        if (!resendKey) {
            console.error("[send-payment-email] No RESEND_API_KEY available");
            return jsonResponse({ error: "Email service not configured" }, 500, corsHeaders);
        }

        const html = buildEmailHtml({
            customer_name: customer_name || "",
            order_id,
            total_amount: Number(total_amount),
            order_items: Array.isArray(order_items) ? order_items : [],
            stripe_link,
            brand_name: brand_name || "Pure U.S. Peptides",
        });

        const response = await fetch(RESEND_URL, {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
                Authorization: `Bearer ${resendKey}`,
            },
            body: JSON.stringify({
                from: `${brand_name || "Pure U.S. Peptides"} <admin@nextgenresearchlabs.com>`,
                to: [customer_email],
                subject: `Complete Your Payment — Order #${order_id.slice(0, 8)}`,
                html,
            }),
        });

        if (!response.ok) {
            const errText = await response.text();
            console.error("[send-payment-email] Resend error:", response.status, errText);
            return jsonResponse(
                { error: "Email delivery failed", detail: errText },
                502,
                corsHeaders,
            );
        }

        const result = await response.json();
        console.log(`[send-payment-email] Sent payment email for order ${order_id} to ${customer_email}`);
        return jsonResponse({ sent: true, id: result.id }, 200, corsHeaders);
    } catch (err) {
        console.error("[send-payment-email] Error:", err);
        return jsonResponse({ error: "Internal server error" }, 500, corsHeaders);
    }
});
