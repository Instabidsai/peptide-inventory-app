
import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
dotenv.config();

const supabaseUrl = process.env.VITE_SUPABASE_URL || "https://mckkegmkpqdicudnfhor.supabase.co";
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im1ja2tlZ21rcHFkaWN1ZG5maG9yIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc2ODQ5MjExNywiZXhwIjoyMDg0MDY4MTE3fQ.s8M-RGqK_8tqdFpfUa_ZNckZ7p1EMdvi-1vcXH8oFn4";

const supabase = createClient(supabaseUrl, supabaseKey, {
    auth: { autoRefreshToken: false, persistSession: false }
});

const EMAIL = "Anzola.sofia@gmail.com";

async function fixSofiaRole() {
    console.log(`Fixing role for ${EMAIL}...`);

    // 1. Get User ID from Profile
    const { data: profile, error: profileErr } = await supabase
        .from('profiles')
        .select('*')
        .eq('email', EMAIL)
        .single();

    if (profileErr || !profile) {
        console.error("Profile not found:", profileErr?.message);
        return;
    }

    console.log(`Found profile: ${profile.full_name} (${profile.id})`);

    // 2. Update Profile Role to 'sales_rep' (This controls the Partners list visibility)
    const { error: updateErr } = await supabase
        .from('profiles')
        .update({
            role: 'sales_rep',
            commission_rate: 0.10, // Initialize with 10% or 0? Default is 0.
            price_multiplier: 1.0
        })
        .eq('id', profile.id);

    if (updateErr) console.error("Error updating profile role:", updateErr.message);
    else console.log("Profile role updated to 'sales_rep'.");

    // 3. Update user_roles table for consistency
    const { error: roleErr } = await supabase
        .from('user_roles')
        .update({ role: 'sales_rep' }) // Map 'admin' -> 'sales_rep' also? 
        .eq('user_id', profile.user_id);

    // Note: 'sales_rep' might not be a valid Enum in user_roles if it has different enum types. 
    // AuthContext.tsx says: type AppRole = 'admin' | 'staff' | 'viewer' | 'sales_rep';
    // So it should be valid.

    if (roleErr) console.error("Error updating user_roles:", roleErr.message);
    else console.log("user_roles updated to 'sales_rep'.");

    console.log("Fix complete. Sofia should now appear in 'Active Partners'.");
}

fixSofiaRole();
