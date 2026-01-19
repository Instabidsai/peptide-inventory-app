
import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
import path from 'path';

// Load env from root
dotenv.config({ path: path.resolve(__dirname, '../.env') });

const supabaseUrl = process.env.SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !supabaseKey) {
    console.error('Missing Supabase credentials in .env');
    process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseKey);

async function checkDb() {
    console.log('Checking DB state...');

    // Check Peptides
    const { count: peptideCount, error: peptideError } = await supabase
        .from('peptides')
        .select('*', { count: 'exact', head: true });

    if (peptideError) console.error('Peptide Error:', peptideError);
    console.log(`Total Peptides: ${peptideCount}`);

    // Check User Roles
    const { data: roles, error: roleError } = await supabase
        .from('user_roles')
        .select('*');

    if (roleError) console.error('Role Error:', roleError);
    console.log('User Roles:', roles);

    // Check specific user if possible (we don't have their ID easily unless we query auth.users which needs admin)
    // But listing all roles should show if *anyone* is admin.
}

checkDb();
