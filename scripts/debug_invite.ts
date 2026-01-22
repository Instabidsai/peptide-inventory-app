
import { createClient } from "@supabase/supabase-js";
import dotenv from "dotenv";

// Load local .env if available (optional, but good practice)
dotenv.config();

// Using the keys we know about
const SUPABASE_URL = "https://mckkegmkpqdicudnfhor.supabase.co";
// Using the Service Role Key we're trying to use (from previous context)
const SERVICE_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im1ja2tlZ21rcHFkaWN1ZG5maG9yIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc2ODQ5MjExNywiZXhwIjoyMDg0MDY4MTE3fQ.s8M-RGqK_8tqdFpfUa_ZNckZ7p1EMdvi-1vcXH8oFn4";

// Test Data
const testEmail = "jjthompsonfau@gmail.com";

async function testFunction() {
    console.log("1. Initializing Client...");
    const supabase = createClient(SUPABASE_URL, SERVICE_KEY);

    console.log("2. Invoking 'invite-user' function...");
    const { data, error } = await supabase.functions.invoke('invite-user', {
        body: {
            email: testEmail,
            contact_id: null, // Just testing the function logic
            tier: 'family'
        }
    });

    if (error) {
        console.error("❌ FUNCTION ERROR:");
        // Check if there is detailed context
        if (error.context) {
            console.error(JSON.stringify(error.context, null, 2));
        } else {
            console.error(JSON.stringify(error, null, 2));
        }
    } else {
        console.log("✅ FUNCTION SUCCESS:");
        console.log(JSON.stringify(data, null, 2));
    }
}

testFunction();
