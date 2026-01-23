
import { createClient } from '@supabase/supabase-js';
import { config } from 'dotenv';
config();

const supabaseUrl = process.env.VITE_SUPABASE_URL || process.env.PUBLIC_SUPABASE_URL!;
const supabaseServiceKey = process.env.VITE_SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY!;

const supabase = createClient(supabaseUrl, supabaseServiceKey);

async function setupTestData() {
    // 1. Get Thompson Profile ID
    const { data: thompson } = await supabase
        .from('profiles')
        .select('id, org_id')
        .eq('email', 'thompsonfamv@gmail.com')
        .single();

    if (!thompson) {
        console.error('Thompson profile not found');
        return;
    }

    console.log('Thompson Profile ID:', thompson.id);

    // 2. Create a specific test contact for him
    const { data: contact, error } = await supabase
        .from('contacts')
        .insert({
            name: 'Thompson Exclusive Client',
            email: 'exclusive@example.com',
            type: 'customer',
            org_id: thompson.org_id,
            assigned_rep_id: thompson.id, // THE KEY PART
            notes: 'This client should ONLY be visible to Thompson and Admin'
        })
        .select()
        .single();

    if (error) console.error('Error creating contact:', error);
    else console.log('Created Contact:', contact.name);

    // 3. Ensure overhead is set (mocking it if column exists, otherwise ignoring)
    // We try to update it. If column missing, it fails silently or errors, but good to try.
    const { error: updateError } = await supabase
        .from('profiles')
        .update({ overhead_per_unit: 4.00 }) // Trying to set the overhead
        .eq('id', thompson.id);

    if (updateError) console.log('Overhead update failed (expected if migration not applied yet):', updateError.message);
    else console.log('Overhead set to $4.00');
}

setupTestData();
