import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { withErrorReporting } from "../_shared/error-reporter.ts";

const APP_ORIGINS = [
    'https://thepeptideai.com',
    'https://app.thepeptideai.com',
    'https://www.thepeptideai.com',
    'http://localhost:5173',
    'http://localhost:8080',
];
const envOrigins = (Deno.env.get('ALLOWED_ORIGINS') || '').split(',').map(o => o.trim()).filter(Boolean);
const ALLOWED_ORIGINS = [...new Set([...APP_ORIGINS, ...envOrigins])];

function getCorsHeaders(req: Request) {
    const origin = req.headers.get('origin') || '';
    const allowedOrigin = ALLOWED_ORIGINS.includes(origin) ? origin : (ALLOWED_ORIGINS[0] || '');
    return {
        'Access-Control-Allow-Origin': allowedOrigin,
        'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
        'Access-Control-Allow-Methods': 'POST, OPTIONS',
    };
}

Deno.serve(withErrorReporting("self-signup", async (req) => {
    const corsHeaders = getCorsHeaders(req);
    if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });

    const json = (body: object, status = 200) =>
        new Response(JSON.stringify(body), {
            status,
            headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });

    try {
        const sbUrl = Deno.env.get('SUPABASE_URL');
        const sbServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
        if (!sbUrl || !sbServiceKey) throw new Error('Missing Supabase config');

        // Authenticate the caller via JWT
        const authHeader = req.headers.get('Authorization');
        if (!authHeader) return json({ error: 'Unauthorized' }, 401);

        const supabase = createClient(sbUrl, sbServiceKey);
        const token = authHeader.replace('Bearer ', '');
        const { data: { user }, error: authError } = await supabase.auth.getUser(token);
        if (authError || !user) return json({ error: 'Invalid token' }, 401);

        // ── Self-signup: allowed for merchant onboarding flow ──

        // Check that this user does NOT already have an org
        const { data: existingProfile } = await supabase
            .from('profiles')
            .select('org_id')
            .eq('user_id', user.id)
            .single();

        if (existingProfile?.org_id) {
            return json({ error: 'User already belongs to an organization' }, 400);
        }

        const body = await req.json();
        const orgName = (body.org_name || '').trim();
        const planName = (body.plan_name || '').trim();

        if (!orgName) return json({ error: 'org_name is required' }, 400);
        if (orgName.length > 200) return json({ error: 'org_name too long' }, 400);

        console.log(`[self-signup] Creating org "${orgName}" for ${user.email}`);

        // ── Step 1: Create Organization ──
        const { data: org, error: orgError } = await supabase
            .from('organizations')
            .insert({ name: orgName })
            .select()
            .single();

        if (orgError) throw new Error(`Org creation failed: ${orgError.message}`);

        // ── Step 2: Create Tenant Config ──
        const { error: configError } = await supabase
            .from('tenant_config')
            .insert({
                org_id: org.id,
                brand_name: orgName,
                admin_brand_name: orgName,
                support_email: user.email || '',
                app_url: '',
                logo_url: '',
                primary_color: '#7c3aed',
                ship_from_name: '',
                ship_from_street: '',
                ship_from_city: '',
                ship_from_state: '',
                ship_from_zip: '',
                ship_from_country: 'US',
                ship_from_phone: '',
                ship_from_email: user.email || '',
                zelle_email: '',
                session_timeout_minutes: 60,
            });

        if (configError) console.warn(`Config warning: ${configError.message}`);

        // ── Step 3: Update Profile (link to org as admin) ──
        const fullName = user.user_metadata?.full_name || user.email || '';
        const { error: profileError } = await supabase
            .from('profiles')
            .upsert({
                user_id: user.id,
                full_name: fullName,
                org_id: org.id,
                role: 'admin',
                email: user.email,
            }, { onConflict: 'user_id' });

        if (profileError) console.warn(`Profile warning: ${profileError.message}`);

        // ── Step 4: Create User Role ──
        const { error: roleError } = await supabase
            .from('user_roles')
            .upsert({
                user_id: user.id,
                org_id: org.id,
                role: 'admin',
            }, { onConflict: 'user_id,org_id' });

        if (roleError) console.warn(`Role warning: ${roleError.message}`);

        // ── Step 5: Seed Default Pricing Tiers ──
        const { error: tierError } = await supabase
            .from('pricing_tiers')
            .insert([
                { org_id: org.id, name: 'Retail', markup_pct: 1.00, is_default: true },
                { org_id: org.id, name: 'Partner', markup_pct: 0.70, is_default: false },
                { org_id: org.id, name: 'VIP', markup_pct: 0.80, is_default: false },
            ]);

        if (tierError) console.warn(`Pricing tiers warning: ${tierError.message}`);

        // ── Step 6: Seed Default Feature Flags ──
        const featureKeys = [
            'ai_assistant', 'peptide_catalog', 'lot_tracking', 'bottle_tracking',
            'supplements', 'movements', 'purchase_orders', 'sales_orders',
            'fulfillment', 'partner_network', 'financials', 'automations',
            'contacts', 'protocols', 'resources', 'client_requests',
            'feedback', 'client_portal', 'customizations',
        ];
        const { error: featureError } = await supabase
            .from('org_features')
            .insert(featureKeys.map(key => ({ org_id: org.id, feature_key: key, enabled: true })));

        if (featureError) console.warn(`Feature flags warning: ${featureError.message}`);

        // ── Step 7: Link Subscription Plan (if selected) ──
        let subscriptionCreated = false;
        if (planName) {
            const { data: plan } = await supabase
                .from('subscription_plans')
                .select('id, name')
                .eq('name', planName)
                .eq('active', true)
                .single();

            if (plan) {
                const trialEnd = new Date();
                trialEnd.setDate(trialEnd.getDate() + 7); // 7-day trial

                const { error: subError } = await supabase
                    .from('tenant_subscriptions')
                    .insert({
                        org_id: org.id,
                        plan_id: plan.id,
                        status: 'trialing',
                        billing_period: 'monthly',
                        trial_end: trialEnd.toISOString(),
                        current_period_start: new Date().toISOString(),
                        current_period_end: trialEnd.toISOString(),
                    });

                if (subError) console.warn(`Subscription warning: ${subError.message}`);
                else subscriptionCreated = true;
            }
        }

        // NOTE: Wholesale tier assignment and supplier catalog seeding are NOT
        // done at signup. Merchants start with an empty product catalog.
        // The Setup Assistant will help them import THEIR OWN products
        // (via website scrape or conversation). Supply chain opt-in is a
        // separate, deliberate decision made later.

        console.log(`[self-signup] Org ${org.id} created for ${user.email}`);

        return json({
            success: true,
            org_id: org.id,
            subscription_created: subscriptionCreated,
        });

    } catch (err: any) {
        console.error('[self-signup] Error:', err.message);
        return json({ error: err.message || 'Internal error' }, 500);
    }
}));
