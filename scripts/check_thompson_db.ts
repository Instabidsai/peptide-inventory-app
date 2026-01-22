
import { createClient } from '@supabase/supabase-js';
import { config } from 'dotenv';
config();

const supabaseUrl = process.env.PUBLIC_SUPABASE_URL!;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;

const supabase = createClient(supabaseUrl, supabaseServiceKey);

async function checkThompson() {
    const { data: profiles, error } = await supabase
        .from('profiles')
        .select('*')
        .ilike('email', '%thompson%');

    if (error) {
        console.error('Error fetching profiles:', error);
        return;
    }

    console.log('Thompson Profile(s):', JSON.stringify(profiles, null, 2));
}

checkThompson();
