
import { createClient } from "@supabase/supabase-js";
import dotenv from "dotenv";

dotenv.config();

const SUPABASE_URL = "https://mckkegmkpqdicudnfhor.supabase.co";
const SERVICE_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im1ja2tlZ21rcHFkaWN1ZG5maG9yIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc2ODQ5MjExNywiZXhwIjoyMDg0MDY4MTE3fQ.s8M-RGqK_8tqdFpfUa_ZNckZ7p1EMdvi-1vcXH8oFn4";

const targetEmail = "jjthompsonfau@gmail.com";

async function forceFix() {
    console.log(`Force Fixing for: ${targetEmail}`);
    const supabase = createClient(SUPABASE_URL, SERVICE_KEY);

    // 1. Generate Link (Try Magic Link for existing users first)
    console.log("Generating Link (MagicLink)...");
    const { data: linkData, error: linkError } = await supabase.auth.admin.generateLink({
        type: 'magiclink',
        email: targetEmail,
        options: {
            redirectTo: 'http://localhost:5173/update-password?welcome=true'
        }
    });

    if (linkError) {
        console.error("❌ Generate Link Failed:", linkError.message);
        // Try creating if missing
        console.log("Attempting Create User...");
        const { data: createData, error: createError } = await supabase.auth.admin.createUser({
            email: targetEmail,
            email_confirm: true,
            user_metadata: { role: 'client' }
        });

        if (createError) {
            console.error("❌ Create User Failed:", createError.message);
            return;
        }

        // Retry Link
        console.log("Retrying Link...");
        const { data: retryLink } = await supabase.auth.admin.generateLink({
            type: 'invite',
            email: targetEmail,
            options: {
                redirectTo: 'http://localhost:5173/update-password?welcome=true'
            }
        });

        if (retryLink && retryLink.properties) {
            await saveLink(supabase, retryLink.user.id, retryLink.properties.action_link);
        }
        return;
    }

    if (linkData && linkData.properties) {
        console.log("✅ Link Generated:", linkData.properties.action_link);
        await saveLink(supabase, linkData.user.id, linkData.properties.action_link);
    }
}

async function saveLink(supabase: any, userId: string, link: string) {
    console.log(`Saving link to contact... (User ID: ${userId})`);

    // Find contact by email? Or just update all contacts with this email?
    // We don't have contact ID easily here, but we can search.

    // First, find the contact
    const { data: contacts } = await supabase.from('contacts').select('id').eq('email', targetEmail); // Assuming email match

    // If no email match in contacts, try to update by 'linked_user_id'? (Use case: initial link)

    if (contacts && contacts.length > 0) {
        for (const contact of contacts) {
            console.log(`Updating Contact ID: ${contact.id}`);
            const { error } = await supabase.from('contacts').update({
                linked_user_id: userId,
                invite_link: link,
                tier: 'family'
            }).eq('id', contact.id);

            if (error) console.error("Update Failed:", error);
            else console.log("✅ Database Updated Successfully.");
        }
    } else {
        console.error("❌ No matching contact found to update.");
    }
}

forceFix();
