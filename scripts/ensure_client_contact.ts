import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
dotenv.config();

const supabaseUrl = process.env.VITE_SUPABASE_URL || "https://mckkegmkpqdicudnfhor.supabase.co";
const supabaseKey = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im1ja2tlZ21rcHFkaWN1ZG5maG9yIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc2ODQ5MjExNywiZXhwIjoyMDg0MDY4MTE3fQ.s8M-RGqK_8tqdFpfUa_ZNckZ7p1EMdvi-1vcXH8oFn4";

const supabase = createClient(supabaseUrl, supabaseKey);

const email = 'client@test.com';
const userId = 'c4c474f8-139c-4d9f-9ae1-68240abe1036'; // From previous step

async function main() {
    console.log("Ensuring contact for:", email);

    // Check if contact exists
    const { data: existing } = await supabase.from('contacts').select('id').eq('email', email).single();

    if (existing) {
        console.log("Contact exists, updating link...");
        await supabase.from('contacts').update({ linked_user_id: userId, tier: 'family' }).eq('id', existing.id);
    } else {
        console.log("Creating new contact...");
        // Need org_id? Usually RLS handles it or default?
        // Let's get org_id
        const { data: org } = await supabase.from('organizations').select('id').limit(1).single();

        const { error } = await supabase.from('contacts').insert({
            org_id: org?.id,
            name: 'Test Client',
            email: email,
            linked_user_id: userId,
            tier: 'family',
            type: 'customer'
        });

        if (error) console.error("Insert failed:", error);
        else console.log("Contact created and linked!");
    }
}

main();
