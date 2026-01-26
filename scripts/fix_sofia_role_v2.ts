
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

    const { data: profile } = await supabase.from('profiles').select('*').eq('email', EMAIL).single();
    if (!profile) {
        console.log("Profile not found.");
        return;
    }

    console.log(`Found profile: ${profile.full_name}, current role: ${profile.role}`);

    // Update Profile Role to 'sales_rep' ONLY
    const { error: updateErr } = await supabase
        .from('profiles')
        .update({ role: 'sales_rep' })
        .eq('id', profile.id);

    if (updateErr) console.error("Error updating profile role:", updateErr.message);
    else console.log("Profile role updated to 'sales_rep'.");
}

fixSofiaRole();
