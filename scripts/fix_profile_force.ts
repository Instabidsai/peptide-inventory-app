
import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const envPath = path.resolve(__dirname, '../.env');

dotenv.config({ path: envPath });

const supabaseUrl = process.env.VITE_SUPABASE_URL || "https://mckkegmkpqdicudnfhor.supabase.co";
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

const supabase = createClient(supabaseUrl, supabaseKey!);

async function forceFix() {
    const targetOrgId = '33a18316-b0a4-4d85-a770-d1ceb762bd4f';
    const email = 'admin@nextgenresearchlabs.com';

    console.log(`Forcing Upsert Org ID ${targetOrgId} for ${email}`);

    const { data: { users } } = await supabase.auth.admin.listUsers();
    const user = users?.find(u => u.email === email);

    if (!user) { console.log('User not found'); return; }

    // Upsert Profile
    const { data: upsertData, error: pError } = await supabase
        .from('profiles')
        .upsert({
            user_id: user.id,
            org_id: targetOrgId,
        })
        .select();

    if (pError) console.error('Profile Upsert Error:', pError);
    else console.log('Profile Upserted. Returned:', upsertData);

    // Check
    const { data: pCheck } = await supabase.from('profiles').select('*').eq('user_id', user.id).single();
    console.log('Verified Profile:', pCheck);
}

forceFix();
