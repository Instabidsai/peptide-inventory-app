import { createClient } from '@supabase/supabase-js';

const supabaseUrl = 'https://mckkegmkpqdicudnfhor.supabase.co';
const supabaseServiceKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im1ja2tlZ21rcHFkaWN1ZG5maG9yIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc2ODQ5MjExNywiZXhwIjoyMDg0MDY4MTE3fQ.s8M-RGqK_8tqdFpfUa_ZNckZ7p1EMdvi-1vcXH8oFn4';

const supabase = createClient(supabaseUrl, supabaseServiceKey, {
    auth: {
        autoRefreshToken: false,
        persistSession: false
    }
});

async function createAdminUser() {
    console.log('Setting up admin user...');

    const email = 'ADMIN@nextgenresearchlabs.com';
    const password = '123abc';

    try {
        // 1. Get existing user by email
        const { data: { users }, error: listError } = await supabase.auth.admin.listUsers();

        if (listError) throw listError;

        const existingUser = users.find(u => u.email?.toLowerCase() === email.toLowerCase());

        if (!existingUser) {
            console.log('User not found, creating new one...');
            const { data: authData, error: authError } = await supabase.auth.admin.createUser({
                email,
                password,
                email_confirm: true
            });

            if (authError) throw authError;
            console.log('✅ Auth user created:', authData.user.id);
        } else {
            console.log('✅ User exists:', existingUser.id);

            // Reset password
            const { error: pwError } = await supabase.auth.admin.updateUserById(
                existingUser.id,
                { password }
            );

            if (pwError) throw pwError;
            console.log('✅ Password updated');
        }

        const userId = existingUser?.id || (await supabase.auth.admin.listUsers()).data.users.find(u => u.email === email)?.id;

        // 2. Get the organization ID
        const { data: orgData } = await supabase
            .from('organizations')
            .select('id')
            .eq('name', 'NextGen Research Labs')
            .single();

        const orgId = orgData?.id;
        console.log('Organization ID:', orgId);

        // 3. Update profile with admin role
        const { error: profileError } = await supabase
            .from('profiles')
            .upsert({
                user_id: userId,
                email: email,
                role: 'admin'
            }, {
                onConflict: 'user_id'
            });

        if (profileError) {
            console.error('Profile error:', profileError);
            throw profileError;
        }

        console.log('✅ Profile updated with admin role');
        console.log('\n🎉 Admin user ready!');
        console.log(`Email: ${email}`);
        console.log(`Password: ${password}`);
        console.log(`Role: admin`);

    } catch (error) {
        console.error('❌ Failed:', error);
    }
}

createAdminUser();
