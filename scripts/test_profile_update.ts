import dotenv from 'dotenv';
dotenv.config();

import { createClient } from '@supabase/supabase-js';

const sbUrl = process.env.VITE_SUPABASE_URL!;
const sbServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;
const sbAnonKey = process.env.VITE_SUPABASE_ANON_KEY!;

async function test() {
    // 1. First, list all profiles with role = sales_rep using SERVICE KEY (bypasses RLS)
    const adminClient = createClient(sbUrl, sbServiceKey);

    console.log('=== Fetching all sales_rep profiles ===');
    const { data: reps, error: repsError } = await adminClient
        .from('profiles')
        .select('id, full_name, commission_rate, partner_tier, parent_rep_id, price_multiplier, role')
        .eq('role', 'sales_rep');

    if (repsError) {
        console.error('Error fetching reps:', repsError);
        return;
    }

    console.log('Found reps:', JSON.stringify(reps, null, 2));

    if (!reps || reps.length === 0) {
        console.log('No sales reps found. Trying ALL profiles...');
        const { data: allProfiles } = await adminClient
            .from('profiles')
            .select('id, full_name, commission_rate, partner_tier, parent_rep_id, role');
        console.log('All profiles:', JSON.stringify(allProfiles, null, 2));
        return;
    }

    // 2. Try updating the first rep's commission_rate using SERVICE KEY
    const testRep = reps[0];
    console.log(`\n=== Testing update on ${testRep.full_name} (${testRep.id}) ===`);
    console.log(`Current commission_rate: ${testRep.commission_rate}`);

    const { data: updated, error: updateError } = await adminClient
        .from('profiles')
        .update({ commission_rate: 0.10 })
        .eq('id', testRep.id)
        .select();

    if (updateError) {
        console.error('Service key update ERROR:', updateError);
    } else {
        console.log('Service key update SUCCESS:', updated);
    }

    // 3. Now try the SAME update with ANON KEY (simulates what the frontend does)
    const anonClient = createClient(sbUrl, sbAnonKey);

    const { data: anonUpdate, error: anonError } = await anonClient
        .from('profiles')
        .update({ commission_rate: 0.10 })
        .eq('id', testRep.id)
        .select();

    if (anonError) {
        console.error('Anon key update ERROR:', anonError);
    } else if (!anonUpdate || anonUpdate.length === 0) {
        console.error('Anon key update BLOCKED by RLS (0 rows returned)');
        console.log('\n>>> FIX: Need to add an UPDATE policy for admin users on profiles table');
    } else {
        console.log('Anon key update SUCCESS:', anonUpdate);
    }

    // 4. Check column existence  
    console.log('\n=== Column check ===');
    const { data: colCheck, error: colError } = await adminClient
        .from('profiles')
        .select('commission_rate, partner_tier, parent_rep_id, price_multiplier')
        .limit(1);

    if (colError) {
        console.error('Column check ERROR (columns may not exist):', colError.message);
    } else {
        console.log('Columns exist! Sample:', colCheck);
    }
}

test().catch(console.error);
