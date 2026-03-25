import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { getCorsHeaders, handleCors, jsonResponse } from "../_shared/cors.ts";
import { authenticateRequest, AuthError } from "../_shared/auth.ts";

/**
 * stripe-checkout — Creates a Stripe Checkout Session and sends a branded "Pay Now" email.
 *
 * POST body: { sales_order_id, customer_email, amount, org_id }
 *
 * CRITICAL: Never send peptide names, "peptide", "Pure U.S. Peptides", "pureuspeptide",
 * or "thepeptideai" to Stripe. Use generic "Research Materials Order" naming.
 */

const STRIPE_API = "https://api.stripe.com/v1";
const RESEND_URL = "https://api.resend.com/emails";

function getStripeKey(): string {
    return Deno.env.get("STRIPE_SECRET_KEY") || "";
}

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

/** Build branded "Pay Now" email HTML */
function buildPayNowEmail(params: {
    customer_name: string;
    order_id: string;
    total_amount: number;
    items: Array<{ name: string; quantity: number; unit_price: number }>;
    shipping_address: string;
    checkout_url: string;
}): string {
    const { customer_name, order_id, total_amount, items, shipping_address, checkout_url } = params;
    const shortId = order_id.slice(0, 8);

    const itemRows = items
        .map(
            (item) => `
            <tr>
                <td style="padding: 10px 12px; border-bottom: 1px solid #1f2937; font-size: 14px; color: #d1d5db;">
                    ${escapeHtml(item.name)}
                </td>
                <td style="padding: 10px 12px; border-bottom: 1px solid #1f2937; font-size: 14px; color: #d1d5db; text-align: center;">
                    ${item.quantity}
                </td>
                <td style="padding: 10px 12px; border-bottom: 1px solid #1f2937; font-size: 14px; color: #d1d5db; text-align: right;">
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
<body style="margin: 0; padding: 0; background-color: #0a0a0a; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;">
    <table width="100%" cellpadding="0" cellspacing="0" style="background-color: #0a0a0a; padding: 40px 20px;">
        <tr>
            <td align="center">
                <table width="600" cellpadding="0" cellspacing="0" style="background-color: #111827; border-radius: 12px; overflow: hidden; box-shadow: 0 4px 24px rgba(0,0,0,0.4);">
                    <!-- Header -->
                    <tr>
                        <td style="background-color: #111827; padding: 28px 40px; text-align: center; border-bottom: 3px solid #E85D2A;">
                            <img src="https://pureuspeptide.com/logo-horizontal.png" alt="Next Gen Research Labs" style="max-width: 220px; height: auto;" />
                        </td>
                    </tr>

                    <!-- Body -->
                    <tr>
                        <td style="padding: 40px;">
                            <p style="margin: 0 0 8px; font-size: 18px; color: #f9fafb; font-weight: 600;">
                                Hi ${escapeHtml(customer_name || "there")},
                            </p>
                            <p style="margin: 0 0 24px; font-size: 14px; color: #9ca3af; line-height: 1.6;">
                                Your order is ready for payment. Click the button below to pay securely with your credit or debit card.
                            </p>

                            <!-- Order Summary -->
                            <table width="100%" cellpadding="0" cellspacing="0" style="border: 1px solid #1f2937; border-radius: 8px; overflow: hidden; margin-bottom: 24px;">
                                <tr>
                                    <td colspan="3" style="background-color: #1a2332; padding: 12px 12px; font-size: 13px; font-weight: 600; color: #f9fafb; border-bottom: 1px solid #1f2937;">
                                        Order #${shortId}
                                    </td>
                                </tr>
                                <tr style="background-color: #1a2332;">
                                    <td style="padding: 8px 12px; font-size: 12px; font-weight: 600; color: #6b7280; border-bottom: 1px solid #1f2937;">Item</td>
                                    <td style="padding: 8px 12px; font-size: 12px; font-weight: 600; color: #6b7280; text-align: center; border-bottom: 1px solid #1f2937;">Qty</td>
                                    <td style="padding: 8px 12px; font-size: 12px; font-weight: 600; color: #6b7280; text-align: right; border-bottom: 1px solid #1f2937;">Amount</td>
                                </tr>
                                ${itemRows}
                                <tr>
                                    <td colspan="2" style="padding: 14px 12px; font-size: 18px; font-weight: 700; color: #f9fafb;">
                                        Total
                                    </td>
                                    <td style="padding: 14px 12px; font-size: 18px; font-weight: 700; color: #E85D2A; text-align: right;">
                                        $${total_amount.toFixed(2)}
                                    </td>
                                </tr>
                            </table>

                            ${shipping_address ? `
                            <div style="background-color: #1a2332; border: 1px solid #1f2937; border-radius: 8px; padding: 14px; margin-bottom: 24px;">
                                <p style="margin: 0 0 4px; font-size: 12px; font-weight: 600; color: #6b7280; text-transform: uppercase; letter-spacing: 0.5px;">Shipping To</p>
                                <p style="margin: 0; font-size: 14px; color: #d1d5db; line-height: 1.5;">${escapeHtml(shipping_address)}</p>
                            </div>` : ""}

                            <!-- Pay Button -->
                            <table width="100%" cellpadding="0" cellspacing="0">
                                <tr>
                                    <td align="center" style="padding: 8px 0 24px;">
                                        <a href="${escapeHtml(checkout_url)}"
                                           target="_blank"
                                           style="display: inline-block; background-color: #E85D2A; color: #ffffff; text-decoration: none; padding: 16px 48px; border-radius: 8px; font-size: 16px; font-weight: 700; letter-spacing: 0.5px;">
                                            Pay with Credit Card
                                        </a>
                                    </td>
                                </tr>
                            </table>

                            <p style="margin: 0 0 16px; font-size: 13px; color: #6b7280; text-align: center; line-height: 1.5;">
                                This is a secure payment link powered by Stripe. Your card information is never stored on our servers.
                            </p>

                            <hr style="border: none; border-top: 1px solid #1f2937; margin: 24px 0;" />

                            <div style="font-size: 13px; color: #9ca3af; line-height: 1.6;">
                                <p style="margin: 0 0 8px;">
                                    <strong style="color: #d1d5db;">Shipping:</strong> Orders are typically shipped within 1-2 business days after payment confirmation. Tracking info will be provided via <a href="https://www.pirateship.com" style="color: #38BDF8; text-decoration: none;">Pirate Ship</a>.
                                </p>
                                <p style="margin: 0;">
                                    <strong style="color: #d1d5db;">Questions?</strong> Email <a href="mailto:admin@nextgenresearchlabs.com" style="color: #38BDF8; text-decoration: none;">admin@nextgenresearchlabs.com</a> or text <a href="sms:+15615587020" style="color: #38BDF8; text-decoration: none;">(561) 558-7020</a>
                                </p>
                            </div>
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
    const corsHeaders = getCorsHeaders(req);
    const preflight = handleCors(req);
    if (preflight) return preflight;

    if (req.method !== "POST") {
        return jsonResponse({ error: "Method not allowed" }, 405, corsHeaders);
    }

    try {
        // Authenticate the request
        const { user, orgId, supabase } = await authenticateRequest(req);

        const body = await req.json();
        const { sales_order_id, customer_email, amount, org_id } = body;

        // Validate required fields
        if (!sales_order_id || !customer_email || !amount) {
            return jsonResponse(
                { error: "sales_order_id, customer_email, and amount are required" },
                400,
                corsHeaders,
            );
        }

        // Basic email validation
        if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(customer_email)) {
            return jsonResponse({ error: "Invalid email address" }, 400, corsHeaders);
        }

        const stripeKey = getStripeKey();
        if (!stripeKey) {
            console.error("[stripe-checkout] No STRIPE_SECRET_KEY configured");
            return jsonResponse({ error: "Payment service not configured" }, 500, corsHeaders);
        }

        // Fetch order items for the email
        const { data: orderItems } = await supabase
            .from("sales_order_items")
            .select("peptide_id, quantity, unit_price, peptides(name)")
            .eq("sales_order_id", sales_order_id);

        const itemCount = orderItems?.length || 0;
        const totalAmount = Number(amount);
        const shortOrderId = sales_order_id.slice(0, 8);

        // Fetch shipping address from the order
        const { data: orderData } = await supabase
            .from("sales_orders")
            .select("shipping_address")
            .eq("id", sales_order_id)
            .eq("org_id", org_id || orgId)
            .single();

        // Create Stripe Checkout Session via raw fetch
        // CRITICAL: No peptide names in Stripe — use generic naming
        const checkoutParams = new URLSearchParams();
        checkoutParams.append("mode", "payment");
        checkoutParams.append("payment_method_types[0]", "card");
        checkoutParams.append("line_items[0][price_data][currency]", "usd");
        checkoutParams.append("line_items[0][price_data][product_data][name]", `Order #${shortOrderId} — Research Materials`);
        checkoutParams.append("line_items[0][price_data][product_data][description]", `${itemCount} item${itemCount !== 1 ? "s" : ""}`);
        checkoutParams.append("line_items[0][price_data][unit_amount]", String(Math.round(totalAmount * 100)));
        checkoutParams.append("line_items[0][quantity]", "1");
        checkoutParams.append("customer_email", customer_email);
        checkoutParams.append("metadata[sales_order_id]", sales_order_id);
        checkoutParams.append("metadata[customer_email]", customer_email);
        checkoutParams.append("metadata[org_id]", org_id || orgId);
        checkoutParams.append("success_url", `https://nextgenresearchlabs.com/order-complete?ref=${sales_order_id}`);
        checkoutParams.append("cancel_url", "https://nextgenresearchlabs.com");

        const stripeRes = await fetch(`${STRIPE_API}/checkout/sessions`, {
            method: "POST",
            headers: {
                "Authorization": `Bearer ${stripeKey}`,
                "Content-Type": "application/x-www-form-urlencoded",
            },
            body: checkoutParams.toString(),
        });

        if (!stripeRes.ok) {
            const errText = await stripeRes.text();
            console.error("[stripe-checkout] Stripe error:", stripeRes.status, errText);
            return jsonResponse(
                { error: "Failed to create checkout session", detail: errText },
                502,
                corsHeaders,
            );
        }

        const session = await stripeRes.json();
        const checkoutUrl = session.url;

        console.log(`[stripe-checkout] Created session ${session.id} for order ${sales_order_id}`);

        // Update the order with the Stripe session ID
        await supabase
            .from("sales_orders")
            .update({ payment_method: "credit_card", notes: `Stripe session: ${session.id}` })
            .eq("id", sales_order_id)
            .eq("org_id", org_id || orgId);

        // Send branded "Pay Now" email via Resend
        const resendKey = getResendKey();
        if (resendKey) {
            const emailItems = (orderItems || []).map((item: any) => ({
                name: item.peptides?.name || "Research Material",
                quantity: item.quantity || 1,
                unit_price: Number(item.unit_price) || 0,
            }));

            // Fetch customer name
            const { data: contact } = await supabase
                .from("contacts")
                .select("name")
                .eq("email", customer_email)
                .eq("org_id", org_id || orgId)
                .maybeSingle();

            const html = buildPayNowEmail({
                customer_name: contact?.name || "",
                order_id: sales_order_id,
                total_amount: totalAmount,
                items: emailItems,
                shipping_address: orderData?.shipping_address || "",
                checkout_url: checkoutUrl,
            });

            const emailRes = await fetch(RESEND_URL, {
                method: "POST",
                headers: {
                    "Content-Type": "application/json",
                    Authorization: `Bearer ${resendKey}`,
                },
                body: JSON.stringify({
                    from: "Next Gen Research Labs <admin@nextgenresearchlabs.com>",
                    to: [customer_email],
                    subject: `Complete Your Payment — Order #${shortOrderId}`,
                    html,
                }),
            });

            if (!emailRes.ok) {
                const errText = await emailRes.text();
                console.error("[stripe-checkout] Email send failed:", emailRes.status, errText);
                // Don't fail the whole request — checkout URL was still created
            } else {
                console.log(`[stripe-checkout] Pay Now email sent to ${customer_email}`);
            }
        } else {
            console.warn("[stripe-checkout] No RESEND_API_KEY — skipping email");
        }

        return jsonResponse(
            { checkout_url: checkoutUrl, session_id: session.id },
            200,
            corsHeaders,
        );
    } catch (err) {
        if (err instanceof AuthError) {
            return jsonResponse({ error: err.message }, err.status, corsHeaders);
        }
        console.error("[stripe-checkout] Error:", err);
        return jsonResponse({ error: "Internal server error" }, 500, corsHeaders);
    }
});
