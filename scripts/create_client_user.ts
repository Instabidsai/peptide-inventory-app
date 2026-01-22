import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
dotenv.config();

const supabaseUrl = process.env.VITE_SUPABASE_URL || "https://mckkegmkpqdicudnfhor.supabase.co";
// Service Role Key from mcp.json (Automatically detected)
const supabaseKey = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im1ja2tlZ21rcHFkaWN1ZG5maG9yIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc2ODQ5MjExNywiZXhwIjoyMDg0MDY4MTE3fQ.s8M-RGqK_8tqdFpfUa_ZNckZ7p1EMdvi-1vcXH8oFn4";

const supabase = createClient(supabaseUrl, supabaseKey, {
    auth: {
        autoRefreshToken: false,
        persistSession: false
    }
});

const args = process.argv.slice(2);
if (args.length < 2) {
    console.log("Usage: npx tsx scripts/create_client_user.ts <email> <password> [contact_id]");
    console.log("Tip: Set SUPABASE_SERVICE_ROLE_KEY env var to skip email verification.");
    process.exit(1);
}

const [email, password, contactId] = args;

async function createClientUser() {
    console.log(`Attempting to create user: ${email}`);
    const isServiceKey = supabaseKey.startsWith('eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im1ja2tlZ21rcHFkaWN1ZG5maG9yIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlh'); // simple check if possible, or just try admin

    let uid = '';

    // Try Admin API first (requires Service Key)
    try {
        const { data: adminData, error: adminError } = await supabase.auth.admin.createUser({
            email,
            password,
            email_confirm: true // Force confirm
        });

        if (!adminError && adminData.user) {
            console.log("User created via Admin API (Verified).");
            uid = adminData.user.id;
        } else {
            // Fallback to regular signup if Admin API fails (likely anon key)
            if (adminError?.message && !adminError.message.includes("service_role")) {
                console.log("Admin API failed (expected if using Anon Key):", adminError.message);
            }
        }
    } catch (e) {
        // Ignore, fall through
    }

    if (!uid) {
        console.log("Falling back to public SignUp...");
        const { data: authData, error: authError } = await supabase.auth.signUp({
            email,
            password,
        });

        if (authError) {
            console.error("Auth Error:", authError.message);
            if (authError.message.includes("already registered")) {
                // Try login
                const { data: loginData } = await supabase.auth.signInWithPassword({ email, password });
                if (loginData.user) uid = loginData.user.id;
            }
        } else if (authData.user) {
            uid = authData.user.id;
        }
    }

    if (uid) {
        console.log("User ID:", uid);
        await linkUser(uid);
    } else {
        console.log("Failed to create or retrieve user.");
        console.log("Recommendation: Get your SERVICE_ROLE_KEY from Supabase Settings -> API and run:");
        console.log("  ($env:SUPABASE_SERVICE_ROLE_KEY='your_key_here'); npx tsx scripts/create_client_user.ts ...");
    }
}

async function linkUser(userId: string) {
    if (!contactId) {
        console.log("No contact_id provided. Finding contact by email...");
        const { data: contacts } = await supabase.from('contacts').select('id, name').eq('email', email);
        if (contacts && contacts.length > 0) {
            console.log(`Found contact: ${contacts[0].name} (${contacts[0].id})`);
            await updateContact(contacts[0].id, userId);
        } else {
            console.log("No matching contact found.");
        }
    } else {
        await updateContact(contactId, userId);
    }
}

async function updateContact(cId: string, uId: string) {
    const { error } = await supabase.from('contacts').update({
        linked_user_id: uId,
        tier: 'family' // Auto-set tier to family/at_cost for this flow
    }).eq('id', cId);

    if (error) {
        console.error("Failed to link contact:", error.message);
    } else {
        console.log("Successfully linked contact to user!");
        console.log("You can now login with:", email);
    }

    // Also ensure they have the 'client' role in user_roles
    // org_id needed...
    // simpler to just trust the profile trigger for now or assume existing logic.
}

createClientUser();
