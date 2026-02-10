import { createClient } from '@supabase/supabase-js';

const supabaseUrl = 'https://mckkegmkpqdicudnfhor.supabase.co';
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || '';

const supabase = createClient(supabaseUrl, supabaseKey);

async function diagnose() {
    console.log('=== COMMISSION DIAGNOSTIC ===\n');

    // 1. Find Brad
    const { data: brads, error: bradErr } = await supabase
        .from('contacts')
        .select('id, name, assigned_rep_id, type, notes')
        .ilike('name', '%brad%');

    console.log('1. BRAD CONTACT(S):', JSON.stringify(brads, null, 2));
    if (bradErr) console.log('   ERROR:', bradErr.message);

    // 2. Find D Coach
    const { data: dcoach, error: dcErr } = await supabase
        .from('profiles')
        .select('id, full_name, role, parent_rep_id, credit_balance, commission_rate')
        .ilike('full_name', '%coach%');

    console.log('\n2. D COACH PROFILE(S):', JSON.stringify(dcoach, null, 2));
    if (dcErr) console.log('   ERROR:', dcErr.message);

    // 3. Find Don
    const { data: don, error: donErr } = await supabase
        .from('profiles')
        .select('id, full_name, role, parent_rep_id, credit_balance')
        .ilike('full_name', '%don%');

    console.log('\n3. DON PROFILE(S):', JSON.stringify(don, null, 2));
    if (donErr) console.log('   ERROR:', donErr.message);

    // 4. All profiles with role = sales_rep
    const { data: allReps } = await supabase
        .from('profiles')
        .select('id, full_name, role, parent_rep_id')
        .in('role', ['sales_rep', 'senior_rep', 'admin']);

    console.log('\n4. ALL REPS/ADMINS:', JSON.stringify(allReps, null, 2));

    // 5. Check commissions table  
    const { data: comms, error: commErr } = await supabase
        .from('commissions')
        .select('*')
        .order('created_at', { ascending: false })
        .limit(5);

    console.log('\n5. RECENT COMMISSIONS:', JSON.stringify(comms, null, 2));
    if (commErr) console.log('   ERROR:', commErr.message);

    // 6. Check sales_orders table
    const { data: orders, error: orderErr } = await supabase
        .from('sales_orders')
        .select('*')
        .order('created_at', { ascending: false })
        .limit(5);

    console.log('\n6. RECENT SALES ORDERS:', JSON.stringify(orders, null, 2));
    if (orderErr) console.log('   ERROR:', orderErr.message);

    // 7. Check if Brad's assigned_rep_id points to a valid profile
    if (brads && brads.length > 0) {
        for (const brad of brads) {
            if (brad.assigned_rep_id) {
                const { data: repProfile } = await supabase
                    .from('profiles')
                    .select('id, full_name, role, parent_rep_id')
                    .eq('id', brad.assigned_rep_id)
                    .single();
                console.log(`\n7. Brad's rep (${brad.assigned_rep_id}):`, JSON.stringify(repProfile, null, 2));
            } else {
                console.log(`\n7. ❌ Brad (${brad.id}) has NO assigned_rep_id — THIS IS THE BUG`);
            }
        }
    }
}

diagnose().catch(console.error);
