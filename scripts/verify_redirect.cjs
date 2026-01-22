
const { createClient } = require('@supabase/supabase-js');
const dotenv = require('dotenv');
const path = require('path');

const SUPABASE_URL = "https://mckkegmkpqdicudnfhor.supabase.co";
const SUPABASE_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im1ja2tlZ21rcHFkaWN1ZG5maG9yIiwicm9sZSI6ImFub24iLCJpYXQiOjE3Njg0OTIxMTcsImV4cCI6MjA4NDA2ODExN30.Amo1Aw6I_JnDGiSmfoIhkcBmemkKl73kcfuHAPdX_rU";

console.log(`Using Supabase URL: ${SUPABASE_URL}`);
const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);

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
                if (redirectParam && redirectParam.includes('id-preview')) {
                    console.log("CONFIRMED: Falls back to Preview URL. Likely whitelist issue.");
                }
            }
        } else {
            console.log("No action_link returned.");
        }
    }
}

testRedirect();
