import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
dotenv.config();

const supabaseUrl = process.env.VITE_SUPABASE_URL || "https://mckkegmkpqdicudnfhor.supabase.co";
// Using Service Key to simulate different users easily
const serviceKey = process.env.SUPABASE_SERVICE_KEY || "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im1ja2tlZ21rcHFkaWN1ZG5maG9yIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc2ODQ5MjExNywiZXhwIjoyMDg0MDY4MTE3fQ.s8M-RGqK_8tqdFpfUa_ZNckZ7p1EMdvi-1vcXH8oFn4";

const supabase = createClient(supabaseUrl, serviceKey);

async function testThread() {
    console.log("1. Setup: Get a Request ID");
    const { data: requests } = await supabase.from('client_requests').select('id, user_id').limit(1);
    if (!requests || requests.length === 0) {
        console.error("No requests found to test with.");
        return;
    }
    const req = requests[0];
    const requestId = req.id;
    const clientUserId = req.user_id;

    console.log(`Testing with Request: ${requestId}`);

    // Clean up old replies for this request to verify clean slate (optional, but good for clarity)
    // await supabase.from('request_replies').delete().eq('request_id', requestId); 

    console.log("2. Client replies 'Hello Admin'");
    const { error: clientErr } = await supabase.from('request_replies').insert({
        request_id: requestId,
        user_id: clientUserId,
        message: "Hello Admin, is this working?",
        is_internal: false
    });
    if (clientErr) console.error("Client Insert Error:", clientErr);
    else console.log("✅ Client Message Sent");

    console.log("3. Admin replies 'Yes it is' (Public)");
    // Ideally we'd use a different user_id for admin, but for now we trust the ID provided.
    // Let's find an admin user.
    const { data: admins } = await supabase.from('profiles').select('user_id').eq('role', 'admin').limit(1);
    const adminId = admins?.[0]?.user_id || clientUserId; // Fallback if no admin found

    const { error: adminErr } = await supabase.from('request_replies').insert({
        request_id: requestId,
        user_id: adminId,
        message: "Yes, this is the admin replying.",
        is_internal: false
    });
    if (adminErr) console.error("Admin Insert Error:", adminErr);
    else console.log("✅ Admin Public Message Sent");

    console.log("4. Admin adds Internal Note 'User is difficult' (Internal)");
    const { error: internalErr } = await supabase.from('request_replies').insert({
        request_id: requestId,
        user_id: adminId,
        message: "Internal Note: Monitor this thread.",
        is_internal: true
    });
    if (internalErr) console.error("Internal Insert Error:", internalErr);
    else console.log("✅ Admin Internal Note Sent");

    console.log("5. Verification: Fetch Messages");
    const { data: messages } = await supabase.from('request_replies').select('*').eq('request_id', requestId).order('created_at');

    console.log("\n--- Thread History ---");
    messages?.forEach(m => {
        console.log(`[${m.is_internal ? 'INTERNAL' : 'PUBLIC'}] ${m.user_id === adminId ? 'ADMIN' : 'CLIENT'}: ${m.message}`);
    });

    if (messages?.length === 3) console.log("\n✅ SUCCESS: All 3 messages recorded.");
    else console.log(`\n❌ FAIL: Expected 3 messages, found ${messages?.length}`);
}

testThread();
