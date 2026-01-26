
import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
dotenv.config();

const supabaseUrl = process.env.VITE_SUPABASE_URL || "https://mckkegmkpqdicudnfhor.supabase.co";
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im1ja2tlZ21rcHFkaWN1ZG5maG9yIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc2ODQ5MjExNywiZXhwIjoyMDg0MDY4MTE3fQ.s8M-RGqK_8tqdFpfUa_ZNckZ7p1EMdvi-1vcXH8oFn4";

const supabase = createClient(supabaseUrl, supabaseKey, {
    auth: { autoRefreshToken: false, persistSession: false }
});

const EMAIL = "Dzlby111@yahoo.com";
const NEW_PASSWORD = "Don123";

async function resetPassword() {
    console.log(`Resetting password for ${EMAIL}...`);

    // 1. Get User ID
    const { data: { users }, error: listError } = await supabase.auth.admin.listUsers();
    const user = users?.find(u => u.email?.toLowerCase() === EMAIL.toLowerCase());

    if (!user) {
        console.error("User not found in Auth! Creating him instead...");
        // Setup Don if missing
        const { data: newUser, error: createError } = await supabase.auth.admin.createUser({
            email: EMAIL,
            password: NEW_PASSWORD,
            email_confirm: true,
            user_metadata: { full_name: "Don" }
        });
        if (createError) console.error("Create failed:", createError.message);
        else console.log(`Created user ${EMAIL} with password ${NEW_PASSWORD}`);
        return;
    }

    console.log(`Found user: ${user.id}`);

    // 2. Update Password
    const { error: updateError } = await supabase.auth.admin.updateUserById(
        user.id,
        { password: NEW_PASSWORD }
    );

    if (updateError) {
        console.error("Password update failed:", updateError.message);
    } else {
        console.log(`Password updated successfully to: ${NEW_PASSWORD}`);
    }
}

resetPassword();
