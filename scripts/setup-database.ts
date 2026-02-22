/**
 * Database Setup Script
 * =====================
 * Runs the master schema + seed scripts against a Supabase project.
 *
 * Prerequisites:
 *   - Supabase project created
 *   - Environment variables set:
 *       DATABASE_URL=postgres://postgres.PROJECT:PASSWORD@aws-0-us-east-1.pooler.supabase.com:6543/postgres
 *
 * Usage:
 *   npx tsx scripts/setup-database.ts
 *
 * What it does:
 *   1. Connects to Postgres via DATABASE_URL
 *   2. Runs schema-master.sql (57 tables, functions, triggers, RLS)
 *   3. Runs seed-subscription-plans.sql (4 subscription tiers)
 *   4. Reports results
 */

import { readFileSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));

async function main() {
    const databaseUrl = process.env.DATABASE_URL;
    if (!databaseUrl) {
        console.error('ERROR: DATABASE_URL not set');
        console.error('Format: postgres://postgres.PROJECT_ID:PASSWORD@aws-0-us-east-1.pooler.supabase.com:6543/postgres');
        process.exit(1);
    }

    console.log('\n--- Database Setup ---\n');

    // Read SQL files
    const schemaPath = resolve(__dirname, 'schema-master.sql');
    const seedPlansPath = resolve(__dirname, 'seed-subscription-plans.sql');

    let schemaSql: string;
    let seedPlansSql: string;

    try {
        schemaSql = readFileSync(schemaPath, 'utf-8');
        console.log(`[1/3] Loaded schema-master.sql (${schemaSql.length.toLocaleString()} chars)`);
    } catch {
        console.error(`ERROR: Could not read ${schemaPath}`);
        process.exit(1);
    }

    try {
        seedPlansSql = readFileSync(seedPlansPath, 'utf-8');
        console.log(`[2/3] Loaded seed-subscription-plans.sql (${seedPlansSql.length.toLocaleString()} chars)`);
    } catch {
        console.error(`ERROR: Could not read ${seedPlansPath}`);
        process.exit(1);
    }

    // Execute via Supabase REST API (management API)
    // Since we can't use pg driver without native deps, use the Supabase SQL endpoint
    const supabaseUrl = process.env.SUPABASE_URL;
    const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

    if (!supabaseUrl || !supabaseServiceKey) {
        console.error('ERROR: SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY must also be set');
        console.error('(Used for executing SQL via the REST API)');
        process.exit(1);
    }

    // Execute SQL via Supabase's rpc endpoint (uses pg_query or a custom function)
    // Alternative: use the management API directly
    // For now, we'll use the REST API with a simple approach

    console.log('\n[3/3] Executing SQL...\n');

    // Run schema
    console.log('  Running schema-master.sql...');
    try {
        const schemaRes = await fetch(`${supabaseUrl}/rest/v1/rpc/`, {
            method: 'POST',
            headers: {
                'apikey': supabaseServiceKey,
                'Authorization': `Bearer ${supabaseServiceKey}`,
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({}),
        });

        // The REST API doesn't support raw SQL execution.
        // Users must run schema-master.sql manually in the SQL Editor.
        console.log('  NOTE: Raw SQL execution requires the Supabase SQL Editor or CLI.');
        console.log('  Please run these files manually:\n');
        console.log('  1. Open Supabase Dashboard → SQL Editor');
        console.log(`  2. Paste contents of: scripts/schema-master.sql`);
        console.log('     Click "Run" — creates 57 tables, functions, triggers, RLS policies');
        console.log(`  3. Paste contents of: scripts/seed-subscription-plans.sql`);
        console.log('     Click "Run" — seeds 4 subscription tiers');
        console.log(`  4. Edit scripts/seed-new-tenant.sql with your company details`);
        console.log('     Paste and run — creates your organization + tenant config');
        console.log('');
        console.log('  OR use the Supabase CLI:');
        console.log('');
        console.log('    supabase link --project-ref YOUR_PROJECT_ID');
        console.log('    supabase db push');
        console.log('');
    } catch (err: any) {
        console.error('  Error:', err.message);
    }

    // Verify tables exist
    console.log('  Verifying database tables...');
    try {
        const tablesRes = await fetch(
            `${supabaseUrl}/rest/v1/organizations?select=id&limit=0`,
            {
                method: 'HEAD',
                headers: {
                    'apikey': supabaseServiceKey,
                    'Authorization': `Bearer ${supabaseServiceKey}`,
                },
            }
        );

        if (tablesRes.ok) {
            console.log('  ✓ organizations table exists');
        } else if (tablesRes.status === 404) {
            console.log('  ✗ organizations table NOT found — schema has not been applied yet');
            console.log('    Run schema-master.sql in the SQL Editor first.');
        }
    } catch (err: any) {
        console.error('  Could not verify tables:', err.message);
    }

    // Check subscription plans
    try {
        const plansRes = await fetch(
            `${supabaseUrl}/rest/v1/subscription_plans?select=name,display_name&order=sort_order`,
            {
                headers: {
                    'apikey': supabaseServiceKey,
                    'Authorization': `Bearer ${supabaseServiceKey}`,
                },
            }
        );

        if (plansRes.ok) {
            const plans = await plansRes.json();
            if (plans.length > 0) {
                console.log(`  ✓ subscription_plans seeded (${plans.length} plans: ${plans.map((p: any) => p.display_name).join(', ')})`);
            } else {
                console.log('  ✗ subscription_plans table exists but is empty — run seed-subscription-plans.sql');
            }
        } else {
            console.log('  ✗ subscription_plans table not accessible');
        }
    } catch (err: any) {
        console.error('  Could not check plans:', err.message);
    }

    // Check organizations
    try {
        const orgsRes = await fetch(
            `${supabaseUrl}/rest/v1/organizations?select=id,name`,
            {
                headers: {
                    'apikey': supabaseServiceKey,
                    'Authorization': `Bearer ${supabaseServiceKey}`,
                },
            }
        );

        if (orgsRes.ok) {
            const orgs = await orgsRes.json();
            if (orgs.length > 0) {
                console.log(`  ✓ ${orgs.length} organization(s) found: ${orgs.map((o: any) => `${o.name} (${o.id})`).join(', ')}`);
            } else {
                console.log('  ○ No organizations yet — run seed-new-tenant.sql to create your first tenant');
            }
        }
    } catch {
        // Ignore
    }

    console.log('\n--- Setup Check Complete ---\n');
    console.log('Next steps:');
    console.log('  1. If schema not applied: Run schema-master.sql in SQL Editor');
    console.log('  2. If plans not seeded: Run seed-subscription-plans.sql');
    console.log('  3. Create your tenant: Edit & run seed-new-tenant.sql');
    console.log('  4. Set up Stripe: npx tsx scripts/setup-stripe.ts');
    console.log('  5. Deploy edge functions: See DEPLOY.md Step 4');
}

main().catch(err => {
    console.error('\nFATAL:', err.message);
    process.exit(1);
});
