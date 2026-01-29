
import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
dotenv.config();

const supabaseUrl = process.env.VITE_SUPABASE_URL || process.env.PUBLIC_SUPABASE_URL!;
const supabaseKey = process.env.VITE_SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY!;
const supabase = createClient(supabaseUrl, supabaseKey);

async function verifyPartnerSchema() {
    console.log("Verifying Partner Schema...");

    // 1. Check Commissions Table
    const { error: commError } = await supabase.from('commissions').select('id').limit(1);
    if (!commError || commError.code === 'PGRST116') { // PGRST116 is just no rows, which is fine
        console.log("✅ Table 'commissions' exists (or is accessible).");
    } else {
        console.log(`❌ Table 'commissions' check failed: ${commError.message}`);
    }

    // 2. Check Profiles Columns
    const { error: profileError } = await supabase.from('profiles').select('parent_partner_id, partner_tier').limit(1);
    if (!profileError) {
        console.log("✅ Columns 'parent_partner_id' and 'partner_tier' exist on 'profiles'.");
    } else {
        console.log(`❌ Profile columns check failed: ${profileError.message}`);
    }

    // 3. Check RPC
    const { error: rpcError } = await supabase.rpc('get_partner_downline', { root_id: '00000000-0000-0000-0000-000000000000' });
    // Expecting no error or maybe "invalid input syntax for type uuid" if generic, but if function missing it says "function not found"
    if (rpcError && rpcError.message.includes('function') && rpcError.message.includes('does not exist')) {
        console.log(`❌ RPC 'get_partner_downline' NOT found.`);
    } else {
        console.log("✅ RPC 'get_partner_downline' appears to exist.");
    }
}

verifyPartnerSchema();
