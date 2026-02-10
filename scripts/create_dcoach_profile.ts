import dotenv from 'dotenv';
dotenv.config();

import { createClient } from '@supabase/supabase-js';

const sb = createClient(
    process.env.VITE_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
);

async function createDCoachProfile() {
    const email = 'Test@test.com';
    const contactId = 'cba0563f-cbdf-43b0-8557-8d64f4931c9d';
    const donId = '2cd0fd2f-6ba2-48a6-8913-554c4cf9dd63';
    const orgId = '33a18316-b0a4-4d85-a770-d1ceb762bd4f';

    // 1) Try to create user
    const { data: userData, error: createErr } = await sb.auth.admin.createUser({
        email,
        email_confirm: true,
        user_metadata: { role: 'sales_rep' }
    });

    let userId: string;

    if (createErr) {
        console.log('Create user:', createErr.message);
        // Find existing user
        const { data: { users } } = await sb.auth.admin.listUsers();
        const found = users.find(u => u.email?.toLowerCase() === email.toLowerCase());
        if (!found) { console.error('User not found!'); return; }
        userId = found.id;
        console.log('Found existing user:', userId);
    } else {
        userId = userData.user.id;
        console.log('Created new user:', userId);
    }

    // 2) Check if profile exists
    const { data: existing } = await sb.from('profiles').select('id').eq('user_id', userId).single();

    if (existing) {
        console.log('Profile exists, updating...');
        const { error } = await sb.from('profiles').update({
            role: 'sales_rep',
            parent_rep_id: donId,
            commission_rate: 0.10,
            partner_tier: 'standard',
            full_name: 'D Coach',
        }).eq('id', existing.id);
        console.log('Update result:', error || 'OK');
    } else {
        console.log('No profile, inserting...');
        const { error } = await sb.from('profiles').insert({
            user_id: userId,
            full_name: 'D Coach',
            email: email,
            role: 'sales_rep',
            commission_rate: 0.10,
            partner_tier: 'standard',
            parent_rep_id: donId,
            org_id: orgId,
            credit_balance: 0,
            overhead_per_unit: 4.00,
        });
        console.log('Insert result:', error || 'OK');
    }

    // 3) Link contact
    await sb.from('contacts').update({ linked_user_id: userId }).eq('id', contactId);
    console.log('Linked contact to user');

    // 4) Verify
    const { data: allReps } = await sb.from('profiles')
        .select('id, full_name, role, parent_rep_id, partner_tier, commission_rate')
        .eq('role', 'sales_rep');
    console.log('\nAll partners now:');
    console.log(JSON.stringify(allReps, null, 2));
}

createDCoachProfile().catch(console.error);
