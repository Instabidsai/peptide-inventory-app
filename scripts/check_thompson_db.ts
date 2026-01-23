
import { createClient } from '@supabase/supabase-js';
import { config } from 'dotenv';
config();

const supabaseUrl = process.env.VITE_SUPABASE_URL || process.env.PUBLIC_SUPABASE_URL || 'https://placeholder.supabase.co';
const supabaseServiceKey = process.env.VITE_SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY!;

const supabase = createClient(supabaseUrl, supabaseServiceKey);

async function checkThompson() {
    const userId = 'a2f08eb1-d7f5-4a99-a433-c49d3adb44c9';
    console.log(`Checking roles for ${userId}...`);

    const { data: roles, error } = await supabase
        .from('user_roles')
        .select('*')
        .eq('user_id', userId);

    if (error) {
        console.error('Error fetching roles:', error);
    } else {
        console.log('User Roles:', JSON.stringify(roles, null, 2));
    }
}
checkThompson();
