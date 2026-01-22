import { createClient } from '@supabase/supabase-js';
import { config } from 'dotenv';

// Load environment variables
config();

const supabaseUrl = process.env.PUBLIC_SUPABASE_URL!;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;

if (!supabaseUrl || !supabaseServiceKey) {
    console.error('❌ Missing environment variables!');
    console.error('Make sure your .env file has:');
    console.error('  - PUBLIC_SUPABASE_URL');
    console.error('  - SUPABASE_SERVICE_ROLE_KEY');
    process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseServiceKey, {
    auth: {
        autoRefreshToken: false,
        persistSession: false
    }
});

async function createThompsonPartner() {
    try {
        console.log('Creating Thompson as a Partner...\n');

        // Get your org_id first
        const { data: profile } = await supabase
            .from('profiles')
            .select('org_id')
            .eq('email', 'jjthompsonfau@gmail.com')
            .single();

        if (!profile?.org_id) {
            throw new Error('Could not find your org_id');
        }

        const orgId = profile.org_id;
        console.log(`Using org_id: ${orgId}`);

        // Create Thompson's auth account
        const { data: authData, error: authError } = await supabase.auth.admin.createUser({
            email: 'thompson@test.com',
            password: 'Test123!',
            email_confirm: true,
            user_metadata: {
                full_name: 'Thompson Partner'
            }
        });

        if (authError) {
            if (authError.message.includes('already registered')) {
                console.log('⚠️  Thompson account already exists, updating...');
                // Get existing user
                const { data: users } = await supabase.auth.admin.listUsers();
                const existing = users.users.find(u => u.email === 'thompson@test.com');

                if (existing) {
                    // Update profile to sales_rep
                    const { error: updateError } = await supabase
                        .from('profiles')
                        .update({
                            role: 'sales_rep',
                            commission_rate: 0.10,
                            price_multiplier: 1.0
                        })
                        .eq('user_id', existing.id);

                    if (updateError) throw updateError;
                    console.log('✓ Updated Thompson to Partner role');
                }
            } else {
                throw authError;
            }
        } else {
            console.log(`✓ Created auth user: ${authData.user.id}`);

            // Create profile with sales_rep role
            const { error: profileError } = await supabase
                .from('profiles')
                .insert({
                    user_id: authData.user.id,
                    org_id: orgId,
                    email: 'thompson@test.com',
                    full_name: 'Thompson Partner',
                    role: 'sales_rep',
                    commission_rate: 0.10, // 10% commission
                    price_multiplier: 1.0
                });

            if (profileError) throw profileError;
            console.log('✓ Created profile with sales_rep role');
        }

        console.log('\n✅ SUCCESS! Thompson is now a Partner');
        console.log('\nLogin Credentials:');
        console.log('  Email: thompson@test.com');
        console.log('  Password: Test123!');
        console.log('\nNext Steps:');
        console.log('  1. Open a private/incognito window');
        console.log('  2. Go to http://localhost:4550/auth');
        console.log('  3. Login as Thompson');
        console.log('  4. You\'ll see the Partner Portal!');

    } catch (error) {
        console.error('❌ Error:', error);
    }
}

createThompsonPartner();
