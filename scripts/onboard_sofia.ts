
import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
dotenv.config();

const supabaseUrl = process.env.VITE_SUPABASE_URL || "https://mckkegmkpqdicudnfhor.supabase.co";
// Service Role Key is required for admin actions
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im1ja2tlZ21rcHFkaWN1ZG5maG9yIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc2ODQ5MjExNywiZXhwIjoyMDg0MDY4MTE3fQ.s8M-RGqK_8tqdFpfUa_ZNckZ7p1EMdvi-1vcXH8oFn4";

const supabase = createClient(supabaseUrl, supabaseKey, {
    auth: {
        autoRefreshToken: false,
        persistSession: false
    }
});

const EMAIL = "Anzola.sofia@gmail.com";
const PASSWORD = "Sofia1";
const NAME = "Sofia Anzola";

async function onboardPartner() {
    console.log(`Starting onboarding for ${NAME} (${EMAIL})...`);

    // 1. Get Organization
    const { data: orgs } = await supabase.from('organizations').select('id, name');
    if (!orgs || orgs.length === 0) {
        console.error("No organizations found!");
        return;
    }
    const orgId = orgs[0].id;
    console.log(`organization: ${orgs[0].name} (${orgId})`);

    // 2. Create/Get User
    let userId = '';
    const { data: existingUser } = await supabase.from('profiles').select('user_id').eq('email', EMAIL).maybeSingle();

    if (existingUser) {
        console.log("User already exists in profiles.");
        userId = existingUser.user_id;
    } else {
        // Try creating via Admin API
        const { data: adminUser, error: adminError } = await supabase.auth.admin.createUser({
            email: EMAIL,
            password: PASSWORD,
            email_confirm: true,
            user_metadata: { full_name: NAME }
        });

        if (adminUser?.user) {
            userId = adminUser.user.id;
            console.log("User created via Admin API.");
        } else {
            console.log("Admin API create failed (maybe existing auth?):", adminError?.message);
            // Try sign in to get ID
            const { data: signIn, error: signInError } = await supabase.auth.signInWithPassword({
                email: EMAIL,
                password: PASSWORD
            });
            if (signIn.user) {
                userId = signIn.user.id;
                console.log("User exists (signed in).");
            } else {
                console.error("Could not create or retrieve user.", signInError);
                return;
            }
        }
    }

    // 3. Ensure Profile exists and has Org ID
    const { error: profileError } = await supabase
        .from('profiles')
        .upsert({
            user_id: userId,
            email: EMAIL,
            full_name: NAME,
            org_id: orgId
        }, { onConflict: 'user_id' });

    if (profileError) console.error("Profile update error:", profileError.message);
    else console.log("Profile updated.");

    // 4. Assign 'admin' role (Partner)
    const { error: roleError } = await supabase
        .from('user_roles')
        .upsert({
            user_id: userId,
            org_id: orgId,
            role: 'admin' // Assuming Partner = Admin level access
        }, { onConflict: 'user_id,org_id' });

    if (roleError) console.error("Role assignment error:", roleError.message);
    else console.log("Role 'admin' assigned.");

    // 5. Create/Update Contact
    // Check if contact exists
    const { data: contacts } = await supabase.from('contacts').select('id').eq('email', EMAIL);
    let contactId = '';

    if (contacts && contacts.length > 0) {
        contactId = contacts[0].id;
        console.log("Contact existing.");
    } else {
        // Create new contact
        const { data: newContact, error: createError } = await supabase
            .from('contacts')
            .insert({
                name: NAME,
                email: EMAIL,
                org_id: orgId,
                type: 'partner', // Try 'partner'
                tier: 'family'  // 'partner' failed check, falling back to 'family'
            })
            .select()
            .single();

        if (createError) {
            console.error("Error creating contact:", createError.message);
            // Fallback to 'client' type if 'partner' implies enum violation
            if (createError.message.includes("invalid input value for enum")) {
                console.log("Retry creating contact as type 'client'...");
                const { data: retryContact, error: retryError } = await supabase
                    .from('contacts')
                    .insert({
                        name: NAME,
                        email: EMAIL,
                        org_id: orgId,
                        type: 'client',
                        tier: 'family'
                    })
                    .select()
                    .single();

                if (retryError) console.error("Retry failed:", retryError.message);
                else {
                    contactId = retryContact.id;
                    console.log("Contact created (fallback type).");
                }
            }
        } else {
            contactId = newContact.id;
            console.log("Contact created with type 'partner'.");
        }
    }

    // 6. Link User to Contact
    if (contactId && userId) {
        const { error: linkError } = await supabase
            .from('contacts')
            .update({ linked_user_id: userId })
            .eq('id', contactId);

        if (linkError) console.error("Link error:", linkError.message);
        else console.log("User linked to Contact successfully.");
    }

    console.log("Onboarding complete!");
    console.log(`Credentials: ${EMAIL} / ${PASSWORD}`);
}

onboardPartner();
