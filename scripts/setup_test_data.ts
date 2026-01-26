import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
import path from 'path';

// Load env from root
dotenv.config({ path: path.join(process.cwd(), '.env') });

const supabaseUrl = 'https://mckkegmkpqdicudnfhor.supabase.co';
const supabaseKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im1ja2tlZ21rcHFkaWN1ZG5maG9yIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc2ODQ5MjExNywiZXhwIjoyMDg0MDY4MTE3fQ.s8M-RGqK_8tqdFpfUa_ZNckZ7p1EMdvi-1vcXH8oFn4';

if (!supabaseUrl || !supabaseKey) {
    console.error("Missing VITE_SUPABASE_URL or VITE_SUPABASE_SERVICE_ROLE_KEY");
    process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseKey);

async function setup() {
    const email = 'client.test@example.com';
    const password = 'password123';
    const name = 'Test Client Family';

    console.log(`Setting up test user: ${email}`);

    const orgId = await getOrgId();
    if (!orgId) {
        console.error("No organization found");
        return;
    }

    // 1. Create or Get Contact
    let contactId;
    const { data: contacts } = await supabase.from('contacts').select('id').eq('email', email);

    if (contacts && contacts.length > 0) {
        contactId = contacts[0].id;
        console.log(`Found existing contact: ${contactId}`);
    } else {
        const { data: newContact, error } = await supabase.from('contacts').insert({
            name,
            email,
            type: 'customer',
            org_id: orgId
        }).select().single();

        if (error) {
            console.error("Error creating contact:", error);
            return;
        }
        contactId = newContact.id;
        console.log(`Created new contact: ${contactId}`);
    }

    // 2. Create Auth User
    let userId;
    const { data: { users } } = await supabase.auth.admin.listUsers();
    const existingUser = users.find(u => u.email === email);

    if (existingUser) {
        userId = existingUser.id;
        console.log(`Found existing user: ${userId}`);
        // Reset password just in case
        await supabase.auth.admin.updateUserById(userId, { password });
    } else {
        const { data: newUser, error: authError } = await supabase.auth.admin.createUser({
            email,
            password,
            email_confirm: true
        });
        if (authError) {
            console.error("Error creating user:", authError);
            return;
        }
        userId = newUser.user.id;
        console.log(`Created new user: ${userId}`);
    }

    // 3. Link them
    const { error: linkError } = await supabase.from('contacts').update({
        linked_user_id: userId,
        tier: 'family'
    }).eq('id', contactId);

    if (linkError) console.error("Error linking:", linkError);
    else console.log("✅ Contact linked to User");

    // 4. Ensure Profile exists and has role
    const { error: profileError } = await supabase.from('profiles').upsert({
        user_id: userId,
        email: email,
        full_name: name,
        role: 'client',
        org_id: orgId
    });

    if (profileError) console.error("Error updating profile:", profileError);
    else console.log("✅ Profile updated");

    console.log("\n--- CREDENTIALS ---");
    console.log(`Email: ${email}`);
    console.log(`Password: ${password}`);
}

async function getOrgId() {
    const { data } = await supabase.from('organizations').select('id').limit(1).single();
    return data?.id;
}

setup();
