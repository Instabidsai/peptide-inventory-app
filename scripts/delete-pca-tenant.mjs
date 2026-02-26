#!/usr/bin/env node
/**
 * Delete PCA (Pure Chain Aminos) tenant data for re-onboarding test.
 * Uses Supabase JS client with service role key (bypasses RLS).
 *
 * Usage: npx tsx scripts/delete-pca-tenant.mjs
 */

import 'dotenv/config';
import { createClient } from '@supabase/supabase-js';

const PCA_ORG_ID = '3b77bcc8-1939-4e59-b11c-3e13844e9be6';
const PCA_USER_ID = '7b0f3786-2649-474e-aec8-f812edfc2923';

const SUPABASE_URL = process.env.VITE_SUPABASE_URL;
const SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!SUPABASE_URL || !SERVICE_ROLE_KEY) {
    console.error('Missing VITE_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY in .env');
    process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, {
    auth: { autoRefreshToken: false, persistSession: false }
});

async function deleteFrom(table, column, value) {
    const { error, count } = await supabase
        .from(table)
        .delete({ count: 'exact' })
        .eq(column, value);

    if (error) {
        // Table might not exist or column mismatch — log but continue
        console.log(`  ${table}: SKIP — ${error.message}`);
        return 0;
    }
    console.log(`  ${table}: ${count ?? 0} rows deleted`);
    return count ?? 0;
}

async function main() {
    // Verify org exists
    const { data: org } = await supabase
        .from('organizations')
        .select('id, name')
        .eq('id', PCA_ORG_ID)
        .maybeSingle();

    if (!org) {
        console.log('PCA org not found — already deleted or wrong ID.');
        return;
    }

    console.log(`Found org: "${org.name}" (${org.id})`);
    console.log('Deleting in FK-safe order...\n');

    // Step 1: Delete from child tables first (FK-safe order)
    await deleteFrom('tenant_subscriptions', 'org_id', PCA_ORG_ID);
    await deleteFrom('org_features', 'org_id', PCA_ORG_ID);

    // Delete peptide_pricing for PCA's peptides
    const { data: peptides } = await supabase
        .from('peptides')
        .select('id')
        .eq('org_id', PCA_ORG_ID);

    if (peptides?.length) {
        const ids = peptides.map(p => p.id);
        const { error } = await supabase
            .from('peptide_pricing')
            .delete()
            .in('peptide_id', ids);
        console.log(`  peptide_pricing: ${error ? `SKIP — ${error.message}` : 'cleared for PCA peptides'}`);
    }

    await deleteFrom('peptides', 'org_id', PCA_ORG_ID);
    await deleteFrom('pricing_tiers', 'org_id', PCA_ORG_ID);
    await deleteFrom('user_roles', 'org_id', PCA_ORG_ID);

    // Unlink profiles (set org_id = null, don't delete the profile row)
    const { error: profileErr } = await supabase
        .from('profiles')
        .update({ org_id: null, role: null })
        .eq('org_id', PCA_ORG_ID);
    console.log(`  profiles: ${profileErr ? `ERROR — ${profileErr.message}` : 'unlinked from org'}`);

    await deleteFrom('tenant_config', 'org_id', PCA_ORG_ID);
    await deleteFrom('organizations', 'id', PCA_ORG_ID);

    console.log('\nDatabase cleanup complete.');

    // Delete auth user
    console.log('\nDeleting auth user...');
    const { error: authErr } = await supabase.auth.admin.deleteUser(PCA_USER_ID);
    if (authErr) {
        console.error(`  Auth user delete failed: ${authErr.message}`);
        console.log(`  Manually delete from Supabase dashboard → Authentication → Users`);
    } else {
        console.log(`  Auth user ${PCA_USER_ID} deleted.`);
    }

    console.log('\n✅ PCA tenant fully removed. Ready for re-onboarding test.');
    console.log(`\nTo re-test, go to:`);
    console.log(`  https://app.thepeptideai.com/#/auth?signup=merchant`);
    console.log(`  (or http://localhost:4550/#/auth?signup=merchant)`);
}

main().catch(err => {
    console.error('Fatal error:', err);
    process.exit(1);
});
