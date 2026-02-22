/**
 * Stripe Product & Price Setup Script
 * ====================================
 * Creates Stripe Products + Prices for subscription plans,
 * then updates the subscription_plans table with the Stripe Price IDs.
 *
 * Prerequisites:
 *   - subscription_plans table seeded (run seed-subscription-plans.sql first)
 *   - Environment variables set:
 *       STRIPE_SECRET_KEY=sk_test_... or sk_live_...
 *       SUPABASE_URL=https://YOUR_PROJECT.supabase.co
 *       SUPABASE_SERVICE_ROLE_KEY=eyJ...
 *
 * Usage:
 *   npx tsx scripts/setup-stripe.ts
 *
 * What it does:
 *   1. Reads subscription_plans from Supabase
 *   2. Creates a Stripe Product for each plan
 *   3. Creates monthly + yearly Stripe Prices for each plan
 *   4. Updates subscription_plans with the Stripe Price IDs
 *   5. Prints a summary
 */

const STRIPE_API = 'https://api.stripe.com/v1';

interface Plan {
    id: string;
    name: string;
    display_name: string;
    price_monthly: number;  // cents
    price_yearly: number;   // cents
    features: string[];
}

async function stripePost(endpoint: string, params: Record<string, string>, secretKey: string) {
    const body = new URLSearchParams(params);
    const res = await fetch(`${STRIPE_API}${endpoint}`, {
        method: 'POST',
        headers: {
            'Authorization': `Bearer ${secretKey}`,
            'Content-Type': 'application/x-www-form-urlencoded',
        },
        body: body.toString(),
    });
    if (!res.ok) {
        const err = await res.text();
        throw new Error(`Stripe ${endpoint} failed (${res.status}): ${err}`);
    }
    return res.json();
}

async function main() {
    const stripeKey = process.env.STRIPE_SECRET_KEY;
    const supabaseUrl = process.env.SUPABASE_URL;
    const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

    if (!stripeKey) {
        console.error('ERROR: STRIPE_SECRET_KEY not set');
        process.exit(1);
    }
    if (!supabaseUrl || !supabaseKey) {
        console.error('ERROR: SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY must be set');
        process.exit(1);
    }

    const isTest = stripeKey.startsWith('sk_test_');
    console.log(`\n--- Stripe Setup (${isTest ? 'TEST' : 'LIVE'} mode) ---\n`);

    // 1. Fetch plans from Supabase
    const plansRes = await fetch(`${supabaseUrl}/rest/v1/subscription_plans?select=*&order=sort_order`, {
        headers: {
            'apikey': supabaseKey,
            'Authorization': `Bearer ${supabaseKey}`,
        },
    });
    if (!plansRes.ok) {
        console.error('Failed to fetch plans from Supabase:', await plansRes.text());
        process.exit(1);
    }
    const plans: Plan[] = await plansRes.json();
    console.log(`Found ${plans.length} subscription plans in database\n`);

    const results: Array<{
        plan: string;
        product_id: string;
        monthly_price_id: string | null;
        yearly_price_id: string | null;
    }> = [];

    for (const plan of plans) {
        console.log(`[${plan.display_name}] Creating Stripe Product...`);

        // Skip free plan (no Stripe product needed, but create for tracking)
        const isFree = plan.price_monthly === 0 && plan.price_yearly === 0;

        // 2. Create Stripe Product
        const product = await stripePost('/products', {
            name: plan.display_name,
            description: `ThePeptideAI ${plan.display_name} Plan`,
            'metadata[plan_name]': plan.name,
            'metadata[plan_id]': plan.id,
        }, stripeKey);
        console.log(`  Product: ${product.id}`);

        let monthlyPriceId: string | null = null;
        let yearlyPriceId: string | null = null;

        if (!isFree) {
            // 3. Create monthly price
            if (plan.price_monthly > 0) {
                const monthlyPrice = await stripePost('/prices', {
                    product: product.id,
                    unit_amount: String(plan.price_monthly),
                    currency: 'usd',
                    'recurring[interval]': 'month',
                    'metadata[plan_name]': plan.name,
                    'metadata[billing_period]': 'monthly',
                }, stripeKey);
                monthlyPriceId = monthlyPrice.id;
                console.log(`  Monthly: ${monthlyPriceId} ($${(plan.price_monthly / 100).toFixed(2)}/mo)`);
            }

            // 4. Create yearly price
            if (plan.price_yearly > 0) {
                const yearlyPrice = await stripePost('/prices', {
                    product: product.id,
                    unit_amount: String(plan.price_yearly),
                    currency: 'usd',
                    'recurring[interval]': 'year',
                    'metadata[plan_name]': plan.name,
                    'metadata[billing_period]': 'yearly',
                }, stripeKey);
                yearlyPriceId = yearlyPrice.id;
                console.log(`  Yearly:  ${yearlyPriceId} ($${(plan.price_yearly / 100).toFixed(2)}/yr)`);
            }
        } else {
            console.log('  (Free plan — no prices created)');
        }

        // 5. Update Supabase subscription_plans with Stripe IDs
        const updateRes = await fetch(
            `${supabaseUrl}/rest/v1/subscription_plans?id=eq.${plan.id}`,
            {
                method: 'PATCH',
                headers: {
                    'apikey': supabaseKey,
                    'Authorization': `Bearer ${supabaseKey}`,
                    'Content-Type': 'application/json',
                    'Prefer': 'return=minimal',
                },
                body: JSON.stringify({
                    stripe_monthly_price_id: monthlyPriceId,
                    stripe_yearly_price_id: yearlyPriceId,
                }),
            }
        );
        if (!updateRes.ok) {
            console.error(`  WARNING: Failed to update plan in DB:`, await updateRes.text());
        } else {
            console.log('  Database updated ✓');
        }

        results.push({
            plan: plan.display_name,
            product_id: product.id,
            monthly_price_id: monthlyPriceId,
            yearly_price_id: yearlyPriceId,
        });

        console.log('');
    }

    // Summary
    console.log('=== SUMMARY ===\n');
    console.table(results);
    console.log('\nDone! Stripe products and prices are linked to your subscription plans.');
    console.log('Next steps:');
    console.log('  1. Set STRIPE_WEBHOOK_SECRET in your Vercel env vars');
    console.log('  2. Add webhook endpoint in Stripe Dashboard:');
    console.log('     URL: https://your-domain.com/api/webhooks/stripe');
    console.log('     Events: checkout.session.completed, customer.subscription.updated,');
    console.log('             customer.subscription.deleted, invoice.payment_succeeded,');
    console.log('             invoice.payment_failed');
}

main().catch(err => {
    console.error('\nFATAL:', err.message);
    process.exit(1);
});
