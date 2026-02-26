import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { withErrorReporting } from "../_shared/error-reporter.ts";

const VERSION = "2.0.0";

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

interface ProvisionRequest {
    // Organization
    org_name: string;
    // Admin user
    admin_email: string;
    admin_name: string;
    admin_password?: string; // If omitted, sends magic link
    // Branding
    brand_name?: string;
    admin_brand_name?: string;
    support_email?: string;
    app_url?: string;
    logo_url?: string;
    primary_color?: string;
    // Shipping (optional — can be set later)
    ship_from_name?: string;
    ship_from_street?: string;
    ship_from_city?: string;
    ship_from_state?: string;
    ship_from_zip?: string;
    ship_from_phone?: string;
    ship_from_email?: string;
    // Options
    seed_sample_peptides?: boolean;
    // Business-in-a-Box (v2)
    plan_name?: string;           // 'starter' | 'professional' | 'enterprise'
    onboarding_path?: string;     // 'new' | 'existing'
    subdomain?: string;
    seed_supplier_catalog?: boolean;
}

Deno.serve(withErrorReporting("provision-tenant", async (req) => {
    const corsHeaders = getCorsHeaders(req);

    if (req.method === 'OPTIONS') {
        return new Response('ok', { headers: corsHeaders });
    }

    try {
        // Require service role key — this is a privileged operation
        const sbUrl = Deno.env.get('SUPABASE_URL');
        const sbServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
        if (!sbUrl || !sbServiceKey) throw new Error('Missing Supabase config');

        // Verify caller is a super-admin or has service role
        const authHeader = req.headers.get('Authorization');
        if (!authHeader) throw new Error('Unauthorized: no auth header');

        const supabase = createClient(sbUrl, sbServiceKey);

        // Check if caller is super-admin via their JWT
        const token = authHeader.replace('Bearer ', '');
        const { data: { user }, error: authError } = await supabase.auth.getUser(token);
        if (authError || !user) throw new Error('Unauthorized: invalid token');

        // Verify super-admin role
        const { data: callerRole } = await supabase
            .from('user_roles')
            .select('role')
            .eq('user_id', user.id)
            .single();

        if (callerRole?.role !== 'super_admin') {
            throw new Error('Forbidden: only super_admin can provision tenants');
        }

        const body: ProvisionRequest = await req.json();
        if (!body.org_name || !body.admin_email || !body.admin_name) {
            throw new Error('Required: org_name, admin_email, admin_name');
        }

        console.log(`[${VERSION}] Provisioning tenant: ${body.org_name} for ${body.admin_email}`);

        const results: Record<string, any> = {};

        // ── Step 1: Create Organization ──
        const { data: org, error: orgError } = await supabase
            .from('organizations')
            .insert({ name: body.org_name })
            .select()
            .single();

        if (orgError) throw new Error(`Org creation failed: ${orgError.message}`);
        results.org_id = org.id;
        console.log(`  Created org: ${org.id}`);

        // ── Step 2: Create Tenant Config ──
        const { error: configError } = await supabase
            .from('tenant_config')
            .insert({
                org_id: org.id,
                brand_name: body.brand_name || body.org_name,
                admin_brand_name: body.admin_brand_name || body.org_name,
                support_email: body.support_email || body.admin_email,
                app_url: body.app_url || '',
                logo_url: body.logo_url || '',
                primary_color: body.primary_color || '#7c3aed',
                ship_from_name: body.ship_from_name || '',
                ship_from_street: body.ship_from_street || '',
                ship_from_city: body.ship_from_city || '',
                ship_from_state: body.ship_from_state || '',
                ship_from_zip: body.ship_from_zip || '',
                ship_from_country: 'US',
                ship_from_phone: body.ship_from_phone || '',
                ship_from_email: body.ship_from_email || body.admin_email,
                zelle_email: '',
                session_timeout_minutes: 60,
            });

        if (configError) throw new Error(`Config creation failed: ${configError.message}`);
        results.config_created = true;
        console.log(`  Created tenant config`);

        // ── Step 3: Create Admin User ──
        const createUserPayload: any = {
            email: body.admin_email,
            email_confirm: true,
            user_metadata: { role: 'admin', full_name: body.admin_name },
        };
        if (body.admin_password) {
            createUserPayload.password = body.admin_password;
        }

        const { data: userData, error: userError } = await supabase.auth.admin.createUser(createUserPayload);

        let adminUserId: string;
        if (userData?.user) {
            adminUserId = userData.user.id;
        } else if (userError?.message?.includes('already registered')) {
            // User exists — find them (profiles first, bounded fallback)
            const { data: existingProfile } = await supabase
                .from('profiles')
                .select('user_id')
                .eq('email', body.admin_email.toLowerCase())
                .limit(1)
                .maybeSingle();
            let found: { id: string } | undefined;
            if (existingProfile) {
                found = { id: existingProfile.user_id };
            } else {
                const { data: userList } = await supabase.auth.admin.listUsers({ page: 1, perPage: 50 });
                const match = userList?.users?.find(u => u.email?.toLowerCase() === body.admin_email.toLowerCase());
                if (match) found = { id: match.id };
            }
            if (!found) throw new Error('User exists but could not be found');
            adminUserId = found.id;
            results.admin_user_existed = true;
        } else if (userError) {
            throw new Error(`User creation failed: ${userError.message}`);
        } else {
            throw new Error('User creation returned no data');
        }

        results.admin_user_id = adminUserId;
        console.log(`  Admin user: ${adminUserId}`);

        // ── Step 4: Create Profile ──
        const { error: profileError } = await supabase
            .from('profiles')
            .upsert({
                id: adminUserId,
                full_name: body.admin_name,
                org_id: org.id,
                role: 'admin',
            }, { onConflict: 'id' });

        if (profileError) console.warn(`Profile upsert warning: ${profileError.message}`);
        results.profile_created = true;

        // ── Step 5: Create User Role ──
        const { error: roleError } = await supabase
            .from('user_roles')
            .upsert({
                user_id: adminUserId,
                org_id: org.id,
                role: 'admin',
            }, { onConflict: 'user_id,org_id' });

        if (roleError) console.warn(`Role upsert warning: ${roleError.message}`);
        results.role_created = true;

        // ── Step 6: Seed Default Pricing Tiers ──
        const { error: tierError } = await supabase
            .from('pricing_tiers')
            .insert([
                { org_id: org.id, name: 'Retail', markup_pct: 1.00, is_default: true },
                { org_id: org.id, name: 'Partner', markup_pct: 0.70, is_default: false },
                { org_id: org.id, name: 'VIP', markup_pct: 0.80, is_default: false },
            ]);

        if (tierError) console.warn(`Pricing tiers warning: ${tierError.message}`);
        results.pricing_tiers_created = true;

        // ── Step 7: Seed Sample Peptides (optional) ──
        if (body.seed_sample_peptides) {
            const { error: pepError } = await supabase
                .from('peptides')
                .insert([
                    { org_id: org.id, name: 'BPC-157', sku: 'BPC-5MG', retail_price: 45.00, active: true },
                    { org_id: org.id, name: 'TB-500', sku: 'TB-5MG', retail_price: 55.00, active: true },
                    { org_id: org.id, name: 'Semaglutide', sku: 'SEMA-5MG', retail_price: 120.00, active: true },
                    { org_id: org.id, name: 'CJC-1295', sku: 'CJC-2MG', retail_price: 65.00, active: true },
                    { org_id: org.id, name: 'Ipamorelin', sku: 'IPA-5MG', retail_price: 55.00, active: true },
                ]);

            if (pepError) console.warn(`Sample peptides warning: ${pepError.message}`);
            results.sample_peptides_created = true;
        }

        // ── Step 8: Register Composio Entity (optional — if API key set) ──
        const composioApiKey = Deno.env.get('COMPOSIO_API_KEY');
        if (composioApiKey) {
            try {
                const entityRes = await fetch('https://backend.composio.dev/api/v1/entity', {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json',
                        'X-API-KEY': composioApiKey,
                    },
                    body: JSON.stringify({ id: org.id }),
                });

                if (entityRes.ok) {
                    results.composio_entity_registered = true;
                    console.log(`  Registered Composio entity: ${org.id}`);
                } else {
                    const errText = await entityRes.text();
                    console.warn(`  Composio entity registration warning: ${errText}`);
                    results.composio_entity_registered = false;
                }
            } catch (compErr: any) {
                console.warn(`  Composio entity registration skipped: ${compErr.message}`);
                results.composio_entity_registered = false;
            }
        }

        // ── Step 9: Seed Feature Flags ──
        const featureKeys = [
            'ai_assistant', 'peptide_catalog', 'lot_tracking', 'bottle_tracking',
            'supplements', 'movements', 'purchase_orders', 'sales_orders',
            'fulfillment', 'partner_network', 'financials', 'automations',
            'contacts', 'protocols', 'resources', 'client_requests',
            'feedback', 'client_portal', 'customizations', 'wholesale_catalog',
        ];
        const { error: featureError } = await supabase
            .from('org_features')
            .insert(featureKeys.map(key => ({ org_id: org.id, feature_key: key, enabled: true })));

        if (featureError) console.warn(`Feature flags warning: ${featureError.message}`);
        results.feature_flags_created = true;
        console.log(`  Seeded ${featureKeys.length} feature flags`);

        // ── Step 10: Create Subscription (if plan specified) ──
        if (body.plan_name) {
            const { data: plan } = await supabase
                .from('subscription_plans')
                .select('id, name')
                .eq('name', body.plan_name)
                .eq('active', true)
                .single();

            if (plan) {
                const trialEnd = new Date();
                trialEnd.setDate(trialEnd.getDate() + 14);

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
                else results.subscription_created = true;
                console.log(`  Created subscription: ${plan.name} (14-day trial)`);
            }
        }

        // ── Step 11: Assign Wholesale Tier + Supplier ──
        const supplierOrgId = Deno.env.get('SUPPLIER_ORG_ID');
        if (supplierOrgId) {
            // Default new merchants to Standard tier (cost + $40)
            const { data: standardTier } = await supabase
                .from('wholesale_pricing_tiers')
                .select('id')
                .eq('name', 'Standard')
                .eq('active', true)
                .single();

            if (standardTier) {
                const updatePayload: Record<string, any> = {
                    wholesale_tier_id: standardTier.id,
                    supplier_org_id: supplierOrgId,
                };
                if (body.onboarding_path) updatePayload.onboarding_path = body.onboarding_path;
                if (body.subdomain) updatePayload.subdomain = body.subdomain.toLowerCase().trim();

                const { error: tierUpdateError } = await supabase
                    .from('tenant_config')
                    .update(updatePayload)
                    .eq('org_id', org.id);

                if (tierUpdateError) console.warn(`Wholesale tier assignment warning: ${tierUpdateError.message}`);
                else results.wholesale_tier_assigned = true;
                console.log(`  Assigned wholesale tier: Standard, supplier: ${supplierOrgId}`);
            }
        }

        // ── Step 12: Seed Supplier Catalog ──
        if (body.seed_supplier_catalog && supplierOrgId) {
            const { data: supplierPeptides, error: catError } = await supabase
                .from('peptides')
                .select('name, description, sku, retail_price, base_cost, active, default_dose_amount, default_dose_unit, default_frequency, default_timing, default_concentration_mg_ml, reconstitution_notes, visible_to_user_ids')
                .eq('org_id', supplierOrgId)
                .eq('active', true);

            if (catError) {
                console.warn(`Supplier catalog read warning: ${catError.message}`);
            } else if (supplierPeptides && supplierPeptides.length > 0) {
                // Filter out restricted products (those with visible_to_user_ids set)
                const publicPeptides = supplierPeptides.filter(
                    p => !p.visible_to_user_ids || p.visible_to_user_ids.length === 0
                );
                const skippedCount = supplierPeptides.length - publicPeptides.length;
                if (skippedCount > 0) {
                    console.log(`  Skipped ${skippedCount} restricted products`);
                }

                const catalogRows = publicPeptides.map(p => ({
                    org_id: org.id,
                    name: p.name,
                    description: p.description,
                    sku: p.sku,
                    retail_price: p.retail_price,
                    base_cost: p.base_cost,
                    active: true,
                    default_dose_amount: p.default_dose_amount,
                    default_dose_unit: p.default_dose_unit,
                    default_frequency: p.default_frequency,
                    default_timing: p.default_timing,
                    default_concentration_mg_ml: p.default_concentration_mg_ml,
                    reconstitution_notes: p.reconstitution_notes,
                    catalog_source: 'supplier',
                }));

                if (catalogRows.length > 0) {
                    const { error: seedError } = await supabase
                        .from('peptides')
                        .insert(catalogRows);

                    if (seedError) console.warn(`Supplier catalog seed warning: ${seedError.message}`);
                    else {
                        results.supplier_catalog_seeded = true;
                        results.catalog_product_count = catalogRows.length;
                    }
                    console.log(`  Seeded ${catalogRows.length} products from supplier catalog`);
                }
            }
        }

        // ── Step 13: Send Welcome Email ──
        try {
            const resendKey = Deno.env.get('RESEND_API_KEY');
            if (resendKey) {
                const brandName = body.brand_name || body.org_name;
                const loginUrl = body.app_url || 'https://app.thepeptideai.com';
                const welcomeHtml = `
                    <div style="font-family:sans-serif;max-width:600px;margin:0 auto">
                        <div style="background:linear-gradient(135deg,#7c3aed,#6d28d9);padding:32px;border-radius:12px 12px 0 0">
                            <h1 style="color:#fff;margin:0;font-size:24px">Welcome to ThePeptideAI</h1>
                        </div>
                        <div style="padding:24px;border:1px solid #e5e7eb;border-top:none;border-radius:0 0 12px 12px">
                            <p style="font-size:16px;color:#1f2937">Hi ${body.admin_name},</p>
                            <p style="color:#4b5563">Your organization <strong>${brandName}</strong> has been set up and is ready to go.</p>
                            <p style="color:#4b5563">Here's what you can do right away:</p>
                            <ul style="color:#4b5563;line-height:1.8">
                                <li>Add your peptide inventory</li>
                                <li>Set up pricing tiers for partners</li>
                                <li>Invite team members and sales reps</li>
                                <li>Configure your brand settings</li>
                                <li>Enable AI-powered features</li>
                            </ul>
                            <div style="text-align:center;margin:24px 0">
                                <a href="${loginUrl}" style="display:inline-block;background:#7c3aed;color:#fff;padding:12px 32px;border-radius:8px;text-decoration:none;font-weight:600">
                                    Log In to Your Dashboard
                                </a>
                            </div>
                            <p style="color:#6b7280;font-size:14px">
                                Need help getting started? Reply to this email or reach out to
                                <a href="mailto:support@thepeptideai.com" style="color:#7c3aed">support@thepeptideai.com</a>.
                            </p>
                            <hr style="border:none;border-top:1px solid #e5e7eb;margin:24px 0" />
                            <p style="color:#9ca3af;font-size:12px;text-align:center">
                                ThePeptideAI — Peptide Inventory & CRM Platform
                            </p>
                        </div>
                    </div>`;

                const emailRes = await fetch('https://api.resend.com/emails', {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json',
                        Authorization: `Bearer ${resendKey}`,
                    },
                    body: JSON.stringify({
                        from: 'ThePeptideAI <noreply@thepeptideai.com>',
                        to: [body.admin_email],
                        reply_to: 'support@thepeptideai.com',
                        subject: `Welcome to ThePeptideAI — ${brandName} is ready!`,
                        html: welcomeHtml,
                    }),
                });

                if (emailRes.ok) {
                    results.welcome_email_sent = true;
                    console.log(`  Sent welcome email to ${body.admin_email}`);
                } else {
                    const errText = await emailRes.text();
                    console.warn(`  Welcome email failed: ${errText}`);
                    results.welcome_email_sent = false;
                }
            } else {
                console.log(`  No RESEND_API_KEY — skipping welcome email`);
                results.welcome_email_sent = false;
            }
        } catch (emailErr: any) {
            console.warn(`  Welcome email error: ${emailErr.message}`);
            results.welcome_email_sent = false;
        }

        console.log(`[${VERSION}] Tenant provisioned successfully: ${org.id}`);

        return new Response(
            JSON.stringify({
                success: true,
                version: VERSION,
                ...results,
            }),
            {
                headers: { ...corsHeaders, 'Content-Type': 'application/json' },
                status: 200,
            }
        );

    } catch (error: any) {
        console.error(`[${VERSION}] Error:`, error.message);
        return new Response(
            JSON.stringify({
                success: false,
                version: VERSION,
                error: error.message,
            }),
            {
                headers: { ...getCorsHeaders(req), 'Content-Type': 'application/json' },
                status: error.message.includes('Unauthorized') || error.message.includes('Forbidden') ? 403 : 400,
            }
        );
    }
}));
