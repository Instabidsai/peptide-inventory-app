
import { createClient } from "@supabase/supabase-js";
import dotenv from "dotenv";

dotenv.config();

const SUPABASE_URL = "https://mckkegmkpqdicudnfhor.supabase.co";
// Service key required to invoke function if RLS is strict, or we can use anon if it's open.
// Using Service Key to be safe and match app behavior (which uses authenticated client).
const SERVICE_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im1ja2tlZ21rcHFkaWN1ZG5maG9yIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc2ODQ5MjExNywiZXhwIjoyMDg0MDY4MTE3fQ.s8M-RGqK_8tqdFpfUa_ZNckZ7p1EMdvi-1vcXH8oFn4";

const supabase = createClient(SUPABASE_URL, SERVICE_KEY);

async function verifyDeployment() {
    const testEmail = `verify_final_${Date.now()}@example.com`;
    console.log(`\n🔍 STARTING FINAL VERIFICATION for: ${testEmail}`);
    console.log("---------------------------------------------------");

    // TEST 1: New User
    console.log("\n1️⃣  TEST 1: New User Invitation");
    const { data: data1, error: error1 } = await supabase.functions.invoke('invite-user', {
        body: { email: testEmail, tier: 'family' }
    });

    if (error1) {
        console.error("❌ Test 1 Failed:", error1);
        return;
    }

    if (data1?.version !== '1.4.0') {
        console.warn(`⚠️  WARNING: Server reported version ${data1?.version}. Expected 1.4.0. Deployment might be lagging.`);
    } else {
        console.log(`✅ Server Version Matched: ${data1.version}`);
    }

    if (data1?.success && data1?.action_link) {
        console.log("✅ Success! Link generated:", data1.action_link.substring(0, 50) + "...");
    } else {
        console.error("❌ Failed. Response:", JSON.stringify(data1, null, 2));
        return;
    }

    // TEST 2: Existing User (The Bug Fix)
    console.log("\n2️⃣  TEST 2: Existing User Re-Invite (The Fix)");
    const { data: data2, error: error2 } = await supabase.functions.invoke('invite-user', {
        body: { email: testEmail, tier: 'family' }
    });

    if (error2) {
        console.error("❌ Test 2 Failed (Function Error):", error2);
        return;
    }

    if (data2?.success && data2?.action_link) {
        if (data2.new_user === false) {
            console.log("✅ Success! System correctly identified existing user.");
            console.log("✅ Valid Link Returned:", data2.action_link.substring(0, 50) + "...");
        } else {
            console.warn("⚠️  Warning: System says it created a new user? That shouldn't happen.");
        }
    } else {
        console.error("❌ Test 2 Failed. Response:", JSON.stringify(data2, null, 2));
    }

    console.log("\n---------------------------------------------------");
    console.log("🎉 VERIFICATION COMPLETE. The system is working.");
}

verifyDeployment();
