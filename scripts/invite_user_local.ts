
import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
dotenv.config();

// Service Role Key from mcp.json
const supabaseUrl = process.env.VITE_SUPABASE_URL || "https://mckkegmkpqdicudnfhor.supabase.co";
const supabaseKey = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im1ja2tlZ21rcHFkaWN1ZG5maG9yIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc2ODQ5MjExNywiZXhwIjoyMDg0MDY4MTE3fQ.s8M-RGqK_8tqdFpfUa_ZNckZ7p1EMdvi-1vcXH8oFn4";

const supabase = createClient(supabaseUrl, supabaseKey);

const args = process.argv.slice(2);
if (args.length < 1) {
    console.log("Usage: npx tsx scripts/invite_user_local.ts <email> [contact_id]");
    process.exit(1);
}

const [email, contactId] = args;

async function inviteUser() {
    console.log(`Generating invite for: ${email}`);

    // 1. Create User (if not exists)
    // createUser with email_confirm: true handles verification
    let userId = '';

    try {
        const { data: userData, error: createError } = await supabase.auth.admin.createUser({
            email: email,
            email_confirm: true,
            user_metadata: { role: 'client' }
        });

        if (createError) {
            if (createError.message.includes("already been registered")) {
                console.log("User already registered.");
                // We don't have ID easily unless we login or search. 
                // But generateLink works by email.
            } else {
                throw createError;
            }
        } else if (userData.user) {
            userId = userData.user.id;
            console.log("New User Created:", userId);
        }
    } catch (e: any) {
        console.error("Create failed:", e.message);
    }

    // 2. Link Contact
    if (contactId) {
        if (!userId) {
            // Try to find user ID if we didn't just create them?
            // Optional: Skip linking if we can't find ID safely.
            // Or try listUsers with filter?
            const { data: users } = await supabase.auth.admin.listUsers();
            const existing = users.users.find(u => u.email === email);
            if (existing) userId = existing.id;
        }

        if (userId) {
            await supabase.from('contacts').update({ linked_user_id: userId, tier: 'family' }).eq('id', contactId);
            console.log("Linked to contact.");
        }
    }

    // 3. Generate Link
    // Use 'magiclink' which works for both new (if confirmed) and existing users.
    const { data: linkData, error: linkError } = await supabase.auth.admin.generateLink({
        type: 'magiclink',
        email: email,
        options: {
            redirectTo: 'http://localhost:5173/update-password?welcome=true'
        }
    });

    if (linkError) {
        console.error("Link Generation Failed:", linkError.message);
    } else {
        console.log("\n--- SUCCESS ---");
        console.log("Action Link (Give this to user):");
        console.log(linkData.properties.action_link);
        console.log("---------------");
    }
}

inviteUser();
