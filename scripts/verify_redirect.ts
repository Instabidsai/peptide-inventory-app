
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.38.4";
import "https://deno.land/std@0.208.0/dotenv/load.ts";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL") || "";
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "";

if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
    console.error("Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY");
    Deno.exit(1);
}

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

async function testRedirect() {
    const testEmail = "test-redirect-verification@example.com";
    const targetOrigin = "https://stock-scribe-star.lovable.app";

    console.log(`Testing invite generation with redirect_origin: ${targetOrigin}`);

    // Call the Edge Function directly to isolate backend behavior
    const { data, error } = await supabase.functions.invoke('invite-user', {
        body: {
            email: testEmail,
            contact_id: "00000000-0000-0000-0000-000000000000", // Dummy ID
            tier: "Family (Free)",
            redirect_origin: targetOrigin
        }
    });

    if (error) {
        console.error("Function call failed:", error);
    } else {
        console.log("Function returned data:", JSON.stringify(data, null, 2));

        if (data.action_link) {
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
                console.log("POSSIBLE CAUSE: The target URL is not in the Supabase 'Allowed Redirect URLs' list.");
            }
        } else {
            console.log("No action_link returned.");
        }
    }
}

testRedirect();
