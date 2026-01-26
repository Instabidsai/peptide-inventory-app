
import { createClient } from '@supabase/supabase-js';
import * as dotenv from 'dotenv';
dotenv.config();

const supabaseUrl = "https://mckkegmkpqdicudnfhor.supabase.co";
const supabaseKey = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im1ja2tlZ21rcHFkaWN1ZG5maG9yIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc2ODQ5MjExNywiZXhwIjoyMDg0MDY4MTE3fQ.s8M-RGqK_8tqdFpfUa_ZNckZ7p1EMdvi-1vcXH8oFn4";

const supabase = createClient(supabaseUrl, supabaseKey);

async function debugAdmin() {
    console.log("--- Debugging Admin Profiles ---");

    const { data: profiles, error } = await supabase
        .from('profiles')
        .select('*, user_roles(*)');

    if (error) {
        console.error("Error fetching profiles:", error.message);
        return;
    }

    console.log(`Found ${profiles.length} profiles.`);
    profiles.forEach(p => {
        console.log(`- ${p.full_name} (${p.email}), Org ID: ${p.org_id}`);
        p.user_roles?.forEach(r => console.log(`  Role: ${r.role} in Org ${r.org_id}`));
    });
}

debugAdmin();
