/**
 * Deployment Validation Script
 * ============================
 * Verifies that a ThePeptideAI deployment is correctly configured.
 *
 * Prerequisites:
 *   SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, VITE_SUPABASE_ANON_KEY set
 *
 * Usage:
 *   npx tsx scripts/validate-deployment.ts
 *
 * Optionally set PUBLIC_SITE_URL to also test the frontend + API routes.
 */

interface CheckResult {
    name: string;
    status: 'PASS' | 'FAIL' | 'WARN' | 'SKIP';
    detail: string;
}

const results: CheckResult[] = [];

function check(name: string, status: CheckResult['status'], detail: string) {
    results.push({ name, status, detail });
    const icon = status === 'PASS' ? '✓' : status === 'FAIL' ? '✗' : status === 'WARN' ? '⚠' : '○';
    console.log(`  ${icon} ${name}: ${detail}`);
}

async function supabaseFetch(url: string, key: string, path: string, opts?: RequestInit) {
    return fetch(`${url}/rest/v1/${path}`, {
        ...opts,
        headers: {
            'apikey': key,
            'Authorization': `Bearer ${key}`,
            ...(opts?.headers || {}),
        },
    });
}

async function main() {
    const supabaseUrl = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL;
    const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
    const anonKey = process.env.VITE_SUPABASE_ANON_KEY;
    const siteUrl = process.env.PUBLIC_SITE_URL;
    const stripeKey = process.env.STRIPE_SECRET_KEY;

    console.log('\n=== ThePeptideAI Deployment Validation ===\n');

    // ─── Environment Variables ─────────────────────────────────
    console.log('[1/6] Environment Variables');

    const requiredVars = [
        'VITE_SUPABASE_URL', 'VITE_SUPABASE_ANON_KEY', 'SUPABASE_URL',
        'SUPABASE_SERVICE_ROLE_KEY', 'OPENAI_API_KEY', 'PUBLIC_SITE_URL',
    ];
    const optionalVars = [
        'STRIPE_SECRET_KEY', 'STRIPE_WEBHOOK_SECRET', 'SHIPPO_API_KEY',
        'PSIFI_API_KEY', 'DEFAULT_ORG_ID', 'WOO_URL',
    ];

    for (const v of requiredVars) {
        if (process.env[v]) {
            check(v, 'PASS', 'Set');
        } else {
            check(v, 'FAIL', 'Missing — required');
        }
    }
    for (const v of optionalVars) {
        if (process.env[v]) {
            check(v, 'PASS', 'Set');
        } else {
            check(v, 'WARN', 'Not set — optional');
        }
    }
    console.log('');

    if (!supabaseUrl || !serviceKey) {
        console.error('Cannot continue without SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY');
        printSummary();
        process.exit(1);
    }

    // ─── Database Schema ───────────────────────────────────────
    console.log('[2/6] Database Schema');

    const criticalTables = [
        'organizations', 'tenant_config', 'profiles', 'user_roles',
        'subscription_plans', 'tenant_subscriptions', 'peptides',
        'contacts', 'orders', 'order_items', 'pricing_tiers',
        'automation_modules', 'custom_fields', 'billing_events',
    ];

    for (const table of criticalTables) {
        try {
            const res = await supabaseFetch(supabaseUrl, serviceKey, `${table}?select=count&limit=0`, { method: 'HEAD' });
            if (res.ok) {
                check(table, 'PASS', 'Exists');
            } else {
                check(table, 'FAIL', `HTTP ${res.status} — table may not exist`);
            }
        } catch (err: any) {
            check(table, 'FAIL', err.message);
        }
    }
    console.log('');

    // ─── Seed Data ─────────────────────────────────────────────
    console.log('[3/6] Seed Data');

    // Subscription plans
    try {
        const res = await supabaseFetch(supabaseUrl, serviceKey, 'subscription_plans?select=name,display_name,stripe_monthly_price_id&order=sort_order');
        if (res.ok) {
            const plans = await res.json();
            check('Subscription plans', plans.length >= 4 ? 'PASS' : 'WARN',
                `${plans.length} plans found: ${plans.map((p: any) => p.display_name).join(', ')}`);

            const withStripe = plans.filter((p: any) => p.stripe_monthly_price_id);
            if (withStripe.length > 0) {
                check('Stripe price IDs', 'PASS', `${withStripe.length} plans have Stripe prices linked`);
            } else {
                check('Stripe price IDs', 'WARN', 'No plans have Stripe prices — run setup-stripe.ts');
            }
        } else {
            check('Subscription plans', 'FAIL', 'Could not query subscription_plans');
        }
    } catch (err: any) {
        check('Subscription plans', 'FAIL', err.message);
    }

    // Organizations
    try {
        const res = await supabaseFetch(supabaseUrl, serviceKey, 'organizations?select=id,name');
        if (res.ok) {
            const orgs = await res.json();
            check('Organizations', orgs.length > 0 ? 'PASS' : 'WARN',
                orgs.length > 0 ? `${orgs.length} org(s): ${orgs.map((o: any) => o.name).join(', ')}` : 'No organizations — run seed-new-tenant.sql');
        }
    } catch (err: any) {
        check('Organizations', 'FAIL', err.message);
    }

    // Tenant config
    try {
        const res = await supabaseFetch(supabaseUrl, serviceKey, 'tenant_config?select=org_id,brand_name');
        if (res.ok) {
            const configs = await res.json();
            check('Tenant config', configs.length > 0 ? 'PASS' : 'WARN',
                configs.length > 0 ? `${configs.length} tenant(s) configured` : 'No tenant config — configure in Settings');
        }
    } catch (err: any) {
        check('Tenant config', 'FAIL', err.message);
    }
    console.log('');

    // ─── RLS Policies ──────────────────────────────────────────
    console.log('[4/6] Row Level Security');

    // Test that anon key can't read organizations (should be blocked by RLS)
    if (anonKey) {
        try {
            const res = await supabaseFetch(supabaseUrl, anonKey, 'organizations?select=id&limit=1');
            if (res.ok) {
                const data = await res.json();
                if (data.length === 0) {
                    check('RLS on organizations', 'PASS', 'Anon key returns empty (correct — RLS blocks)');
                } else {
                    check('RLS on organizations', 'FAIL', 'Anon key can read organizations — RLS may be disabled');
                }
            } else {
                check('RLS on organizations', 'PASS', `HTTP ${res.status} — access denied (correct)`);
            }
        } catch (err: any) {
            check('RLS on organizations', 'WARN', err.message);
        }

        // Test tenant_config
        try {
            const res = await supabaseFetch(supabaseUrl, anonKey, 'tenant_config?select=org_id&limit=1');
            if (res.ok) {
                const data = await res.json();
                check('RLS on tenant_config', data.length === 0 ? 'PASS' : 'WARN',
                    data.length === 0 ? 'Anon key returns empty (correct)' : 'Anon key can read tenant_config — review RLS');
            }
        } catch (err: any) {
            check('RLS on tenant_config', 'WARN', err.message);
        }
    } else {
        check('RLS tests', 'SKIP', 'VITE_SUPABASE_ANON_KEY not set — cannot test RLS');
    }
    console.log('');

    // ─── Frontend / API ────────────────────────────────────────
    console.log('[5/6] Frontend & API Routes');

    if (siteUrl) {
        // Test frontend loads
        try {
            const res = await fetch(siteUrl, { redirect: 'follow' });
            check('Frontend loads', res.ok ? 'PASS' : 'FAIL', `HTTP ${res.status}`);
        } catch (err: any) {
            check('Frontend loads', 'FAIL', err.message);
        }

        // Test health endpoint
        try {
            const res = await fetch(`${siteUrl}/api/health`);
            check('API /health', res.ok ? 'PASS' : 'FAIL', `HTTP ${res.status}`);
        } catch (err: any) {
            check('API /health', 'WARN', err.message);
        }
    } else {
        check('Frontend & API tests', 'SKIP', 'PUBLIC_SITE_URL not set — cannot test');
    }
    console.log('');

    // ─── Stripe ────────────────────────────────────────────────
    console.log('[6/6] Stripe Integration');

    if (stripeKey) {
        const isTest = stripeKey.startsWith('sk_test_');
        check('Stripe mode', 'PASS', isTest ? 'TEST mode' : 'LIVE mode');

        try {
            const res = await fetch('https://api.stripe.com/v1/products?limit=1', {
                headers: { 'Authorization': `Bearer ${stripeKey}` },
            });
            if (res.ok) {
                const data = await res.json();
                check('Stripe API', 'PASS', `${data.data.length > 0 ? 'Products exist' : 'Connected but no products — run setup-stripe.ts'}`);
            } else {
                check('Stripe API', 'FAIL', `HTTP ${res.status}`);
            }
        } catch (err: any) {
            check('Stripe API', 'FAIL', err.message);
        }
    } else {
        check('Stripe', 'SKIP', 'STRIPE_SECRET_KEY not set');
    }
    console.log('');

    printSummary();
}

function printSummary() {
    console.log('=== SUMMARY ===\n');
    const pass = results.filter(r => r.status === 'PASS').length;
    const fail = results.filter(r => r.status === 'FAIL').length;
    const warn = results.filter(r => r.status === 'WARN').length;
    const skip = results.filter(r => r.status === 'SKIP').length;

    console.log(`  PASS: ${pass}  |  FAIL: ${fail}  |  WARN: ${warn}  |  SKIP: ${skip}`);
    console.log(`  Total: ${results.length} checks\n`);

    if (fail > 0) {
        console.log('  FAILURES:');
        results.filter(r => r.status === 'FAIL').forEach(r => {
            console.log(`    ✗ ${r.name}: ${r.detail}`);
        });
        console.log('');
    }

    if (warn > 0) {
        console.log('  WARNINGS:');
        results.filter(r => r.status === 'WARN').forEach(r => {
            console.log(`    ⚠ ${r.name}: ${r.detail}`);
        });
        console.log('');
    }

    if (fail === 0) {
        console.log('  ✓ Deployment looks good!\n');
    } else {
        console.log('  Fix the failures above and re-run this script.\n');
        process.exit(1);
    }
}

main().catch(err => {
    console.error('\nFATAL:', err.message);
    process.exit(1);
});
