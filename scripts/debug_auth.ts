
import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const envPath = path.resolve(__dirname, '../.env');

dotenv.config({ path: envPath });

// Use Public Key for Auth client (simulate frontend)
const supabaseUrl = "https://mckkegmkpqdicudnfhor.supabase.co";
const supabaseKey = process.env.VITE_SUPABASE_PUBLISHABLE_KEY; // Anon key

if (!supabaseKey) {
    console.error("Missing Anon Key");
    process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseKey);

async function checkAccess() {
    console.log('Logging in as admin@nextgenresearchlabs.com...');
    const { data: { session }, error: loginError } = await supabase.auth.signInWithPassword({
        email: 'admin@nextgenresearchlabs.com',
        password: '123abc'
    });

    if (loginError) {
        console.error('Login Failed:', loginError);
        return;
    }
    console.log('Login Successful. User ID:', session?.user.id);

    // 1. Read Profile
    console.log('Reading Profile...');
    const { data: profile, error: profileError } = await supabase
        .from('profiles')
        .select('*')
        .eq('user_id', session!.user.id!)
        .single();

    if (profileError) console.error('Profile Read Error:', profileError);
    else console.log('Profile:', profile);

    // 2. Read User Roles
    console.log('Reading User Roles...');
    const { data: roles, error: rolesError } = await supabase
        .from('user_roles')
        .select('*')
        .eq('user_id', session!.user.id!);

    if (rolesError) console.error('User Roles Read Error:', rolesError);
    else console.log('User Roles:', roles);

    // 3. Read Organization (if we have an ID)
    if (profile?.org_id) {
        console.log(`Reading Organization ${profile.org_id}...`);
        const { data: org, error: orgError } = await supabase
            .from('organizations')
            .select('*')
            .eq('id', profile.org_id)
            .single();

        if (orgError) console.error('Org Read Error:', orgError);
        else console.log('Org:', org);
    }
}

checkAccess();
