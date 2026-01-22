
import { createClient } from '@supabase/supabase-js';
import { config } from 'dotenv';
config();

const supabaseUrl = process.env.VITE_SUPABASE_URL || process.env.PUBLIC_SUPABASE_URL!;
const supabaseServiceKey = process.env.VITE_SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY!;

const supabase = createClient(supabaseUrl, supabaseServiceKey);

async function fixRole() {
    const userId = '5b1e7e3b-1771-46cd-a28a-f256be7f6f6a'; // From previous tool output

    // Update role to sales_rep
    const { error } = await supabase
        .from('user_roles')
        .update({ role: 'sales_rep' })
        .eq('user_id', userId);

    if (error) {
        console.error('Error updating role:', error);
    } else {
        console.log('Successfully updated Thompson role to sales_rep');
    }
}

fixRole();
