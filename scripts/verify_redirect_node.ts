
import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
import path from 'path';

// Load env vars from .env file
dotenv.config({ path: path.resolve(__dirname, '../.env') });

const SUPABASE_URL = process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!SUPABASE_URL) {
    console.error("Missing SUPABASE_URL");
    process.exit(1);
}

// We need the Service Role Key to bypass RLS or invoke functions if they are protected?
// Actually, `invite-user` might be public or require a user. 
// If it requires a logged-in user, we might need to fake a session or use service role.
// Looking at the function code, it uses `supabaseAdmin`.
if (!SUPABASE_SERVICE_ROLE_KEY) {
    console.error("Missing SUPABASE_SERVICE_ROLE_KEY in .env");
    // Attempt with Anon key if available, but likely need Admin for invite generation?
    // Actually the EDGE FUNCTION uses the service role key internally.
    // The CLIENT calling it just needs to be authenticated or anon depending on function setting.
}

console.log(`Using Supabase URL: ${SUPABASE_URL}`);
const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY || process.env.VITE_SUPABASE_ANON_KEY || "");

async function testRedirect() {
    const testEmail = "test-redirect-verification@example.com";
    const targetOrigin = "https://stock-scribe-star.lovable.app";

    console.log(`Testing invite generation with redirect_origin: ${targetOrigin}`);

    // Call the Edge Function
    const { data, error } = await supabase.functions.invoke('invite-user', {
        body: {
            email: testEmail,
            contact_id: "00000000-0000-0000-0000-000000000000",
            tier: "Family (Free)",
            redirect_origin: targetOrigin
        }
    });

    if (error) {
        console.error("Function call failed:", error);
        console.error("Details:", JSON.stringify(error, null, 2));
    } else {
        console.log("Function returned data:", JSON.stringify(data, null, 2));

        if (data && data.action_link) {
            const url = new URL(data.action_link);
            const redirectParam = url.searchParams.get("redirect_to");
            console.log(`\n--- RESULT ---`);
            console.log(`Generated Link: ${data.action_link}`);
            console.log(`Redirect Param: ${redirectParam}`);

            if (redirectParam && redirectParam.startsWith(targetOrigin)) {
                console.log("✅ SUCCESS: The function accepted the redirect origin.");
            } else {
                console.log("❌ FAILURE: The function IGNORED the redirect origin.");
                console.log(`Expected to start with: ${targetOrigin}`);
                console.log(`Actually got: ${redirectParam}`);
                if (redirectParam?.includes('id-preview')) {
                    console.log("CONFIRMED: Falls back to Preview URL. Likely whitelist issue.");
                }
            }
        } else {
            console.log("No action_link returned.");
        }
    }
}

testRedirect();
