
import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const envPath = path.resolve(__dirname, '../.env');

dotenv.config({ path: envPath });

// Hardcoded for reliability
const supabaseUrl = "https://mckkegmkpqdicudnfhor.supabase.co";
const supabaseKey = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im1ja2tlZ21rcHFkaWN1ZG5maG9yIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc2ODQ5MjExNywiZXhwIjoyMDg0MDY4MTE3fQ.s8M-RGqK_8tqdFpfUa_ZNckZ7p1EMdvi-1vcXH8oFn4";

const supabase = createClient(supabaseUrl, supabaseKey);

async function fixProfile(email: string) {
    console.log(`Fixing profile for: ${email}`);

    // 1. Get User
    const { data: { users }, error: userError } = await supabase.auth.admin.listUsers();
    const user = users?.find(u => u.email === email);

    if (!user) {
        console.error('User not found');
        return;
    }
    console.log(`User ID: ${user.id}`);

    // 2. Get Org ID (we know it exists from previous step, or we find it)
    const { data: roles } = await supabase
        .from('user_roles')
        .select('org_id')
        .eq('user_id', user.id)
        .single();

    if (!roles?.org_id) {
        console.error('No role/org found for user. Run fix_admin first.');
        return;
    }
    const orgId = roles.org_id;
    console.log(`Found Org ID from roles: ${orgId}`);

    // 3. Update Profile
    const { error: updateError } = await supabase
        .from('profiles')
        .update({ org_id: orgId })
        .eq('user_id', user.id);

    if (updateError) console.error('Profile Update Error:', updateError);
    else console.log('Profile updated successfully with Org ID.');
}

fixProfile('admin@nextgenresearchlabs.com');
