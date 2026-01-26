
import { createClient } from '@supabase/supabase-js';
import * as dotenv from 'dotenv';
dotenv.config();

const supabaseUrl = "https://mckkegmkpqdicudnfhor.supabase.co";
const supabaseKey = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im1ja2tlZ21rcHFkaWN1ZG5maG9yIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc2ODQ5MjExNywiZXhwIjoyMDg0MDY4MTE3fQ.s8M-RGqK_8tqdFpfUa_ZNckZ7p1EMdvi-1vcXH8oFn4";

const supabase = createClient(supabaseUrl, supabaseKey);

async function checkLinkage() {
    console.log("--- Checking Contact Linkage ---");

    const names = ['JT', 'Justin Thompson', 'John Thompson'];
    const { data: contacts, error } = await supabase
        .from('contacts')
        .select('id, name, email, linked_user_id')
        .in('name', names);

    if (error) {
        console.error("Error fetching contacts:", error);
        return;
    }

    console.log("Current Contacts:");
    contacts?.forEach(c => {
        console.log(`- ${c.name} (${c.email || 'No Email'}) - Linked User: ${c.linked_user_id || 'None'}`);
    });
}

checkLinkage();
