
import { createClient } from '@supabase/supabase-js';

const supabaseUrl = "https://mckkegmkpqdicudnfhor.supabase.co";
const supabaseKey = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im1ja2tlZ21rcHFkaWN1ZG5maG9yIiwicm9sZSI6ImFub24iLCJpYXQiOjE3Njg0OTIxMTcsImV4cCI6MjA4NDA2ODExN30.Amo1Aw6I_JnDGiSmfoIhkcBmemkKl73kcfuHAPdX_rU";

const supabase = createClient(supabaseUrl, supabaseKey);

async function createTestUser() {
    const email = 'ai_tester@instabids.ai';
    const password = 'password123';
    const fullName = 'AI Test User';

    console.log(`Signing up user ${email}...`);

    // 1. Sign Up (Public)
    const { data: authData, error: authError } = await supabase.auth.signUp({
        email,
        password,
        options: {
            data: { full_name: fullName }
        }
    });

    if (authError) {
        console.error("Error signing up user:", authError.message);
        return;
    }

    const userId = authData.user?.id;

    if (!userId) {
        console.log("Signup successful but no user ID returned immediately (maybe waiting for email confirm). User object:", authData.user);
    } else {
        console.log(`User key created. ID: ${userId}`);
    }

    // Try to login to get a session to update profile
    const { data: sessionData, error: loginError } = await supabase.auth.signInWithPassword({
        email,
        password
    });

    if (loginError) {
        console.error("Login failed (likely needs email confirm):", loginError.message);
        return;
    }

    console.log("Logged in successfully. Updating profile...");
    const sessionUser = sessionData.user;

    // 2. Create/Update Profile (Own Profile)
    const { error: profileError } = await supabase
        .from('profiles')
        .upsert({
            user_id: sessionUser.id,
            email,
            full_name: fullName,
            role: 'viewer'
        });

    if (profileError) console.error("Error updating profile:", profileError.message);
    else console.log("Profile updated.");

    console.log("Setup complete. Login with:", email, password);
}

createTestUser();
