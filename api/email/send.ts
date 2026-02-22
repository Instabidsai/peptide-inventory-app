import type { VercelRequest, VercelResponse } from '@vercel/node';
import { createClient } from '@supabase/supabase-js';

/**
 * Transactional Email Sender
 * POST /api/email/send
 * Body: { template, to, data, org_id }
 *
 * Templates: welcome, order_confirmation, shipping_notification, password_reset
 * Uses the tenant's configured SMTP or falls back to platform default.
 */

interface EmailTemplate {
    subject: string;
    html: string;
}

/** Escape HTML to prevent XSS in email templates */
function esc(str: string | undefined | null): string {
    if (!str) return '';
    return String(str)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;');
}

/** Validate URL is http(s) — prevent javascript: protocol injection */
function safeUrl(url: string | undefined | null): string {
    if (!url) return '';
    const trimmed = url.trim();
    if (trimmed.startsWith('https://') || trimmed.startsWith('http://')) return trimmed;
    return '';
}

const VALID_TEMPLATES = ['welcome', 'order_confirmation', 'shipping_notification', 'password_reset'];

function getTemplate(template: string, data: Record<string, any>, branding: { brand_name: string; primary_color: string; support_email: string; logo_url: string }): EmailTemplate {
    const bn = esc(branding.brand_name);
    const pc = esc(branding.primary_color);
    const se = esc(branding.support_email);
    const lu = safeUrl(branding.logo_url);

    const header = `
        <div style="background:${pc};padding:20px;text-align:center">
            ${lu ? `<img src="${lu}" alt="${bn}" style="max-height:50px;margin-bottom:10px" />` : ''}
            <h1 style="color:white;margin:0;font-family:sans-serif">${bn}</h1>
        </div>
    `;

    const footer = `
        <div style="padding:20px;text-align:center;font-size:12px;color:#666;font-family:sans-serif">
            <p>Questions? Contact us at <a href="mailto:${se}">${se}</a></p>
            <p>&copy; ${new Date().getFullYear()} ${bn}. All rights reserved.</p>
        </div>
    `;

    const wrap = (body: string) => `
        <div style="max-width:600px;margin:0 auto;background:#fff;border:1px solid #eee;border-radius:8px;overflow:hidden">
            ${header}
            <div style="padding:24px;font-family:sans-serif;line-height:1.6;color:#333">
                ${body}
            </div>
            ${footer}
        </div>
    `;

    switch (template) {
        case 'welcome':
            return {
                subject: `Welcome to ${branding.brand_name}!`,
                html: wrap(`
                    <h2>Welcome, ${esc(data.name) || 'there'}!</h2>
                    <p>Your account has been created at <strong>${bn}</strong>.</p>
                    <p>You can log in at any time to manage your peptide inventory, place orders, and track your protocol.</p>
                    ${safeUrl(data.login_url) ? `<p style="text-align:center;margin:24px 0"><a href="${safeUrl(data.login_url)}" style="background:${pc};color:white;padding:12px 24px;border-radius:6px;text-decoration:none;font-weight:bold">Log In Now</a></p>` : ''}
                    <p>If you have any questions, reply to this email or reach out to <a href="mailto:${se}">${se}</a>.</p>
                `),
            };

        case 'order_confirmation':
            return {
                subject: `Order Confirmed — #${esc((data.order_id || '').slice(0, 8))}`,
                html: wrap(`
                    <h2>Order Confirmed</h2>
                    <p>Thank you for your order, ${esc(data.client_name) || 'there'}!</p>
                    <p><strong>Order ID:</strong> ${esc(data.order_id)}</p>
                    <p><strong>Total:</strong> $${(Number(data.total_amount) || 0).toFixed(2)}</p>
                    ${data.items?.length ? `
                        <table style="width:100%;border-collapse:collapse;margin:16px 0">
                            <tr style="background:#f5f5f5"><th style="padding:8px;text-align:left">Item</th><th style="padding:8px;text-align:right">Qty</th><th style="padding:8px;text-align:right">Price</th></tr>
                            ${data.items.map((item: any) => `
                                <tr><td style="padding:8px;border-bottom:1px solid #eee">${esc(item.name)}</td><td style="padding:8px;text-align:right;border-bottom:1px solid #eee">${Number(item.quantity) || 0}</td><td style="padding:8px;text-align:right;border-bottom:1px solid #eee">$${(Number(item.unit_price) || 0).toFixed(2)}</td></tr>
                            `).join('')}
                        </table>
                    ` : ''}
                    <p>Most orders ship within 1-2 business days. We'll send you a tracking number when your order ships.</p>
                `),
            };

        case 'shipping_notification':
            return {
                subject: `Your order has shipped! — #${esc((data.order_id || '').slice(0, 8))}`,
                html: wrap(`
                    <h2>Your Order Has Shipped!</h2>
                    <p>Great news, ${esc(data.client_name) || 'there'}! Your order is on its way.</p>
                    <p><strong>Order ID:</strong> ${esc(data.order_id)}</p>
                    ${data.tracking_number ? `<p><strong>Tracking Number:</strong> ${esc(data.tracking_number)}</p>` : ''}
                    ${safeUrl(data.tracking_url) ? `<p style="text-align:center;margin:24px 0"><a href="${safeUrl(data.tracking_url)}" style="background:${pc};color:white;padding:12px 24px;border-radius:6px;text-decoration:none;font-weight:bold">Track Your Package</a></p>` : ''}
                    ${data.carrier ? `<p><strong>Carrier:</strong> ${esc(data.carrier)}</p>` : ''}
                    <p>Estimated delivery: ${esc(data.estimated_delivery) || '3-5 business days'}</p>
                `),
            };

        case 'password_reset':
            return {
                subject: `Reset your ${branding.brand_name} password`,
                html: wrap(`
                    <h2>Password Reset</h2>
                    <p>We received a request to reset your password.</p>
                    ${safeUrl(data.reset_url) ? `<p style="text-align:center;margin:24px 0"><a href="${safeUrl(data.reset_url)}" style="background:${pc};color:white;padding:12px 24px;border-radius:6px;text-decoration:none;font-weight:bold">Reset Password</a></p>` : ''}
                    <p>If you didn't request this, you can safely ignore this email.</p>
                    <p style="font-size:12px;color:#999">This link expires in 1 hour.</p>
                `),
            };

        default:
            return {
                subject: `Message from ${branding.brand_name}`,
                html: wrap(`<p>${esc(data.message) || 'No content provided.'}</p>`),
            };
    }
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
    if (req.method !== 'POST') {
        return res.status(405).json({ error: 'Method not allowed' });
    }

    try {
        const { template, to, data = {}, org_id } = req.body;

        if (!template || !to || !org_id) {
            return res.status(400).json({ error: 'template, to, and org_id are required' });
        }

        // Validate template name
        if (!VALID_TEMPLATES.includes(template)) {
            return res.status(400).json({ error: `Invalid template. Must be one of: ${VALID_TEMPLATES.join(', ')}` });
        }

        // Auth
        const authHeader = req.headers.authorization;
        if (!authHeader?.startsWith('Bearer ')) {
            return res.status(401).json({ error: 'Missing authorization' });
        }

        const supabaseUrl = process.env.SUPABASE_URL;
        const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
        if (!supabaseUrl || !supabaseServiceKey) {
            return res.status(500).json({ error: 'Server configuration error' });
        }

        const supabase = createClient(supabaseUrl, supabaseServiceKey);
        const token = authHeader.replace('Bearer ', '');
        const { data: { user }, error: authError } = await supabase.auth.getUser(token);
        if (authError || !user) {
            return res.status(401).json({ error: 'Invalid token' });
        }

        // Verify user belongs to this org or is super_admin
        const { data: role } = await supabase
            .from('user_roles')
            .select('role')
            .eq('user_id', user.id)
            .or(`org_id.eq.${org_id},role.eq.super_admin`)
            .limit(1)
            .maybeSingle();

        if (!role) {
            return res.status(403).json({ error: 'Not authorized for this organization' });
        }

        // Fetch tenant branding
        const { data: config } = await supabase
            .from('tenant_config')
            .select('brand_name, primary_color, support_email, logo_url')
            .eq('org_id', org_id)
            .single();

        const branding = {
            brand_name: config?.brand_name || 'Peptide Portal',
            primary_color: config?.primary_color || '#7c3aed',
            support_email: config?.support_email || 'support@example.com',
            logo_url: config?.logo_url || '',
        };

        const emailTemplate = getTemplate(template, data, branding);

        // Check for tenant-specific SMTP config
        const { data: smtpKey } = await supabase
            .from('tenant_api_keys')
            .select('api_key')
            .eq('org_id', org_id)
            .eq('service', 'smtp_url')
            .single();

        // For now, use Supabase's built-in email or a configured SMTP relay
        // In production, integrate with SendGrid/Resend/Postmark via the tenant's API key
        const smtpUrl = smtpKey?.api_key || process.env.SMTP_RELAY_URL;

        if (smtpUrl) {
            // Send via external SMTP relay (e.g., Resend, SendGrid)
            const resendKey = smtpKey?.api_key ? null : process.env.RESEND_API_KEY;
            const fromEmail = branding.support_email || 'noreply@thepeptideai.com';
            const response = await fetch(smtpUrl, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    ...(resendKey ? { 'Authorization': `Bearer ${resendKey}` } : {}),
                },
                body: JSON.stringify({
                    from: `${branding.brand_name} <${fromEmail}>`,
                    to: Array.isArray(to) ? to : [to],
                    subject: emailTemplate.subject,
                    html: emailTemplate.html,
                }),
            });

            if (!response.ok) {
                const err = await response.text();
                console.error('SMTP relay error:', err);
                return res.status(502).json({ error: 'Email delivery failed' });
            }
            return res.status(200).json({
                sent: true,
                template,
                to,
                subject: emailTemplate.subject,
            });
        } else {
            // No SMTP configured — log for dev/demo purposes
            console.log(`[Email] Would send "${emailTemplate.subject}" to ${to}`);
            return res.status(200).json({
                sent: false,
                queued: true,
                note: 'No SMTP relay configured — email logged but not delivered',
                template,
                to,
                subject: emailTemplate.subject,
            });
        }

    } catch (error: any) {
        console.error('Email send failed:', error);
        return res.status(500).json({ error: 'Internal server error' });
    }
}
