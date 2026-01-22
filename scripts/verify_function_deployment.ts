
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const PROJECT_REF = 'mckkegmkpqdicudnfhor'; // From screenshots
const FUNCTION_URL = `https://${PROJECT_REF}.supabase.co/functions/v1/exchange-token`;

console.log(`Checking deployment status for: ${FUNCTION_URL}`);

async function checkDeployment() {
    try {
        // We invoke it without a token. 
        // If deployed, it should return 400 (Token required) or 401 (Auth required) or 200.
        // If NOT deployed, it usually returns 404 or 5xx.

        // Using fetch directly is simpler for checking existence
        const response = await fetch(FUNCTION_URL, {
            method: 'POST',
            body: JSON.stringify({}),
            headers: { 'Content-Type': 'application/json' }
        });

        console.log(`Status Code: ${response.status}`);

        if (response.status === 404) {
            console.log("Function NOT FOUND (404). It is likely NOT deployed.");
            process.exit(1);
        } else if (response.status === 500 || response.status === 503) {
            console.log("Function Error (5xx). It might be deployed but crashing.");
            // This is technically 'deployed' but broken.
            process.exit(0);
        } else {
            console.log("Function IS reachable!");
            const text = await response.text();
            console.log("Response:", text);
            process.exit(0);
        }

    } catch (e) {
        console.error("Connection failed:", e.message);
        process.exit(1);
    }
}

checkDeployment();
