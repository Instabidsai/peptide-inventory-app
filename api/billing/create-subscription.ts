import type { VercelRequest, VercelResponse } from '@vercel/node';
import { createClient } from '@supabase/supabase-js';

const STRIPE_API_BASE = 'https://api.stripe.com/v1';

/**
 * Create a Stripe Checkout Session for a tenant subscription.
 * POST /api/billing/create-subscription
 * Body: { org_id, plan_id, billing_period: 'monthly' | 'yearly' }
 */
export default async function handler(req: VercelRequest, res: VercelResponse) {
    if (req.method !== 'POST') {
        return res.status(405).json({ error: 'Method not allowed' });
    }

    try {
        const { org_id, plan_id, billing_period = 'monthly' } = req.body;

        if (!org_id || !plan_id) {
            return res.status(400).json({ error: 'org_id and plan_id are required' });
        }

        if (!['monthly', 'yearly'].includes(billing_period)) {
            return res.status(400).json({ error: 'billing_period must be "monthly" or "yearly"' });
        }

        // Auth
        const authHeader = req.headers.authorization;
        if (!authHeader?.startsWith('Bearer ')) {
            return res.status(401).json({ error: 'Missing authorization token' });
        }
        const token = authHeader.replace('Bearer ', '');

        const supabaseUrl = process.env.SUPABASE_URL;
        const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
        const stripeSecretKey = process.env.STRIPE_SECRET_KEY;

        if (!supabaseUrl || !supabaseServiceKey || !stripeSecretKey) {
            return res.status(500).json({ error: 'Server configuration error' });
        }

        const supabase = createClient(supabaseUrl, supabaseServiceKey);

        // Verify user
        const { data: { user }, error: authError } = await supabase.auth.getUser(token);
        if (authError || !user) {
            return res.status(401).json({ error: 'Invalid token' });
        }

        // Check user is admin of this specific org or super_admin
        const { data: role } = await supabase
            .from('user_roles')
            .select('role')
            .eq('user_id', user.id)
            .or(`and(role.eq.admin,org_id.eq.${org_id}),role.eq.super_admin`)
            .limit(1)
            .maybeSingle();

        if (!role) {
            return res.status(403).json({ error: 'Admin access required' });
        }

        // Fetch the plan
        const { data: plan, error: planError } = await supabase
            .from('subscription_plans')
            .select('*')
            .eq('id', plan_id)
            .eq('active', true)
            .single();

        if (planError || !plan) {
            return res.status(404).json({ error: 'Plan not found' });
        }

        // Get the correct Stripe Price ID
        const priceId = billing_period === 'yearly'
            ? plan.stripe_yearly_price_id
            : plan.stripe_monthly_price_id;

        if (!priceId) {
            return res.status(400).json({ error: `No Stripe price configured for ${plan.name} (${billing_period})` });
        }

        // Get org info for metadata
        const { data: _org } = await supabase
            .from('organizations')
            .select('name')
            .eq('id', org_id)
            .single();

        // Check for existing Stripe customer
        const { data: existingSub } = await supabase
            .from('tenant_subscriptions')
            .select('stripe_customer_id')
            .eq('org_id', org_id)
            .single();

        const siteBase = process.env.PUBLIC_SITE_URL || '';
        const successUrl = `${siteBase}/#/vendor?billing=success&org_id=${org_id}`;
        const cancelUrl = `${siteBase}/#/vendor?billing=canceled`;

        // Create Stripe Checkout Session
        const params = new URLSearchParams();
        params.append('mode', 'subscription');
        params.append('success_url', successUrl);
        params.append('cancel_url', cancelUrl);
        params.append('line_items[0][price]', priceId);
        params.append('line_items[0][quantity]', '1');
        params.append('metadata[org_id]', org_id);
        params.append('metadata[plan_id]', plan_id);
        params.append('metadata[billing_period]', billing_period);
        params.append('subscription_data[metadata][org_id]', org_id);
        params.append('subscription_data[metadata][plan_name]', plan.name);

        if (existingSub?.stripe_customer_id) {
            params.append('customer', existingSub.stripe_customer_id);
        } else {
            if (user.email) params.append('customer_email', user.email);
        }

        const stripeResponse = await fetch(`${STRIPE_API_BASE}/checkout/sessions`, {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${stripeSecretKey}`,
                'Content-Type': 'application/x-www-form-urlencoded',
            },
            body: params.toString(),
        });

        if (!stripeResponse.ok) {
            const errorBody = await stripeResponse.text();
            console.error('Stripe API error:', stripeResponse.status, errorBody);
            return res.status(502).json({ error: 'Payment processor error' });
        }

        const session = await stripeResponse.json();

        return res.status(200).json({
            checkout_url: session.url,
            session_id: session.id,
        });

    } catch (error: any) {
        console.error('Subscription checkout failed:', error);
        return res.status(500).json({ error: 'Internal server error' });
    }
}
