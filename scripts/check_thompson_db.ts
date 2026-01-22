
import { createClient } from '@supabase/supabase-js';
import { config } from 'dotenv';
config();

const supabaseUrl = process.env.VITE_SUPABASE_URL || process.env.PUBLIC_SUPABASE_URL || 'https://placeholder.supabase.co';
const supabaseServiceKey = process.env.VITE_SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY!;

const supabase = createClient(supabaseUrl, supabaseServiceKey);

async function checkThompson() {
    const { data: roles, error } = await supabase
        .from('user_roles')
        .select('*');

    if (error) {
        console.error('Error fetching roles:', error);
        return;
    }

    console.log('All Roles:', JSON.stringify(roles, null, 2));
}

checkThompson();
