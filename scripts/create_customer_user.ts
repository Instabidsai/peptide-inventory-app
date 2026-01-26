import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
dotenv.config();

const supabaseUrl = process.env.VITE_SUPABASE_URL || "https://mckkegmkpqdicudnfhor.supabase.co";
const supabaseKey = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im1ja2tlZ21rcHFkaWN1ZG5maG9yIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc2ODQ5MjExNywiZXhwIjoyMDg0MDY4MTE3fQ.s8M-RGqK_8tqdFpfUa_ZNckZ7p1EMdvi-1vcXH8oFn4";

const supabase = createClient(supabaseUrl, supabaseKey);

async function createCustomerUser() {
    const email = "Jordanthompson06121992@gmail.com";
    const password = "Jordan1";
    const fullName = "Jordan Thompson";

    console.log(`Fixing customer user: ${email}`);

    try {
        const { data: orgs } = await supabase.from('organizations').select('id').limit(1).single();
        const orgId = orgs!.id;

        // 1. Get User ID
        let userId = "";

        // Try to verify credentials / get user
        const { data: { users }, error: listError } = await supabase.auth.admin.listUsers();
        if (users) {
            const found = users.find(u => u.email?.toLowerCase() === email.toLowerCase());
            if (found) {
                userId = found.id;
                console.log("✅ Found User ID:", userId);

                // Update password just in case
                await supabase.auth.admin.updateUserById(userId, { password: password, user_metadata: { full_name: fullName, role: 'client' } });
                console.log("✅ Password/Metadata synced");
            }
        }

        if (!userId) {
            console.error("❌ Could not find user even though creation said it exists.");
            return;
        }

        // 2. Profile
        const { error: profileError } = await supabase
            .from('profiles')
            .upsert({
                id: userId,
                email: email,
                full_name: fullName,
                user_id: userId,
                org_id: orgId
            });

        if (profileError) console.error("❌ Profile Error:", profileError.message);
        else console.log("✅ Profile ensured");

        // 3. Role
        const { error: roleError } = await supabase
            .from('user_roles')
            .upsert({ user_id: userId, org_id: orgId, role: 'client' }, { onConflict: 'user_id, org_id' });

        if (roleError) console.error("❌ Role Error:", roleError.message);
        else console.log("✅ Role ensured");

        // 4. Contact
        const { data: contacts } = await supabase.from('contacts').select('id').eq('email', email);
        if (contacts && contacts.length > 0) {
            await supabase.from('contacts').update({
                name: fullName,
                linked_user_id: userId,
                type: 'customer',
                tier: 'family',
                org_id: orgId
            }).eq('id', contacts[0].id);
            console.log("✅ Contact updated");
        } else {
            const { error: createContactError } = await supabase.from('contacts').insert({
                name: fullName,
                email: email,
                linked_user_id: userId,
                type: 'customer',
                tier: 'family',
                org_id: orgId
            });
            if (createContactError) console.error("❌ Contact Create Error:", createContactError.message);
            else console.log("✅ Contact created");
        }

        // 5. Goals
        const { error: goalsError } = await supabase
            .from('daily_macro_goals')
            .upsert({
                user_id: userId,
                calories_target: 2000,
                protein_target: 150,
                carbs_target: 200,
                fat_target: 65
            }, { onConflict: 'user_id' });

        if (goalsError) console.error("❌ Goals Error:", goalsError.message);
        else console.log("✅ Goals ensured");

        console.log("DONE");

    } catch (e: any) {
        console.error(e);
    }
}

createCustomerUser();
