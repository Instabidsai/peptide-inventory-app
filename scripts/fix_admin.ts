
import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const envPath = path.resolve(__dirname, '../.env');

console.log('Loading .env from:', envPath);
dotenv.config({ path: envPath });

console.log('SUPABASE_URL:', process.env.SUPABASE_URL ? 'Loaded' : 'Missing');
// Hardcoded for debugging/fixing
const supabaseUrl = "https://mckkegmkpqdicudnfhor.supabase.co";
const supabaseKey = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im1ja2tlZ21rcHFkaWN1ZG5maG9yIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc2ODQ5MjExNywiZXhwIjoyMDg0MDY4MTE3fQ.s8M-RGqK_8tqdFpfUa_ZNckZ7p1EMdvi-1vcXH8oFn4";

if (!supabaseUrl || !supabaseKey) {
    console.error('Missing credentials');
    process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseKey);

async function checkUser(email: string) {
    console.log(`Checking user: ${email}`);

    // 1. Get User ID from auth (admin only)
    const { data: { users }, error: userError } = await supabase.auth.admin.listUsers();

    if (userError) {
        console.error('Auth Error:', userError);
        return;
    }

    const user = users.find(u => u.email === email);

    if (!user) {
        console.log('User not found in Auth. Listing all users:');
        users.forEach(u => console.log(`- ${u.email} (${u.id})`));
        return;
    }

    console.log(`Found User ID: ${user.id}`);

    // 2. Check Role
    const { data: role, error: roleError } = await supabase
        .from('user_roles')
        .select('*')
        .eq('user_id', user.id)
        .single();

    if (roleError) console.log('Role fetch error (might be null):', roleError.message);
    console.log('Current Role:', role);

    // 3. Fix Role if needed
    if (!role || role.role !== 'admin') {
        console.log('Upgrading to ADMIN...');

        // Find or Create Org
        let orgId;
        const { data: orgs } = await supabase.from('organizations').select('id').limit(1);

        if (orgs && orgs.length > 0) {
            orgId = orgs[0].id;
            console.log(`Using existing Org: ${orgId}`);
        } else {
            console.log('Creating new Org...');
            const { data: newOrg, error: orgError } = await supabase
                .from('organizations')
                .insert({ name: 'NextGen Research Labs' })
                .select()
                .single();

            if (orgError) {
                console.error('Org Creation Error:', orgError);
                return;
            }
            orgId = newOrg.id;
            console.log(`Created Org: ${orgId}`);
        }

        const { error: upsertError } = await supabase
            .from('user_roles')
            .upsert({
                user_id: user.id,
                role: 'admin',
                org_id: orgId
            });

        if (upsertError) console.error('Upsert Error:', upsertError);
        else console.log('User upgraded to ADMIN.');
    }
}

checkUser('admin@nextgenresearchlabs.com');
