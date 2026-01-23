import { createClient } from '@supabase/supabase-js';

const supabaseUrl = 'https://mckkegmkpqdicudnfhor.supabase.co';
const supabaseServiceKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im1ja2tlZ21rcHFkaWN1ZG5maG9yIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc2ODQ5MjExNywiZXhwIjoyMDg0MDY4MTE3fQ.s8M-RGqK_8tqdFpfUa_ZNckZ7p1EMdvi-1vcXH8oFn4';


const supabase = createClient(supabaseUrl, supabaseServiceKey, {
    auth: {
        autoRefreshToken: false,
        persistSession: false
    }
});

async function createDonPartner() {
    try {
        console.log('Creating Don as a Partner...\n');

        // Get your org_id first - assuming from existing admin or hardcoded fallback if needed
        // We try to find the main admin first
        const { data: profile } = await supabase
            .from('profiles')
            .select('org_id')
            .eq('role', 'admin')
            .limit(1)
            .single();

        let orgId = profile?.org_id;

        if (!orgId) {
            console.log('Could not find an admin profile to inherit org_id from. Checking for specific user...');
            const { data: specificProfile } = await supabase
                .from('profiles')
                .select('org_id')
                .eq('email', 'jjthompsonfau@gmail.com')
                .single();
            orgId = specificProfile?.org_id;
        }

        if (!orgId) {
            console.error('❌ Could not determine org_id. Aborting.');
            return;
        }

        console.log(`Using org_id: ${orgId}`);

        // Create Don's auth account
        const email = 'Dzlby111@yahoo.com';
        const password = 'Don123!';
        const fullName = 'Don';

        let userId;

        console.log(`Attempting to create user: ${email}`);

        const { data: authData, error: authError } = await supabase.auth.admin.createUser({
            email,
            password,
            email_confirm: true,
            user_metadata: {
                full_name: fullName
            }
        });

        if (authError) {
            if (authError.code === 'email_exists' || authError.message?.includes('already registered')) {
                console.log('⚠️  Account already exists, retrieving existing user ID...');
                const { data: users } = await supabase.auth.admin.listUsers();
                const existing = users.users.find(u => u.email?.toLowerCase() === email.toLowerCase());

                if (!existing) {
                    throw new Error('Could not find existing user despite email match!');
                }
                userId = existing.id;
                console.log(`Found existing user ID: ${userId}`);
            } else {
                throw authError; // Some other error
            }
        } else {
            console.log(`✓ Created auth user: ${authData.user.id}`);
            userId = authData.user.id;
        }

        // Upsert profile (idempotent)
        if (userId) {
            console.log('Upserting profile...');
            const { error: profileError } = await supabase
                .from('profiles')
                .upsert({
                    user_id: userId,
                    org_id: orgId,
                    email: email,
                    full_name: fullName,
                    role: 'sales_rep'
                }, { onConflict: 'user_id' });

            if (profileError) {
                console.log('❌ Profile Upsert Error:', profileError);
                console.log('Attempting simple Update as fallback...');
                const { error: updateError } = await supabase
                    .from('profiles')
                    .update({
                        role: 'sales_rep',
                        full_name: fullName
                    })
                    .eq('user_id', userId);

                if (updateError) throw updateError;
            }

            console.log('✓ Profile configured with sales_rep role');
        }

        console.log('\n✅ SUCCESS! Don is now a Partner');
        console.log(`  Email: ${email}`);
        console.log(`  Password: ${password}`);

    } catch (error) {
        console.error('❌ Error:', error);
    }
}

createDonPartner();
