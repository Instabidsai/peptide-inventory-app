
import { createClient } from '@supabase/supabase-js';
import { config } from 'dotenv';
config();

const supabaseUrl = process.env.VITE_SUPABASE_URL || process.env.PUBLIC_SUPABASE_URL!;
const supabaseServiceKey = process.env.VITE_SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY!;

const supabase = createClient(supabaseUrl, supabaseServiceKey);

async function ensureProfile() {
    // 1. Get User ID from Auth
    const { data: { users }, error: userError } = await supabase.auth.admin.listUsers();

    if (userError) {
        console.error('Error fetching users:', userError);
        return;
    }

    const thompson = users.find(u => u.email === 'thompsonfamv@gmail.com');

    if (!thompson) {
        console.error('User thompsonfamv@gmail.com NOT FOUND in auth.users! Loop cannot be fixed without user.');
        return;
    }

    console.log('Found Thompson User ID:', thompson.id);

    // 2. Check Profile
    const { data: profile } = await supabase
        .from('profiles')
        .select('*')
        .eq('user_id', thompson.id)
        .maybeSingle();

    if (profile) {
        console.log('Profile already exists:', profile);
        // Ensure org_id is set
        if (!profile.org_id) {
            const { error: updateError } = await supabase
                .from('profiles')
                .update({
                    org_id: '33a18316-b0a4-4d85-a770-d1ceb762bd4f', // Using the Org ID found in previous steps (from Admin profile)
                    role: 'sales_rep', // Ensure role is set (assuming migration passed, or 'staff' if not)
                    full_name: 'Justin Thompson'
                })
                .eq('user_id', thompson.id);
            console.log('Updated profile org_id:', updateError || 'Success');
        }
    } else {
        console.log('Creating missing profile...');
        const { error: insertError } = await supabase
            .from('profiles')
            .insert({
                user_id: thompson.id,
                email: 'thompsonfamv@gmail.com',
                full_name: 'Justin Thompson',
                org_id: '33a18316-b0a4-4d85-a770-d1ceb762bd4f', // Hardcoded ID from Admin profile
                role: 'sales_rep' // Ideally sales_rep, fallback to staff if enum fails
            });

        if (insertError) {
            console.error('Error creating profile. Trying fallback role...', insertError);
            // Fallback to 'staff' if 'sales_rep' enum fails
            const { error: retryError } = await supabase
                .from('profiles')
                .insert({
                    user_id: thompson.id,
                    email: 'thompsonfamv@gmail.com',
                    full_name: 'Justin Thompson',
                    org_id: '33a18316-b0a4-4d85-a770-d1ceb762bd4f',
                    role: 'staff'
                });
            console.log('Retry result:', retryError || 'Success');
        } else {
            console.log('Profile created successfully!');
        }
    }

    // 3. Ensure User Role (redundant but safe)
    const { error: roleError } = await supabase
        .from('user_roles')
        .upsert({
            user_id: thompson.id,
            org_id: '33a18316-b0a4-4d85-a770-d1ceb762bd4f',
            role: 'sales_rep'
        }, { onConflict: 'user_id, org_id' });

    if (roleError) console.log('Role upsert error (likely enum issue, retrying as staff):', roleError);
    if (roleError) {
        await supabase
            .from('user_roles')
            .upsert({
                user_id: thompson.id,
                org_id: '33a18316-b0a4-4d85-a770-d1ceb762bd4f',
                role: 'staff' // Fallback
            }, { onConflict: 'user_id, org_id' });
    }
}

ensureProfile();
